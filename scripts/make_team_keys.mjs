// Creates one write key per team, stores only SHA-256 hashes in private.team_keys,
// and writes the plain keys to supabase/team-keys.private.md (git-ignored).
// Usage: node scripts/make_team_keys.mjs   (re-running rotates every key)
import { randomBytes, createHash } from 'node:crypto';
import { writeFileSync, chmodSync } from 'node:fs';
import { runSql, env } from './lib/mgmt.mjs';

const teams = ['P01', 'P02', 'P03', 'P04', 'P05', 'P06', 'P07'];
const rows = teams.map((t) => ({ team: t, key: `bus2010_${t.toLowerCase()}_${randomBytes(18).toString('base64url')}` }));
const values = rows.map((r) => `('${r.team}', '${createHash('sha256').update(r.key).digest('hex')}')`).join(',\n  ');
await runSql(`insert into private.team_keys (team_id, key_hash) values\n  ${values}\non conflict (team_id) do update set key_hash = excluded.key_hash, created_at = now();`);

const lines = [
  '# BUS2010 shared database: team write keys (PRIVATE)',
  '',
  'Do not commit, post in a group chat, or put in a published page. Send each team only its own key, one to one.',
  `Project URL: ${env.SUPABASE_URL}`,
  `Created: ${new Date().toISOString()}`,
  '',
  '| Team | Key |',
  '| --- | --- |',
  ...rows.map((r) => `| ${r.team} | \`${r.key}\` |`),
  '',
  'Rotate all keys: `node scripts/make_team_keys.mjs` (old keys stop working at once).',
  ''
];
writeFileSync(new URL('../supabase/team-keys.private.md', import.meta.url), lines.join('\n'));
chmodSync(new URL('../supabase/team-keys.private.md', import.meta.url), 0o600);
console.log('stored hashes for', teams.join(', '));
