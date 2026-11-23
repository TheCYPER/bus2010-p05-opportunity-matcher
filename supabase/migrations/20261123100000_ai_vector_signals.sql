-- Sprint 3: AI signals for texts that have no stored embedding yet (for example a profile
-- another team wrote after the seed). The ai-suggest Edge Function embeds the text with
-- gte-small and calls this function with the vector.
create or replace function public.ai_signals_for_vector(p_embedding extensions.vector,
                                                        p_model text default 'Supabase/gte-small')
returns jsonb
language sql stable set search_path = public, extensions as $$
  select coalesce(jsonb_object_agg(e.ref_id, round((1 - (e.embedding <=> p_embedding))::numeric, 4)), '{}'::jsonb)
  from public.ai_embeddings e
  where e.kind = 'opportunity' and e.model = p_model
$$;
comment on function public.ai_signals_for_vector is 'Cosine similarity of one embedding to every stored opportunity version (key OP-028@2).';
grant execute on function public.ai_signals_for_vector(extensions.vector, text) to anon, authenticated;
