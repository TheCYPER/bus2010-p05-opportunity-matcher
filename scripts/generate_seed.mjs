#!/usr/bin/env node
// Generates the synthetic seed for the shared BUS2010 database.
//   node scripts/generate_seed.mjs              write supabase/seed/*.sql and src/ai-signals.js
//   node scripts/generate_seed.mjs --calibrate  only print AI score distributions
// Deterministic (fixed seed). Recommendations are computed by src/engine.js, the same
// code the prototype runs; embeddings come from the pretrained Supabase/gte-small model.
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, readdirSync, unlinkSync } from 'node:fs';
import { buildWorld, addDays } from './lib/build_world.mjs';
import { embedTexts, cosine, MODEL } from './lib/embedder.mjs';
import { lit, arr, json, vec, insert } from './lib/sql.mjs';

const require = createRequire(import.meta.url);
const DATA = require('../src/data.js');
const E = require('../src/engine.js');
const CALIBRATE = process.argv.includes('--calibrate');
const log = (...a) => console.log(...a);

const W = buildWorld(DATA);
const R = W.R;
const DEMO_STUDENTS = ['COOP-B001', 'COOP-B002', 'COOP-B003', 'COOP-B004', 'COOP-B005', 'COOP-B006'];
const DEMO_OPPS = DATA.listings.map((l) => l.opportunity_id);

// ---------- engine-shaped views of the world ----------
const usable = W.profiles.filter((p) => p.status === 'submitted' || p.status === 'reviewed');
const nameOf = Object.fromEntries(W.students.map((s) => [s.student_id, s.full_name]));
const toEngineProfile = (p) => ({ student_id: p.student_id, name: nameOf[p.student_id], profile_version: p.profile_version, published_at: p.published_at,
  change_note: p.change_note, goals: p.goals, sectors: p.sectors, roles: p.roles, locations: p.locations, work_arrangements: p.work_arrangements,
  availability: { start: p.available_from, end: p.available_to }, skills: p.skills, unmapped_skills: p.unmapped });
const current = new Map();
usable.forEach((p) => { const c = current.get(p.student_id); if (!c || c.profile_version < p.profile_version) current.set(p.student_id, p); });
const employerName = Object.fromEntries(W.employers.map((e) => [e.employer_id, e.name]));
const listingRows = new Map(W.listings.map((l) => [l.opportunity_id, l]));
const engineListings = W.listings.map((l) => {
  const versions = {};
  W.oppVersions.filter((v) => v.opportunity_id === l.opportunity_id).forEach((v) => {
    versions[v.version] = { title: v.title, employer: employerName[v.employer_id], city: v.city, work_arrangement: v.work_arrangement, start_date: v.start_date,
      end_date: v.end_date, sector: v.sector, role_family: v.role_family, description: v.description, mandatory: v.mandatory, desirable: v.desirable };
  });
  return { opportunity_id: l.opportunity_id, approved_version: l.approved_version, listing_status: l.listing_status, closed_on: l.closed_on, versions };
});
const vocab = W.skills.map((s) => ({ skill_id: s.skill_id, label: s.label, synonyms: s.synonyms }));

// ---------- embeddings ----------
const skillText = (s) => `${s.label}: ${s.synonyms.join(', ')}`;
const oppText = (v) => `${v.title} (${v.sector}). ${v.description}${v.tasks && v.tasks.length ? ' Tasks: ' + v.tasks.join('; ') + '.' : ''}`;
const listedVersions = W.oppVersions.filter((v) => listingRows.has(v.opportunity_id));
const goals = [...new Set(usable.map((p) => p.goals).filter(Boolean))];
const phrases = [...new Set(W.profiles.flatMap((p) => p.unmapped))];
const texts = [...W.skills.map(skillText), ...goals, ...listedVersions.map(oppText), ...phrases];
const EMB = await embedTexts(texts, { log });

const skillVec = W.skills.map((s) => ({ skill_id: s.skill_id, v: EMB.get(skillText(s)) }));
function nearestSkills(text, k = 3) {
  const q = EMB.get(text);
  return skillVec.map((s) => ({ skill_id: s.skill_id, score: Math.round(cosine(q, s.v) * 1e4) / 1e4 }))
    .sort((a, b) => b.score - a.score).slice(0, k);
}
const AI = { model: MODEL, source: 'precomputed', goals: {}, phrases: {} };
goals.forEach((g) => {
  const q = EMB.get(g); const row = {};
  listedVersions.forEach((v) => { row[`${v.opportunity_id}@${v.version}`] = Math.round(cosine(q, EMB.get(oppText(v))) * 1e4) / 1e4; });
  AI.goals[E.textKey(g)] = row;
});
phrases.forEach((ph) => { AI.phrases[ph] = nearestSkills(ph); });

if (CALIBRATE) {
  const all = [];
  current.forEach((p) => { if (!p.goals) return; const row = AI.goals[E.textKey(p.goals)]; W.listings.filter((l) => l.listing_status === 'open').forEach((l) => all.push(row[`${l.opportunity_id}@${l.approved_version}`])); });
  all.sort((a, b) => a - b);
  const q = (x) => all[Math.floor(x * (all.length - 1))].toFixed(4);
  log('goal x open listing cosine: n', all.length, 'p10', q(0.1), 'p50', q(0.5), 'p75', q(0.75), 'p90', q(0.9), 'p97', q(0.97), 'max', q(1));
  phrases.forEach((ph) => log(ph.padEnd(34), AI.phrases[ph].map((s) => `${s.skill_id} ${s.score}`).join('  ')));
  DEMO_STUDENTS.forEach((sid) => { const p = current.get(sid); log(sid, DEMO_OPPS.map((o) => { const l = listingRows.get(o); return `${o}:${AI.goals[E.textKey(p.goals)][`${o}@${l.approved_version}`]}`; }).join(' ')); });
  process.exit(0);
}

// ---------- recommendations (engine) ----------
const RULES = E.DEFAULT_METHODS.find((m) => m.method_version === 'rules-1.0.0');
const AIM = E.DEFAULT_METHODS.find((m) => m.method_version === 'ai-embed-1.0.0');
const lookup = E.aiLookup(AI);
const recs = new Map();
const topByStudent = {};
function rankFor(profile, method) {
  return E.rank(engineListings.map((L) => { const r = E.evaluate(profile, L, method, vocab, lookup); r.recommendation_id = E.recordIdFor(r); return r; }));
}
current.forEach((p, sid) => {
  // D7: COOP-B005 has stored results at v3 only; v4 was published afterwards.
  const prof = sid === 'COOP-B005' ? usable.find((x) => x.student_id === sid && x.profile_version === 3) : p;
  const at = sid === 'COOP-B005' ? '2026-10-20T09:00:00Z' : '2026-11-15T20:00:00Z';
  [RULES, AIM].forEach((m) => {
    const ranked = rankFor(toEngineProfile(prof), m);
    ranked.forEach((r, i) => {
      const keep = i < 10 || (DEMO_STUDENTS.includes(sid) && DEMO_OPPS.includes(r.opportunity_id));
      if (keep && r.opportunity_version != null) recs.set(r.recommendation_id, { ...r, rank: i + 1, computed_at: at });
    });
    if (m === RULES) topByStudent[sid] = { ranked, at };
  });
});

// ---------- P04 applications, events, placements; P07 logs ----------
const openListings = W.listings.filter((l) => l.listing_status === 'open');
const oppById = new Map(listedVersions.map((v) => [`${v.opportunity_id}@${v.version}`, v]));
const applications = [], events = [], placements = [], logs = [];
const PATH = { submitted: ['submitted'], under_review: ['submitted', 'under_review'], interview: ['submitted', 'under_review', 'interview'],
  offer: ['submitted', 'under_review', 'interview', 'offer'], accepted: ['submitted', 'under_review', 'interview', 'offer', 'accepted'],
  not_selected: ['submitted', 'under_review', 'not_selected'], withdrawn: ['submitted', 'withdrawn'] };
let appSeq = 0;
const nextAppId = () => { appSeq++; if (appSeq === 28) appSeq++; return `APP-${String(appSeq).padStart(3, '0')}`; };
function addApplication(id, sid, l, profile_version, final, startDay) {
  const v = oppById.get(`${l.opportunity_id}@${l.approved_version}`);
  applications.push({ application_id: id, student_id: sid, opportunity_id: l.opportunity_id, opportunity_version: l.approved_version, profile_version, status: final });
  let day = startDay;
  PATH[final].forEach((st) => {
    const actor = st === 'submitted' || st === 'withdrawn' || st === 'accepted' ? `Student ${sid}` : `Employer: ${employerName[v.employer_id]}`;
    events.push({ application_id: id, status: st, actor, note: st === 'accepted' ? 'Offer accepted; waiting for co-op office confirmation' : null, at: `${day}T10:00:00Z` });
    day = addDays(day, R.int(2, 6)); if (day > '2026-11-15') day = '2026-11-15';
  });
  return day;
}
addApplication('APP-028', 'COOP-B001', listingRows.get('OP-028'), 3, 'submitted', '2026-11-10');
const placementIds = new Set(['EG-DXB-028']);
current.forEach((p, sid) => {
  if (DEMO_STUDENTS.includes(sid) || !R.chance(0.68)) return;
  const liked = openListings.filter((l) => p.sectors.includes(oppById.get(`${l.opportunity_id}@${l.approved_version}`).sector));
  const chosen = new Set();
  const n = R.int(1, 4);
  while (chosen.size < n) chosen.add(R.chance(0.75) && liked.length ? R.pick(liked) : R.pick(openListings));
  let accepted = false;
  [...chosen].forEach((l) => {
    let final = R.weighted([['submitted', 30], ['under_review', 24], ['interview', 14], ['offer', 5], ['accepted', 12], ['not_selected', 9], ['withdrawn', 6]]);
    if (final === 'accepted' && accepted) final = 'withdrawn';
    if (final === 'accepted') accepted = true;
    const id = nextAppId();
    const end = addApplication(id, sid, l, p.profile_version, final, addDays('2026-10-05', R.int(0, 30)));
    if (final === 'accepted') {
      const v = oppById.get(`${l.opportunity_id}@${l.approved_version}`);
      const initials = employerName[v.employer_id].replace(/[^A-Za-z ]/g, '').split(' ').filter(Boolean).map((w) => w[0].toUpperCase()).slice(0, 3).join('').padEnd(2, 'X');
      const code = { 'Abu Dhabi': 'AUH', Dubai: 'DXB', Sharjah: 'SHJ', 'Al Ain': 'AAN', 'Ras Al Khaimah': 'RAK', Ajman: 'AJM', Fujairah: 'FUJ', Remote: 'REM' }[v.city] || 'UAE';
      let pid = `${initials}-${code}-${l.opportunity_id.slice(3)}`;
      for (let k = 2; placementIds.has(pid); k++) pid = `${initials}-${code}-${l.opportunity_id.slice(3)}-${k}`;
      placementIds.add(pid);
      placements.push({ placement_id: pid, application_id: id, student_id: sid, opportunity_id: l.opportunity_id, confirmed_by: 'Co-op office: A. Rahman (synthetic)', confirmed_at: `${end}T12:00:00Z`, v });
    }
  });
});
let logSeq = 0;
placements.forEach((pl) => {
  const weeks = ['Pre-placement plan', '2027 week 2', '2027 week 4', '2027 week 6'].slice(0, R.int(1, 4));
  weeks.forEach((period, i) => {
    const ev = W.evidence.filter((e) => e.student_id === pl.student_id && e.review_outcome === 'demonstrated').slice(0, 2).map((e) => e.evidence_id);
    logs.push({ log_id: `LOG-${String(++logSeq).padStart(4, '0')}`, placement_id: pl.placement_id, period, goal_id: `G-${i + 1}`,
      entry: i === 0 ? `Goals for ${pl.v.title}: learn the team's tools, deliver one piece of analysis, present it.` : `Simulated future entry: worked on "${pl.v.tasks[i % pl.v.tasks.length] || 'team tasks'}".`,
      evidence_ids: ev, feedback: i === 0 ? null : R.pick(['Good progress', 'Please add evidence for the second goal', 'Clear write-up']),
      review_status: i === 0 ? 'reviewed' : R.pick(['submitted', 'reviewed', 'revision_requested']) });
  });
});

// ---------- P05 gap events and challenges; P06 evidence for gaps ----------
const gaps = [], challenges = [];
let gapSeq = 0, chSeq = 0;
// A student sends a gap from one of their better "one thing to do" or "not a fit now" results.
Object.entries(topByStudent).forEach(([sid, { ranked, at }]) => {
  if (DEMO_STUDENTS.includes(sid) || !R.chance(0.7)) return;
  const cands = ranked.slice(0, 40).filter((r) => r.status === 'cannot_confirm' || r.status === 'not_eligible')
    .flatMap((r) => r.gaps.filter((g) => g.requirement === 'mandatory').map((g) => ({ r, g })));
  const seen = new Set();
  cands.slice(0, R.int(1, 3)).forEach(({ r, g }) => {
    if (seen.has(g.skill_id)) return; seen.add(g.skill_id);
    if (!recs.has(r.recommendation_id)) recs.set(r.recommendation_id, { ...r, rank: ranked.indexOf(r) + 1, computed_at: at });
    const gap_id = `GAP-${String(++gapSeq).padStart(4, '0')}`;
    const status = R.weighted([['sent', 45], ['acknowledged', 35], ['resolved', 20]]);
    gaps.push({ gap_id, recommendation_id: r.recommendation_id, student_id: sid, skill_id: g.skill_id, opportunity_id: r.opportunity_id, requirement: g.requirement, status, created_at: `${addDays('2026-11-01', R.int(0, 13))}T09:30:00Z` });
    if (status !== 'sent') {
      const outcome = status === 'acknowledged' ? R.pick(['pending', 'revision_requested']) : R.pick(['demonstrated', 'demonstrated', 'not_demonstrated']);
      W.newEvidence(sid, g.skill_id, outcome === 'pending' ? null : '2026-11-14', { gap_id, review_outcome: outcome, reviewer: outcome === 'pending' ? null : W.R.pick(['Dr. R. Mensah (synthetic)', 'Ms. H. Al Zaabi (synthetic)']), activity: `Gap task for ${W.skillLabel[g.skill_id]} (from ${gap_id})` });
    }
  });
});
const QUESTIONS = ['I used this skill in my capstone project. Why does it show as missing?', 'My dates are on my profile. Why can this not be confirmed?',
  'Why is this job below one I care less about?', 'Does a skill I listed myself count at all?', 'The job is hybrid. Why am I not a fit?'];
const ANSWERS = ['Checked: the skill is self-declared, so it counts as nice to have only. I sent it to P06 for a short review.',
  'Your end date is missing in the submitted profile version. Please add it in P01; the result updates after that.',
  'Order within the same status follows your sector and role choices. I left a note for P01 to update your interests.'];
[...recs.values()].filter((r) => r.method_version === 'rules-1.0.0' && !DEMO_STUDENTS.includes(r.student_id))
  .filter(() => R.chance(0.008)).slice(0, 25).forEach((r) => {
    const reviewed = R.chance(0.4);
    challenges.push({ challenge_id: `CH-${String(++chSeq).padStart(3, '0')}`, recommendation_id: r.recommendation_id, raised_by: r.student_id, question: R.pick(QUESTIONS),
      status: reviewed ? 'reviewed' : 'open', resolution: reviewed ? R.pick(ANSWERS) : null, resolved_by: reviewed ? W.coordinator : null, resolved_at: reviewed ? '2026-11-14T13:00:00Z' : null });
  });

// ---------- coordinator labels (provisional stand-in, see docs) ----------
const LABELS = {
  'COOP-B001': { 'OP-028': 'good_fit', 'OP-026': 'possible', 'OP-027': 'possible', 'OP-029': 'not_fit', 'OP-031': 'not_fit' },
  'COOP-B002': { 'OP-027': 'good_fit', 'OP-026': 'possible', 'OP-028': 'possible', 'OP-029': 'not_fit', 'OP-031': 'not_fit' },
  'COOP-B003': { 'OP-028': 'good_fit', 'OP-026': 'possible', 'OP-027': 'not_fit', 'OP-029': 'not_fit', 'OP-031': 'not_fit' },
  'COOP-B004': { 'OP-029': 'good_fit', 'OP-027': 'possible', 'OP-028': 'not_fit', 'OP-026': 'not_fit', 'OP-031': 'not_fit' },
  'COOP-B005': { 'OP-031': 'good_fit', 'OP-026': 'possible', 'OP-028': 'possible', 'OP-027': 'not_fit', 'OP-029': 'not_fit' },
  'COOP-B006': { 'OP-029': 'possible', 'OP-028': 'not_fit', 'OP-026': 'not_fit', 'OP-027': 'not_fit', 'OP-031': 'not_fit' }
};
const LABELLER = 'Team 5 stand-in (provisional, not a coordinator)';

// ---------- SQL ----------
const OUT = new URL('../supabase/seed/', import.meta.url);
mkdirSync(OUT, { recursive: true });
readdirSync(OUT).filter((f) => f.endsWith('.sql')).forEach((f) => unlinkSync(new URL(f, OUT)));
const files = {};
const header = (t) => `-- ${t}\n-- Generated by scripts/generate_seed.mjs. Synthetic data only; do not edit by hand.\n\n`;

files['01_reference.sql'] = header('Skills, learning modules, employers, students') + [
  insert('skills', ['skill_id', 'label', 'synonyms', 'category'], W.skills.map((s) => [lit(s.skill_id), lit(s.label), arr(s.synonyms), lit(s.category)])),
  insert('learning_modules', ['module_id', 'skill_id', 'title', 'outcome'], W.modules.map((m) => [lit(m.module_id), lit(m.skill_id), lit(m.title), lit(m.outcome)])),
  insert('employers', ['employer_id', 'name', 'sector', 'city'], W.employers.map((e) => [lit(e.employer_id), lit(e.name), lit(e.sector), lit(e.city)])),
  insert('students', ['student_id', 'full_name', 'programme', 'year'], W.students.map((s) => [lit(s.student_id), lit(s.full_name), lit(s.programme), lit(s.year)]))
].join('\n\n') + '\n';

// Evidence goes first: a reviewed profile skill must point at demonstrated evidence (trigger in the hardening migration).
files['02_profiles.sql'] = header('P06 skill evidence; P01 profile versions, skills and unmapped phrases') + [
  insert('skill_evidence', ['evidence_id', 'student_id', 'skill_id', 'module_id', 'gap_id', 'activity', 'review_outcome', 'reviewer', 'reviewed_at'], W.evidence.map((e) => [lit(e.evidence_id), lit(e.student_id), lit(e.skill_id), lit(e.module_id), lit(e.gap_id), lit(e.activity), lit(e.review_outcome), lit(e.reviewer), lit(e.reviewed_at)])),
  insert('profile_versions', ['student_id', 'profile_version', 'status', 'goals', 'sectors', 'roles', 'locations', 'work_arrangements', 'available_from', 'available_to', 'change_note', 'coordinator_comment', 'published_at'],
    W.profiles.map((p) => [lit(p.student_id), lit(p.profile_version), lit(p.status), lit(p.goals), arr(p.sectors), arr(p.roles), arr(p.locations), arr(p.work_arrangements), lit(p.available_from), lit(p.available_to), lit(p.change_note), lit(p.coordinator_comment), lit(p.published_at)])),
  insert('profile_skills', ['student_id', 'profile_version', 'skill_id', 'source', 'evidence_id', 'review_date'],
    W.profiles.flatMap((p) => p.skills.map((s) => [lit(p.student_id), lit(p.profile_version), lit(s.skill_id), lit(s.source), lit(s.evidence_id), lit(s.review_date)]))),
  insert('profile_unmapped_skills', ['student_id', 'profile_version', 'phrase'], W.profiles.flatMap((p) => p.unmapped.map((u) => [lit(p.student_id), lit(p.profile_version), lit(u)])))
].join('\n\n') + '\n';

const condRows = [];
W.oppVersions.forEach((v) => ['mandatory', 'desirable'].forEach((req) => v[req].forEach((c, i) => condRows.push([lit(v.opportunity_id), lit(v.version), lit(req), lit(i), lit(c.kind), lit(c.skill_id || null), c.arrangements ? arr(c.arrangements) : 'null', lit(c.city || null)]))));
files['03_opportunities.sql'] = header('P02 opportunity versions and conditions; P03 reviews and listings') + [
  insert('opportunity_versions', ['opportunity_id', 'version', 'employer_id', 'title', 'sector', 'role_family', 'city', 'work_arrangement', 'start_date', 'end_date', 'description', 'tasks', 'supervisor_name', 'submission_status', 'submitted_at'],
    W.oppVersions.map((v) => [lit(v.opportunity_id), lit(v.version), lit(v.employer_id), lit(v.title), lit(v.sector), lit(v.role_family), lit(v.city), lit(v.work_arrangement), lit(v.start_date), lit(v.end_date), lit(v.description), arr(v.tasks), lit(v.supervisor_name), lit(v.submission_status), lit(v.submitted_at)])),
  insert('opportunity_conditions', ['opportunity_id', 'version', 'requirement', 'position', 'kind', 'skill_id', 'arrangements', 'city'], condRows),
  insert('listing_reviews', ['review_id', 'opportunity_id', 'version', 'decision', 'reviewer', 'reason', 'decided_at'], W.reviews.map((r) => [lit(r.review_id), lit(r.opportunity_id), lit(r.version), lit(r.decision), lit(r.reviewer), lit(r.reason), lit(r.decided_at)])),
  insert('listings', ['opportunity_id', 'approved_version', 'listing_status', 'published_at', 'closed_on'], W.listings.map((l) => [lit(l.opportunity_id), lit(l.approved_version), lit(l.listing_status), lit(l.published_at), lit(l.closed_on)]))
].join('\n\n') + '\n';

files['04_applications.sql'] = header('P04 applications, status history and placements') + [
  insert('applications', ['application_id', 'student_id', 'opportunity_id', 'opportunity_version', 'profile_version', 'status'], applications.map((a) => [lit(a.application_id), lit(a.student_id), lit(a.opportunity_id), lit(a.opportunity_version), lit(a.profile_version), lit(a.status)])),
  insert('application_events', ['application_id', 'status', 'actor', 'note', 'at'], events.map((e) => [lit(e.application_id), lit(e.status), lit(e.actor), lit(e.note), lit(e.at)])),
  insert('placements', ['placement_id', 'application_id', 'student_id', 'opportunity_id', 'confirmed_by', 'confirmed_at'], placements.map((p) => [lit(p.placement_id), lit(p.application_id), lit(p.student_id), lit(p.opportunity_id), lit(p.confirmed_by), lit(p.confirmed_at)]))
].join('\n\n') + '\n';

const methods = E.DEFAULT_METHODS.map((m) => [lit(m.method_version), lit(m.family), lit(m.label), json(m.weights), json(m.params || {}), lit(m.model || null), lit(m.note)]);
const recRows = [...recs.values()].map((r) => [lit(r.recommendation_id), lit(r.student_id), lit(r.profile_version), lit(r.opportunity_id), lit(r.opportunity_version), lit(r.method_version), lit(r.status), lit(r.status_reason), lit(r.rank), lit(r.pref_points),
  json(r.reasons), json(r.gaps), json(r.unknowns), json(r.mandatory), json(r.desirable), json(r.ai_notes), lit(r.computed_at)]);
files['05_matching.sql'] = header('P05 methods, recommendations, gap events, challenges, coordinator labels') + [
  insert('match_methods', ['method_id', 'family', 'label', 'weights', 'params', 'model', 'notes'], methods),
  insert('recommendations', ['recommendation_id', 'student_id', 'profile_version', 'opportunity_id', 'opportunity_version', 'method_id', 'status', 'status_reason', 'rank', 'pref_points', 'reasons', 'gaps', 'unknowns', 'mandatory', 'desirable', 'ai_notes', 'computed_at'], recRows, 250),
  insert('skill_gap_events', ['gap_id', 'recommendation_id', 'student_id', 'skill_id', 'opportunity_id', 'requirement', 'status', 'created_at'], gaps.map((g) => [lit(g.gap_id), lit(g.recommendation_id), lit(g.student_id), lit(g.skill_id), lit(g.opportunity_id), lit(g.requirement), lit(g.status), lit(g.created_at)])),
  insert('recommendation_challenges', ['challenge_id', 'recommendation_id', 'raised_by', 'question', 'status', 'resolution', 'resolved_by', 'resolved_at'], challenges.map((c) => [lit(c.challenge_id), lit(c.recommendation_id), lit(c.raised_by), lit(c.question), lit(c.status), lit(c.resolution), lit(c.resolved_by), lit(c.resolved_at)])),
  insert('coordinator_labels', ['student_id', 'opportunity_id', 'label', 'labelled_by', 'note'], Object.entries(LABELS).flatMap(([sid, m]) => Object.entries(m).map(([o, lab]) => [lit(sid), lit(o), lit(lab), lit(LABELLER), lit('Provisional label for the Sprint 2 comparison; replace with a real coordinator judgement')])))
].join('\n\n') + '\n';

files['06_logs.sql'] = header('P07 learning logs') + [
  insert('learning_logs', ['log_id', 'placement_id', 'period', 'goal_id', 'entry', 'evidence_ids', 'feedback', 'review_status'], logs.map((l) => [lit(l.log_id), lit(l.placement_id), lit(l.period), lit(l.goal_id), lit(l.entry), arr(l.evidence_ids), lit(l.feedback), lit(l.review_status)]))
].join('\n\n') + '\n';

const embRows = [
  ...W.skills.map((s) => ['skill', s.skill_id, skillText(s)]),
  ...usable.filter((p) => p.goals).map((p) => ['goal', `${p.student_id}@${p.profile_version}`, p.goals]),
  ...listedVersions.map((v) => ['opportunity', `${v.opportunity_id}@${v.version}`, oppText(v)]),
  ...phrases.map((ph) => ['phrase', ph, ph])
];
files['07_ai_embeddings.sql'] = header(`P05 sentence embeddings (${MODEL}, 384 dims)`) +
  insert('ai_embeddings', ['kind', 'ref_id', 'model', 'source_text', 'embedding'], embRows.map(([k, id, t]) => [lit(k), lit(id), lit(MODEL), lit(t), vec(EMB.get(t))]), 100) + '\n';

Object.entries(files).forEach(([name, sql]) => writeFileSync(new URL(name, OUT), sql));

// ---------- offline AI signals for the demo slice (used when the database is unreachable) ----------
const demoGoals = {}; const demoPhrases = {};
DATA.profiles.forEach((p) => {
  const row = AI.goals[E.textKey(p.goals)]; const slim = {};
  DATA.listings.forEach((l) => Object.keys(l.versions).forEach((v) => { slim[`${l.opportunity_id}@${v}`] = row[`${l.opportunity_id}@${v}`]; }));
  demoGoals[E.textKey(p.goals)] = slim;
  (p.unmapped_skills || []).forEach((ph) => { demoPhrases[ph] = AI.phrases[ph]; });
});
writeFileSync(new URL('../src/ai-signals.js', import.meta.url), `/*
 * P05 AI signals for the six demo students and six demo listings (generated by scripts/generate_seed.mjs).
 * Real outputs of the pretrained ${MODEL} sentence-embedding model, precomputed so the
 * prototype still shows the AI method when the shared database cannot be reached.
 * goals: cosine(goal text, job text) keyed by textKey(goal) and 'OP-xxx@version'; phrases: 3 nearest vocabulary skills.
 */
(function (root, factory) {
  var ai = factory();
  if (typeof module === 'object' && module.exports) module.exports = ai;
  else root.P05_AI_SIGNALS = ai;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  return ${JSON.stringify({ model: MODEL, source: 'precomputed', generated: '2026-11-16', goals: demoGoals, phrases: demoPhrases }, null, 2)};
});
`);

log('counts', {
  skills: W.skills.length, employers: W.employers.length, students: W.students.length, profile_versions: W.profiles.length,
  opportunity_versions: W.oppVersions.length, listings: W.listings.length, open: W.listings.filter((l) => l.listing_status === 'open').length,
  reviews: W.reviews.length, applications: applications.length, events: events.length, placements: placements.length,
  recommendations: recs.size, gaps: gaps.length, challenges: challenges.length, evidence: W.evidence.length, logs: logs.length, embeddings: embRows.length
});
