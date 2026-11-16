#!/usr/bin/env node
// Runs every code example in docs/SUPABASE_GUIDE.md against the live database, in order,
// then checks the guide's stated numbers and error messages. The sandbox records are reset
// before and after, so the run leaves no trace.
// Usage: node scripts/test_guide_examples.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { env, runSql } from './lib/mgmt.mjs';

const ROOT = new URL('../', import.meta.url);
const guide = readFileSync(new URL('docs/SUPABASE_GUIDE.md', ROOT), 'utf8');
const keys = Object.fromEntries([...readFileSync(new URL('supabase/team-keys.private.md', ROOT), 'utf8').matchAll(/\| (P0\d) \| `([^`]+)` \|/g)].map((m) => [`${m[1]}_KEY`, m[2]]));
const runEnv = { ...process.env, SB_URL: env.SUPABASE_URL, SB_KEY: env.SUPABASE_PUBLISHABLE_KEY, ...keys };
const CACHE = new URL('scripts/.cache/', ROOT);
mkdirSync(CACHE, { recursive: true });

let failures = 0;
const report = (ok, label, detail) => { if (!ok) failures++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '\n      ' + detail.replace(/\s+/g, ' ').slice(0, 220) : ''}`); };
const reset = () => spawnSync(process.execPath, [new URL('scripts/sandbox.mjs', ROOT).pathname, 'reset'], { encoding: 'utf8' });

// ---------- 1. every fenced example, in document order ----------
const blocks = [...guide.matchAll(/```(bash|js|python)\n([\s\S]*?)```/g)].map((m, i) => ({ n: i + 1, lang: m[1], code: m[2] }));
const lineOf = (b) => guide.slice(0, guide.indexOf(b.code)).split('\n').length;
reset();
for (const b of blocks) {
  let res;
  if (b.lang === 'bash') res = spawnSync('bash', ['-euo', 'pipefail', '-c', b.code], { env: runEnv, encoding: 'utf8', timeout: 90000 });
  if (b.lang === 'python') res = spawnSync('python3', ['-c', b.code], { env: runEnv, encoding: 'utf8', timeout: 90000 });
  if (b.lang === 'js') {
    const file = new URL(`example-${b.n}.mjs`, CACHE);
    writeFileSync(file, b.code);
    res = spawnSync(process.execPath, [file.pathname], { env: runEnv, encoding: 'utf8', timeout: 90000 });
  }
  const ok = res.status === 0;
  report(ok, `Example ${b.n} (${b.lang}, guide line ${lineOf(b)})`, ok ? res.stdout.trim() : (res.stderr || res.stdout).trim());
}

// ---------- 2. claims in the text (after a reset, so the examples' rows are gone) ----------
reset();
async function rest(path, { method = 'GET', key, body, prefer } = {}) {
  const headers = { apikey: env.SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' };
  if (key) headers['x-team-key'] = key;
  if (prefer) headers.Prefer = prefer;
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, text: await res.text(), range: res.headers.get('content-range') };
}
const probe = { skill_id: 'SK-PROBE-01', label: 'probe', synonyms: [], category: 'test' };
let r = await rest('skills', { method: 'POST', body: probe });
report(r.status === 401 && /row-level security/.test(r.text), 'Section 5: insert without a key → HTTP 401 row-level security', `HTTP ${r.status} ${r.text}`);
r = await rest('skills', { method: 'POST', body: probe, key: keys.P02_KEY });
report(r.status === 401 && /row-level security/.test(r.text), 'Section 5: insert with another team’s key → HTTP 401', `HTTP ${r.status}`);
r = await rest('profile_versions?student_id=eq.COOP-Z001', { method: 'PATCH', body: { goals: 'x' }, key: keys.P01_KEY, prefer: 'return=representation' });
report(r.status === 200 && r.text === '[]', 'Section 5: update of an append-only table changes zero rows', `HTTP ${r.status} ${r.text}`);
r = await rest('students?student_id=eq.COOP-Z001', { method: 'DELETE', key: keys.P01_KEY });
report(r.status === 401 && /permission denied/.test(r.text), 'Section 5: delete → HTTP 401 permission denied', `HTTP ${r.status} ${r.text}`);

r = await rest('profile_skills', { method: 'POST', key: keys.P01_KEY, body: { student_id: 'COOP-Z001', profile_version: 1, skill_id: 'SK-PY-01', source: 'reviewed', evidence_id: 'E-FAKE-99', review_date: '2026-11-16' } });
report(r.status === 400 && /not demonstrated evidence/.test(r.text), 'Section 5: reviewed skill without evidence → HTTP 400 not demonstrated evidence', `HTTP ${r.status} ${r.text}`);

const count = async (t, q = '') => Number(((await rest(`${t}?select=*&limit=1${q}`, { prefer: 'count=exact' })).range || '/0').split('/')[1]);
const claimed = { skills: 44, employers: 60, students: 400, profile_versions: 808, opportunity_versions: 404, listings: 208, open_listings: 178,
  applications: 616, application_events: 1422, placements: 53, skill_evidence: 831, learning_logs: 127, recommendations: 8231, skill_gap_events: 421, coordinator_labels: 30 };
const sandboxRows = { employers: 1, students: 1, profile_versions: 1, opportunity_versions: 1, listings: 1, open_listings: 1 };
const off = [];
for (const [t, n] of Object.entries(claimed)) { const got = (await count(t)) - (sandboxRows[t] || 0); if (got !== n) off.push(`${t} ${got}≠${n}`); }
report(off.length === 0, 'Section 1: stated row counts match the live data (sandbox rows excluded)', off.join(', ') || 'all 15 counts match');
const ai = await rest('rpc/ai_signals', { method: 'POST', body: { p_goal: 'Learn how airline operations data drives on-time performance and build aviation analytics dashboards in Dubai.' } });
const goal = JSON.parse(ai.text).goal || {};
report(goal['OP-028@2'] === 0.9117, 'Section 4: ai_signals gives Layla’s goal × OP-028@2 = 0.9117', `got ${goal['OP-028@2']}`);
const owners = JSON.parse((await rest('table_owners?select=table_name,owner_team,insert_teams,update_teams')).text);
const tableMap = { P01: ['students', 'profile_versions', 'profile_skills', 'profile_unmapped_skills'], P02: ['employers', 'opportunity_versions', 'opportunity_conditions'], P03: ['listing_reviews', 'listings'],
  P04: ['applications', 'application_events', 'placements'], P05: ['match_methods', 'recommendations', 'skill_gap_events', 'recommendation_challenges', 'coordinator_labels', 'ai_embeddings'],
  P06: ['learning_modules', 'skill_evidence'], P07: ['learning_logs'] };
const wrong = Object.entries(tableMap).flatMap(([team, tables]) => tables.filter((t) => !owners.find((o) => o.table_name === t && o.insert_teams.includes(team))));
report(wrong.length === 0, 'Section 3: ownership table matches table_owners in the database', wrong.join(', ') || `${owners.length} tables checked`);

const left = await runSql("select (select count(*) from public.profile_versions where student_id = 'COOP-Z001') as z, (select count(*) from public.opportunity_versions where opportunity_id = 'OP-999') as o");
report(Number(left[0].z) === 1 && Number(left[0].o) === 1, 'Sandbox reset after the run', JSON.stringify(left[0]));
console.log(failures ? `\n${failures} problem(s)` : `\nAll ${blocks.length} examples and all claims checked`);
process.exit(failures ? 1 : 0);
