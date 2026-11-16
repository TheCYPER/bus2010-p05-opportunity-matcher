// Small helpers for the maintainer scripts: read supabase/.env.local and run SQL
// through the Supabase Management API with the access token of the logged-in CLI.
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const env = Object.fromEntries(
  readFileSync(new URL('../../supabase/.env.local', import.meta.url), 'utf8')
    .split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)])
);

function token() {
  if (process.env.SUPABASE_ACCESS_TOKEN) return process.env.SUPABASE_ACCESS_TOKEN;
  return readFileSync(join(homedir(), '.supabase', 'access-token'), 'utf8').trim();
}

export async function runSql(query, { retries = 2 } = {}) {
  const url = `https://api.supabase.com/v1/projects/${env.SUPABASE_PROJECT_REF}/database/query`;
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query })
    });
    const text = await res.text();
    if (res.ok) return text ? JSON.parse(text) : null;
    if (attempt < retries && (res.status === 429 || res.status >= 500)) {
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
      continue;
    }
    throw new Error(`SQL failed (${res.status}): ${text.slice(0, 600)}`);
  }
}
