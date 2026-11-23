// P05 ai-suggest: live AI signals with the built-in gte-small model (mean pooled, normalised:
// the same settings used for every stored embedding).
//   {"phrase": "..."}  -> the 3 nearest vocabulary skills (a SUGGESTION: a coordinator or P01
//                         must confirm before any profile changes)
//   {"goal": "..."}    -> cosine similarity of a goal text to every stored opportunity version,
//                         for profiles written after the seed (Sprint 3)
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const session = new Supabase.ai.Session('gte-small');
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
const MODEL = 'Supabase/gte-small';
const MIN = 0.84; // suggest_min of method ai-embed-1.0.0
const MAX_BODY = 2048; // bytes
const MAX_GOAL = 600; // characters
const WINDOW_MS = 60_000;
const PER_WINDOW = 20; // requests per minute per client, per function instance
const hits = new Map<string, number[]>();

function tooMany(client: string): boolean {
  const now = Date.now();
  const recent = (hits.get(client) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(client, recent);
  if (hits.size > 5000) hits.clear(); // keep memory bounded
  return recent.length > PER_WINDOW;
}

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

async function embed(text: string): Promise<string> {
  const v = await session.run(text, { mean_pool: true, normalize: true }) as number[];
  return JSON.stringify(v);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return reply({ error: 'Use POST with {"phrase": "..."} or {"goal": "..."}' }, 405);
  if (!req.headers.get('apikey')) return reply({ error: 'Send the project publishable key in the apikey header' }, 401);
  const client = (req.headers.get('x-forwarded-for') ?? 'unknown').split(',')[0].trim();
  if (tooMany(client)) return reply({ error: 'Too many requests; wait a minute' }, 429);
  if (Number(req.headers.get('content-length') ?? '0') > MAX_BODY) return reply({ error: 'Request body too large' }, 413);
  let body: { phrase?: unknown; goal?: unknown };
  try {
    const raw = await req.text();
    if (raw.length > MAX_BODY) return reply({ error: 'Request body too large' }, 413);
    body = JSON.parse(raw);
  } catch { return reply({ error: 'The body must be JSON' }, 400); }
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!);

  if (typeof body.goal === 'string') {
    const goal = body.goal.trim();
    if (goal.length < 3 || goal.length > MAX_GOAL) return reply({ error: `goal must be 3 to ${MAX_GOAL} characters` }, 400);
    try {
      const { data, error } = await db.rpc('ai_signals_for_vector', { p_embedding: await embed(goal) });
      if (error) {
        console.error('ai_signals_for_vector failed', error);
        return reply({ error: 'Similarity lookup failed' }, 502);
      }
      return reply({ model: MODEL, method: 'ai-embed-1.0.0', goal_embedded: true, computed: 'live', goal: data ?? {} });
    } catch (e) {
      console.error('goal embedding failed', e);
      return reply({ error: 'The AI model could not process this goal' }, 500);
    }
  }

  const phrase = typeof body.phrase === 'string' ? body.phrase.trim() : '';
  if (phrase.length < 2 || phrase.length > 120) return reply({ error: 'phrase must be 2 to 120 characters' }, 400);
  try {
    const { data, error } = await db.rpc('ai_skill_neighbours', { p_embedding: await embed(phrase), p_limit: 3 });
    if (error) {
      console.error('ai_skill_neighbours failed', error);
      return reply({ error: 'Skill lookup failed' }, 502);
    }
    const suggestions = (data ?? []).map((s: { skill_id: string; label: string; similarity: number }) => ({ ...s, suggested: s.similarity >= MIN }));
    return reply({ model: MODEL, method: 'ai-embed-1.0.0', phrase, threshold: MIN, suggestions,
      note: 'Suggested, unconfirmed. A coordinator or P01 must confirm before any profile changes.' });
  } catch (e) {
    console.error('embedding failed', e);
    return reply({ error: 'The AI model could not process this phrase' }, 500);
  }
});
