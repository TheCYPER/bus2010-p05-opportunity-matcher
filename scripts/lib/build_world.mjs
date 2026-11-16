// Builds the synthetic BUS2010 world as plain objects (no SQL here).
// Deterministic: the same seed always gives the same records.
// The six demo students (COOP-B001..B006) and six demo listings (OP-026..OP-031)
// are copied unchanged from src/data.js so the seeded defects D1-D8 hold in the database.
import {
  SKILL_CATEGORY, NEW_SKILLS, SECTORS, SECTOR_WEIGHTS, ROLES, CITIES, PROGRAMMES, FIRST_NAMES, LAST_NAMES,
  EMPLOYER_PREFIX, PHRASES, REVIEWERS, COORDINATOR, P03_REVIEWERS
} from './world.mjs';

export function rng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const R = {
    next,
    chance: (p) => next() < p,
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    sample: (arr, n) => { const c = arr.slice(); const out = []; while (out.length < n && c.length) out.push(c.splice(Math.floor(next() * c.length), 1)[0]); return out; },
    weighted: (pairs) => { const tot = pairs.reduce((s, p) => s + p[1], 0); let r = next() * tot; for (const [v, w] of pairs) { r -= w; if (r < 0) return v; } return pairs[pairs.length - 1][0]; }
  };
  return R;
}

export function addDays(iso, n) { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
const pad = (n, w) => String(n).padStart(w, '0');
const uniq = (arr) => [...new Set(arr)];

export function buildWorld(DATA, seed = 20261116) {
  const R = rng(seed);
  const W = { skills: [], employers: [], students: [], profiles: [], oppVersions: [], reviews: [], listings: [], evidence: [], modules: [] };

  // ---------- vocabulary ----------
  DATA.vocabulary.forEach((v) => W.skills.push({ skill_id: v.skill_id, label: v.label, synonyms: v.synonyms, category: SKILL_CATEGORY[v.skill_id] }));
  NEW_SKILLS.forEach(([id, label, syn, cat]) => W.skills.push({ skill_id: id, label, synonyms: syn, category: cat }));
  const skillLabel = Object.fromEntries(W.skills.map((s) => [s.skill_id, s.label]));
  W.skills.forEach((s) => {
    const code = s.skill_id.split('-')[1];
    W.modules.push({ module_id: `MOD-${code}-01`, skill_id: s.skill_id, title: `Practice: ${s.label}`, outcome: `Show ${s.label.toLowerCase()} in a short reviewed task` });
  });
  const moduleFor = (skill_id) => `MOD-${skill_id.split('-')[1]}-01`;

  // ---------- evidence ids ----------
  const evCounter = {};
  const evidenceIndex = new Map(); // student|skill -> evidence
  function newEvidence(student_id, skill_id, reviewed_at, extra = {}) {
    const code = skill_id.split('-')[1];
    evCounter[code] = (evCounter[code] || 99) + 1;
    const e = { evidence_id: `E-${code}-${evCounter[code]}`, student_id, skill_id, module_id: moduleFor(skill_id), gap_id: null,
      activity: `Practice task: ${skillLabel[skill_id]}`, review_outcome: 'demonstrated', reviewer: R.pick(REVIEWERS), reviewed_at, ...extra };
    W.evidence.push(e);
    if (e.review_outcome === 'demonstrated') evidenceIndex.set(`${student_id}|${skill_id}`, e);
    return e;
  }

  // ---------- demo employers, listings, profiles, evidence (exactly as src/data.js) ----------
  const demoEmployerMeta = {
    'Gulf Airside Services': ['aviation', 'Dubai'], 'Falcon Freight Logistics': ['logistics', 'Abu Dhabi'], 'Emirates Group': ['aviation', 'Dubai'],
    'Oasis Civic Data Lab': ['public sector', 'Abu Dhabi'], 'Skyline Carriers': ['aviation', 'Dubai'], 'Al Noor Health Partners': ['healthcare', 'Abu Dhabi']
  };
  const employerByName = {};
  Object.keys(demoEmployerMeta).forEach((name, i) => {
    const e = { employer_id: `EMP-${pad(i + 1, 3)}`, name, sector: demoEmployerMeta[name][0], city: demoEmployerMeta[name][1] };
    W.employers.push(e); employerByName[name] = e;
  });

  const demoOppIds = new Set(DATA.listings.map((l) => l.opportunity_id));
  DATA.listings.forEach((l) => {
    const versions = Object.keys(l.versions).map(Number).sort((a, b) => a - b);
    versions.forEach((v) => {
      const r = l.versions[v];
      W.oppVersions.push({ opportunity_id: l.opportunity_id, version: v, employer_id: employerByName[r.employer].employer_id, title: r.title, sector: r.sector,
        role_family: r.role_family, city: r.city, work_arrangement: r.work_arrangement, start_date: r.start_date, end_date: r.end_date,
        description: r.description, tasks: [], supervisor_name: null, submission_status: v === versions[0] ? 'submitted' : 'resubmitted',
        submitted_at: `2026-10-${pad(5 + v * 3, 2)}T09:00:00Z`, mandatory: r.mandatory, desirable: r.desirable });
      const approved = v === l.approved_version;
      W.reviews.push({ review_id: null, opportunity_id: l.opportunity_id, version: v, decision: approved ? 'approved' : 'clarification_requested',
        reviewer: P03_REVIEWERS[0], reason: approved ? 'Meets the posting checklist' : 'Please confirm whether Tableau is really required', decided_at: `2026-10-${pad(7 + v * 3, 2)}T10:00:00Z` });
    });
    W.listings.push({ opportunity_id: l.opportunity_id, approved_version: l.approved_version, listing_status: l.listing_status,
      published_at: `2026-10-${pad(8 + l.approved_version * 3, 2)}`, closed_on: l.closed_on });
  });

  const demoStudents = [];
  DATA.profiles.forEach((p) => {
    if (!demoStudents.includes(p.student_id)) {
      demoStudents.push(p.student_id);
      W.students.push({ student_id: p.student_id, full_name: p.name, programme: 'BSc Data Science', year: 3 });
    }
    W.profiles.push({ student_id: p.student_id, profile_version: p.profile_version, status: 'submitted', goals: p.goals, sectors: p.sectors, roles: p.roles,
      locations: p.locations, work_arrangements: p.work_arrangements, available_from: p.availability.start, available_to: p.availability.end,
      change_note: p.change_note, coordinator_comment: null, published_at: p.published_at,
      skills: p.skills.map((s) => ({ ...s })), unmapped: (p.unmapped_skills || []).slice() });
  });
  DATA.evidence.forEach((e) => {
    const ev = { evidence_id: e.evidence_id, student_id: e.student_id, skill_id: e.skill_id, module_id: moduleFor(e.skill_id), gap_id: null,
      activity: e.activity, review_outcome: e.outcome, reviewer: e.reviewer, reviewed_at: e.review_date };
    W.evidence.push(ev); evidenceIndex.set(`${e.student_id}|${e.skill_id}`, ev);
  });
  W.profiles.forEach((p) => p.skills.forEach((s) => {
    if (s.source !== 'reviewed' || W.evidence.some((e) => e.evidence_id === s.evidence_id)) return;
    const ev = { evidence_id: s.evidence_id, student_id: p.student_id, skill_id: s.skill_id, module_id: moduleFor(s.skill_id), gap_id: null,
      activity: `Practice task: ${skillLabel[s.skill_id]}`, review_outcome: 'demonstrated', reviewer: 'P06 reviewer (synthetic)', reviewed_at: s.review_date };
    W.evidence.push(ev); evidenceIndex.set(`${p.student_id}|${s.skill_id}`, ev);
  }));

  // ---------- generated employers ----------
  const usedNames = new Set(W.employers.map((e) => e.name));
  while (W.employers.length < 60) {
    const sector = R.weighted(SECTOR_WEIGHTS);
    const name = `${R.pick(EMPLOYER_PREFIX)} ${R.pick(SECTORS[sector].nouns)}`;
    if (usedNames.has(name)) continue;
    usedNames.add(name);
    const city = R.weighted(CITIES.filter(([c]) => c !== 'Remote'));
    W.employers.push({ employer_id: `EMP-${pad(W.employers.length + 1, 3)}`, name, sector, city });
  }

  // ---------- generated opportunities ----------
  const startDates = [];
  for (let d = '2027-01-10'; d <= '2027-03-15'; d = addDays(d, 7)) startDates.push(d);
  let reviewSeq = 0;
  const genEmployers = W.employers.slice(6);
  for (let n = 1; n <= 240; n++) {
    const opportunity_id = `OP-${pad(n, 3)}`;
    if (demoOppIds.has(opportunity_id)) continue;
    const emp = R.pick(genEmployers);
    const sec = SECTORS[emp.sector];
    const role_family = R.pick(sec.roles);
    const role = ROLES[role_family];
    const remote = R.chance(0.08);
    const work_arrangement = remote ? 'remote' : R.weighted([['on-site', 40], ['hybrid', 48], ['remote', 12]]);
    const city = work_arrangement === 'remote' && remote ? 'Remote' : emp.city;
    const start = R.pick(startDates);
    const end = addDays(start, R.pick([91, 105, 119, 133, 150]));
    const pool = uniq(role.skills.concat(sec.skills));
    const nMand = R.weighted([[0, 6], [1, 30], [2, 40], [3, 24]]);
    const mandSkills = R.sample(role.skills, nMand);
    const desSkills = R.sample(pool.filter((s) => !mandSkills.includes(s)), R.int(1, 4));
    const mandatory = mandSkills.map((s) => ({ kind: 'skill', skill_id: s }));
    if (R.chance(0.85) && nMand > 0) mandatory.push({ kind: 'availability' });
    if (work_arrangement !== 'remote' && R.chance(0.35)) mandatory.push({ kind: 'arrangement', arrangements: work_arrangement === 'on-site' ? ['on-site'] : ['hybrid', 'on-site'], city });
    const base = {
      opportunity_id, employer_id: emp.employer_id, sector: emp.sector, role_family, city, work_arrangement,
      title: `${R.pick(sec.adj)} ${role.title} Intern`,
      description: `${role.jobVerb} ${R.pick(sec.work)} with the ${emp.name} team, and share what you find with managers.`,
      tasks: role.tasks.slice(), supervisor_name: `${R.pick(FIRST_NAMES)} ${R.pick(LAST_NAMES)} (synthetic)`,
      start_date: start, end_date: end, mandatory, desirable: desSkills.map((s) => ({ kind: 'skill', skill_id: s }))
    };
    const nVersions = R.weighted([[1, 55], [2, 30], [3, 15]]);
    const fate = R.weighted([['approved', 84], ['pending', 8], ['declined', 4], ['withdrawn', 4]]);
    let cur = base;
    for (let v = 1; v <= nVersions; v++) {
      if (v > 1) {
        const change = R.pick(['dates', 'relax', 'describe', 'add']);
        cur = JSON.parse(JSON.stringify(cur));
        if (change === 'dates') { cur.start_date = addDays(cur.start_date, 14); cur.end_date = addDays(cur.end_date, 14); }
        if (change === 'relax' && cur.mandatory.some((c) => c.kind === 'skill')) {
          const i = cur.mandatory.findIndex((c) => c.kind === 'skill');
          cur.desirable.push(cur.mandatory.splice(i, 1)[0]);
        }
        if (change === 'describe') cur.description = cur.description.replace(', and share', ' for the spring term, and share');
        if (change === 'add') { const extra = pool.find((s) => !cur.desirable.some((c) => c.skill_id === s) && !cur.mandatory.some((c) => c.skill_id === s)); if (extra) cur.desirable.push({ kind: 'skill', skill_id: extra }); }
      }
      const last = v === nVersions;
      const status = last && fate === 'withdrawn' ? 'withdrawn' : (v === 1 ? 'submitted' : 'resubmitted');
      const submitted = addDays('2026-09-20', n % 40 + v * 6);
      W.oppVersions.push({ ...cur, version: v, submission_status: status, submitted_at: `${submitted}T08:30:00Z` });
      if (status === 'withdrawn') break;
      const decision = !last ? 'clarification_requested' : fate === 'approved' ? 'approved' : fate === 'declined' ? 'declined' : 'clarification_requested';
      if (last && fate === 'pending' && R.chance(0.5)) break; // submitted, not reviewed yet
      W.reviews.push({ review_id: null, opportunity_id, version: v, decision, reviewer: R.pick(P03_REVIEWERS),
        reason: decision === 'approved' ? 'Meets the posting checklist' : decision === 'declined' ? 'Duties are not a learning placement' : R.pick(['Please state the supervisor', 'Dates overlap the exam period; please confirm', 'Please separate required and nice-to-have skills']),
        decided_at: `${addDays(submitted, 3)}T11:00:00Z` });
      if (last && decision === 'approved') {
        const st = R.weighted([['open', 86], ['closed', 9], ['withdrawn', 5]]);
        W.listings.push({ opportunity_id, approved_version: v, listing_status: st, published_at: addDays(submitted, 4), closed_on: st === 'open' ? null : addDays('2026-10-20', R.int(0, 25)) });
        if (R.chance(0.06)) { // a newer draft after approval: the approved version stays in force
          W.oppVersions.push({ ...JSON.parse(JSON.stringify(cur)), version: v + 1, submission_status: 'draft', submitted_at: null, description: cur.description + ' (draft edit, not submitted)' });
        }
      }
    }
  }
  W.reviews.sort((a, b) => a.decided_at.localeCompare(b.decided_at)).forEach((r) => { r.review_id = `REV-${pad(++reviewSeq, 4)}`; });

  // ---------- generated students and profile versions ----------
  const usedPeople = new Set(W.students.map((s) => s.full_name));
  for (let n = 7; n <= 400; n++) {
    const student_id = `COOP-B${pad(n, 3)}`;
    let full_name;
    do { full_name = `${R.pick(FIRST_NAMES)} ${R.pick(LAST_NAMES)}`; } while (usedPeople.has(full_name));
    usedPeople.add(full_name);
    W.students.push({ student_id, full_name, programme: R.pick(PROGRAMMES), year: R.int(2, 4) });

    const sectors = uniq([R.weighted(SECTOR_WEIGHTS), ...(R.chance(0.45) ? [R.weighted(SECTOR_WEIGHTS)] : [])]);
    const roles = uniq([R.pick(SECTORS[sectors[0]].roles), ...(R.chance(0.4) ? [R.pick(SECTORS[sectors[sectors.length - 1]].roles)] : [])]);
    const home = R.weighted(CITIES.filter(([c]) => c !== 'Remote'));
    const locations = uniq([home, ...(R.chance(0.35) ? [R.weighted(CITIES)] : [])]);
    const work = R.chance(0.03) ? [] : R.chance(0.06) ? ['remote'] : R.weighted([[['on-site', 'hybrid'], 50], [['hybrid'], 15], [['hybrid', 'remote'], 20], [['on-site', 'hybrid', 'remote'], 15]]);
    if (work.includes('remote') && !locations.includes('Remote')) locations.push('Remote');
    const start = R.chance(0.03) ? null : addDays('2027-01-03', R.int(0, 6) * 7);
    const end = R.chance(0.08) ? null : addDays('2027-04-25', R.int(0, 14) * 7);
    const role = ROLES[roles[0]];
    const aim = R.pick(SECTORS[sectors[0]].aims);
    let goals = `${role.goalVerb} ${aim}${R.chance(0.4) ? ' in ' + home : ''}.`;
    if (R.chance(0.3) && sectors[1]) goals += ` I am also curious about ${sectors[1]}.`;
    if (R.chance(0.02)) goals = null;
    const pool = uniq(role.skills.concat(...sectors.map((s) => SECTORS[s].skills)));
    const nVersions = R.weighted([[1, 35], [2, 35], [3, 20], [4, 10]]);
    let published = addDays('2026-09-14', R.int(0, 30));
    let skills = R.sample(pool, R.int(2, 6)).map((skill_id) => ({ skill_id, source: 'self_declared', evidence_id: null, review_date: null }));
    skills.forEach((s) => { if (R.chance(0.33)) { const ev = newEvidence(student_id, s.skill_id, addDays(published, -R.int(3, 20))); Object.assign(s, { source: 'reviewed', evidence_id: ev.evidence_id, review_date: ev.reviewed_at }); } });
    let unmapped = R.chance(0.12) ? R.sample(PHRASES, R.int(1, 2)) : [];
    let cur = { sectors, roles, locations, work_arrangements: work, available_from: start, available_to: end, goals };
    for (let v = 1; v <= nVersions; v++) {
      let note = 'First submitted profile';
      if (v > 1) {
        published = addDays(published, R.int(5, 18));
        cur = JSON.parse(JSON.stringify(cur)); skills = skills.map((s) => ({ ...s })); unmapped = unmapped.slice();
        const change = R.pick(['review', 'add', 'dates', 'interest', 'goal']);
        const self = skills.filter((s) => s.source === 'self_declared');
        if (change === 'review' && self.length) {
          const s = R.pick(self); const ev = newEvidence(student_id, s.skill_id, addDays(published, -2));
          Object.assign(s, { source: 'reviewed', evidence_id: ev.evidence_id, review_date: ev.reviewed_at }); note = `${skillLabel[s.skill_id]} reviewed by P06 (${ev.evidence_id})`;
        } else if (change === 'add' || change === 'review') {
          const extra = pool.find((id) => !skills.some((s) => s.skill_id === id));
          if (extra) { skills.push({ skill_id: extra, source: 'self_declared', evidence_id: null, review_date: null }); note = `Added ${skillLabel[extra]} (self-declared)`; } else note = 'Minor wording changes';
        } else if (change === 'dates') {
          cur.available_to = cur.available_to ? addDays(cur.available_to, 28) : addDays('2027-05-30', R.int(0, 4) * 7); note = `Availability end date set to ${cur.available_to}`;
        } else if (change === 'interest') {
          const extra = R.weighted(SECTOR_WEIGHTS); if (!cur.sectors.includes(extra)) cur.sectors.push(extra); note = `Added ${extra} to sectors`;
        } else {
          cur.goals = `${role.goalVerb} ${R.pick(SECTORS[cur.sectors[0]].aims)}.`; note = 'Rewrote goals';
        }
      }
      const last = v === nVersions;
      let status = R.chance(0.4) ? 'reviewed' : 'submitted';
      let comment = null;
      if (!last && R.chance(0.1)) { status = 'clarification_requested'; comment = 'Please add an end date and say which skills were checked.'; }
      if (last && nVersions > 1 && R.chance(0.15)) { status = 'draft'; note = `Draft: ${note}`; }
      if (last && nVersions === 1 && R.chance(0.04)) status = 'draft';
      W.profiles.push({ student_id, profile_version: v, status, ...JSON.parse(JSON.stringify(cur)), change_note: note, coordinator_comment: comment,
        published_at: status === 'draft' ? null : published, skills: skills.map((s) => ({ ...s })), unmapped: unmapped.slice() });
    }
  }

  W.skillLabel = skillLabel;
  W.evidenceIndex = evidenceIndex;
  W.newEvidence = newEvidence;
  W.moduleFor = moduleFor;
  W.R = R;
  W.coordinator = COORDINATOR;
  return W;
}
