#!/usr/bin/env node
// Checks the live shared database against what we promise:
//   1. the demo slice read through src/supabase-source.js equals src/data.js field for field
//   2. the 16+ acceptance tests pass on that live slice
//   3. row counts per table
//   4. access rules: anonymous reads work; writes without a key, with the wrong team's key,
//      updates to append-only tables and deletes are refused; the right key can write
// Usage: node scripts/verify_live.mjs
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { env, runSql } from './lib/mgmt.mjs';

const require = createRequire(import.meta.url);
globalThis.P05Engine = require('../src/engine.js');
const E = globalThis.P05Engine;
const DATA = require('../src/data.js');
const T = require('../src/tests.js');
const S = require('../src/supabase-source.js');
const cfg = { supabaseUrl: env.SUPABASE_URL, publishableKey: env.SUPABASE_PUBLISHABLE_KEY, fetch: globalThis.fetch, timeoutMs: 30000 };
const keys = Object.fromEntries([...readFileSync(new URL('../supabase/team-keys.private.md', import.meta.url), 'utf8').matchAll(/\| (P0\d) \| `([^`]+)` \|/g)].map((m) => [m[1], m[2]]));

let failures = 0;
const check = (ok, label, detail = '') => { if (!ok) failures++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  (' + detail + ')' : ''}`); };
const sortKeys = (v) => Array.isArray(v) ? v.map(sortKeys) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])])) : v;
const same = (a, b) => JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));

// ---------- 1. demo slice equals the fixtures ----------
const live = await S.load(DATA, cfg);
const demoIds = new Set(DATA.profiles.map((p) => p.student_id));
const demoOpps = new Set(DATA.listings.map((l) => l.opportunity_id));
const liveProfiles = live.data.profiles.filter((p) => demoIds.has(p.student_id));
const liveListings = live.data.listings.filter((l) => demoOpps.has(l.opportunity_id));
const bySkill = (a, b) => a.skill_id.localeCompare(b.skill_id);
const normP = (p) => ({ ...p, skills: p.skills.slice().sort(bySkill) });
check(liveProfiles.length === DATA.profiles.length && DATA.profiles.every((p) => liveProfiles.some((q) => q.student_id === p.student_id && q.profile_version === p.profile_version && same(normP(q), normP(p)))),
  'Demo profiles (COOP-B001..B006, 8 versions) identical to src/data.js', `${liveProfiles.length} versions read`);
check(liveListings.length === DATA.listings.length && DATA.listings.every((l) => same(liveListings.find((x) => x.opportunity_id === l.opportunity_id), l)),
  'Demo listings (OP-026..OP-031, all versions) identical to src/data.js', `${liveListings.length} listings read`);
check(DATA.vocabulary.every((v) => same(live.data.vocabulary.find((x) => x.skill_id === v.skill_id) && { skill_id: v.skill_id, label: live.data.vocabulary.find((x) => x.skill_id === v.skill_id).label, synonyms: live.data.vocabulary.find((x) => x.skill_id === v.skill_id).synonyms }, v)),
  'The 14 original vocabulary terms unchanged', `${live.data.vocabulary.length} terms live`);

// ---------- 2. acceptance tests on the live slice (with live AI signals) ----------
const slice = { ...live.data, profiles: liveProfiles, listings: liveListings, ai: { ...live.data.ai, goals: {}, phrases: {} } };
for (const p of liveProfiles) await S.loadAi(slice, p, cfg);
const out = T.run(E, slice);
out.results.filter((r) => !r.pass).forEach((r) => console.log('      failed:', r.id, r.actual));
check(out.passed === out.total, `Acceptance tests on the live demo slice`, `${out.passed}/${out.total}`);

// ---------- 3. row counts ----------
async function count(table) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${table}?select=*&limit=1`, { headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY, Prefer: 'count=exact' } });
  return Number((res.headers.get('content-range') || '/0').split('/')[1]);
}
const expected = { teams: 7, skills: 44, students: 400, profile_versions: 808, employers: 60, opportunity_versions: 404, listings: 208, open_listings: 178,
  applications: 616, placements: 53, recommendations: 8231, skill_gap_events: 421, skill_evidence: 831, learning_logs: 127, ai_embeddings: 1135, coordinator_labels: 30 };
const counts = {};
for (const t of Object.keys(expected)) counts[t] = await count(t);
const bad = Object.keys(expected).filter((t) => counts[t] < expected[t]);
check(bad.length === 0, 'Row counts at or above the seeded volume', Object.entries(counts).map(([t, n]) => `${t} ${n}`).join(', '));

// ---------- 4. access rules ----------
async function post(path, body, key, method = 'POST', extra = {}) {
  const h = { apikey: env.SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal', ...extra };
  if (key) h['x-team-key'] = key;
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, text: await res.text() };
}
const probe = { skill_id: 'SK-TEST-99', label: 'RLS probe (deleted by maintainer)', synonyms: [], category: 'test' };
let r = await post('skills', probe, null);
check(r.status === 401 || r.status === 403, 'Insert without a team key is refused', `HTTP ${r.status}`);
r = await post('skills', probe, keys.P02);
check(r.status === 401 || r.status === 403, 'Insert with the wrong team key (P02 into skills) is refused', `HTTP ${r.status}`);
r = await post('profile_versions?student_id=eq.COOP-B001&profile_version=eq.3', { goals: 'overwritten' }, keys.P01, 'PATCH', { Prefer: 'return=representation' });
check(r.status >= 400 || r.text === '[]', 'Update of an append-only table (profile_versions) changes nothing, even for its owner', `HTTP ${r.status} ${r.text.slice(0, 40)}`);
r = await post('students?student_id=eq.COOP-B001', null, keys.P01, 'DELETE', { Prefer: 'return=representation' });
check(r.status >= 400 || r.text === '[]', 'Delete through the API is refused', `HTTP ${r.status} ${r.text.slice(0, 60)}`);
r = await post('listings?opportunity_id=eq.OP-030', { listing_status: 'open' }, keys.P05, 'PATCH', { Prefer: 'return=representation' });
check(r.status >= 400 || r.text === '[]', "Update of another team's table (P05 key on P03 listings) changes nothing", `HTTP ${r.status} ${r.text.slice(0, 40)}`);
r = await post('profile_skills', { student_id: 'COOP-Z001', profile_version: 1, skill_id: 'SK-PY-01', source: 'reviewed', evidence_id: 'E-FAKE-99', review_date: '2026-11-16' }, keys.P01);
check(r.status === 400 && /not demonstrated evidence/.test(r.text), 'A "reviewed" skill without demonstrated P06 evidence is refused', `HTTP ${r.status}`);
r = await post('skill_gap_events?gap_id=eq.GAP-0001', { student_id: 'COOP-B008' }, keys.P06, 'PATCH', { Prefer: 'return=representation' });
check(r.status >= 400 && /may only change status/.test(r.text), 'P06 can change a gap\'s status but nothing else', `HTTP ${r.status}`);
const fn = await fetch(`${env.SUPABASE_URL}/functions/v1/ai-suggest`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"phrase":"sql"}' });
check(fn.status === 401, 'ai-suggest refuses calls without the apikey header', `HTTP ${fn.status}`);
const novel = { student_id: 'COOP-X999', goals: `Probe goal written after the seed: plan solar farm maintenance with sensor data (${Date.now()})`, unmapped_skills: [] };
const probeData = { ai: { goals: {}, phrases: {} } };
const gotLive = await S.loadAi(probeData, novel, cfg).catch(() => false);
const liveScores = Object.keys(probeData.ai.goals[E.textKey(novel.goals)] || {}).length;
check(gotLive && liveScores > 300, 'A goal with no stored embedding gets live AI scores from the Edge Function', `${liveScores} job versions scored`);
const who = await S.whoami(keys.P05, cfg);
check(who === 'P05', 'whoami() recognises the P05 key', String(who));
const label = { student_id: 'COOP-B006', opportunity_id: 'OP-030', label: 'not_fit', labelled_by: 'verify_live.mjs probe', note: 'Written by the access check; safe to ignore' };
r = await post('coordinator_labels?on_conflict=student_id,opportunity_id,labelled_by', label, keys.P05, 'POST', { Prefer: 'resolution=ignore-duplicates,return=minimal' });
check(r.status === 201 || r.status === 200, 'The owner team can insert (P05 key into coordinator_labels)', `HTTP ${r.status}`);

await runSql("delete from public.coordinator_labels where labelled_by = 'verify_live.mjs probe'"); // leave no trace
console.log(failures ? `\n${failures} check(s) failed` : '\nAll live checks passed');
process.exit(failures ? 1 : 0);
