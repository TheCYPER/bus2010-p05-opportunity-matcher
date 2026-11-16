// Sentence embeddings with the pretrained Supabase/gte-small model (384 dims),
// mean pooling + L2 normalisation, the same settings as Supabase.ai.Session('gte-small').
// Results are cached by text hash in scripts/.cache/embeddings.json so re-runs are fast.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { pipeline } from '@huggingface/transformers';

export const MODEL = 'Supabase/gte-small';
const CACHE_DIR = new URL('../.cache/', import.meta.url);
const CACHE_FILE = new URL('embeddings.json', CACHE_DIR);

function hash(text) { return createHash('md5').update(text).digest('hex'); }

export async function embedTexts(texts, { batch = 32, log = () => {} } = {}) {
  const cache = existsSync(CACHE_FILE) ? JSON.parse(readFileSync(CACHE_FILE, 'utf8')) : {};
  const todo = [...new Set(texts)].filter((t) => !cache[hash(t)]);
  if (todo.length) {
    log(`embedding ${todo.length} new texts with ${MODEL}`);
    const extract = await pipeline('feature-extraction', MODEL, { dtype: 'fp32' });
    for (let i = 0; i < todo.length; i += batch) {
      const chunk = todo.slice(i, i + batch);
      const out = (await extract(chunk, { pooling: 'mean', normalize: true })).tolist();
      chunk.forEach((t, j) => { cache[hash(t)] = out[j].map((x) => Math.round(x * 1e6) / 1e6); });
      log(`  ${Math.min(i + batch, todo.length)}/${todo.length}`);
    }
    mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(CACHE_FILE, JSON.stringify(cache));
  }
  return new Map(texts.map((t) => [t, cache[hash(t)]]));
}

export function cosine(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s; // vectors are normalised
}
