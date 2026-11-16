// SQL literal helpers for generated seed files. Values come from our own generator,
// but everything is still escaped so a quote in a name can never break a statement.

export function lit(v) {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) throw new Error('Non-finite number in seed');
    return String(v);
  }
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  return `'${String(v).replace(/'/g, "''")}'`;
}

export function arr(list) {
  if (!list || !list.length) return "'{}'::text[]";
  return `array[${list.map(lit).join(',')}]::text[]`;
}

export function json(obj) { return `${lit(JSON.stringify(obj))}::jsonb`; }

export function vec(v) { return `'[${v.map((x) => Math.round(x * 1e6) / 1e6).join(',')}]'`; }

// Multi-row insert, split into statements of `size` rows.
export function insert(table, columns, rows, size = 400) {
  const out = [];
  for (let i = 0; i < rows.length; i += size) {
    const chunk = rows.slice(i, i + size);
    out.push(`insert into public.${table} (${columns.join(', ')}) values\n${chunk.map((r) => `  (${r.join(', ')})`).join(',\n')};`);
  }
  return out.join('\n\n');
}
