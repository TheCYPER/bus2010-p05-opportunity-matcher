-- Read views for every team, and the P05 AI similarity functions.
-- Views use security_invoker so the caller's row level security applies.

-- Every usable profile version (drafts and clarification requests are ignored).
create view public.profile_feed with (security_invoker = true) as
select pv.student_id, s.full_name, s.programme, s.year,
       pv.profile_version, pv.status, pv.goals, pv.sectors, pv.roles, pv.locations, pv.work_arrangements,
       pv.available_from, pv.available_to, pv.change_note, pv.published_at,
       coalesce((select jsonb_agg(jsonb_build_object('skill_id', ps.skill_id, 'source', ps.source,
                                                     'evidence_id', ps.evidence_id, 'review_date', ps.review_date)
                                  order by ps.skill_id)
                 from public.profile_skills ps
                 where ps.student_id = pv.student_id and ps.profile_version = pv.profile_version), '[]'::jsonb) as skills,
       coalesce((select array_agg(u.phrase order by u.phrase)
                 from public.profile_unmapped_skills u
                 where u.student_id = pv.student_id and u.profile_version = pv.profile_version), '{}'::text[]) as unmapped_skills
from public.profile_versions pv
join public.students s using (student_id)
where pv.status in ('submitted', 'reviewed');
comment on view public.profile_feed is 'Every submitted or reviewed profile version, with skills and unmapped phrases.';

-- The latest usable version per student.
create view public.current_profiles with (security_invoker = true) as
select distinct on (student_id) *
from public.profile_feed
order by student_id, profile_version desc;
comment on view public.current_profiles is 'One row per student: the newest submitted or reviewed profile version. Drafts are ignored.';

-- Every version of every published opportunity, with conditions and the listing state.
create view public.opportunity_feed with (security_invoker = true) as
select ov.opportunity_id, ov.version, ov.employer_id, e.name as employer, ov.title, ov.sector, ov.role_family, ov.city,
       ov.work_arrangement, ov.start_date, ov.end_date, ov.description, ov.tasks, ov.submission_status,
       l.approved_version, l.listing_status, l.published_at, l.closed_on,
       coalesce((select jsonb_agg(jsonb_build_object('kind', c.kind, 'skill_id', c.skill_id,
                                                     'arrangements', c.arrangements, 'city', c.city) order by c.position)
                 from public.opportunity_conditions c
                 where c.opportunity_id = ov.opportunity_id and c.version = ov.version and c.requirement = 'mandatory'), '[]'::jsonb) as mandatory,
       coalesce((select jsonb_agg(jsonb_build_object('kind', c.kind, 'skill_id', c.skill_id) order by c.position)
                 from public.opportunity_conditions c
                 where c.opportunity_id = ov.opportunity_id and c.version = ov.version and c.requirement = 'desirable'), '[]'::jsonb) as desirable
from public.opportunity_versions ov
join public.listings l using (opportunity_id)
join public.employers e using (employer_id);
comment on view public.opportunity_feed is 'All versions of opportunities that have a listing row. Only version = approved_version may be shown to students.';

-- What students can see now.
create view public.open_listings with (security_invoker = true) as
select * from public.opportunity_feed
where listing_status = 'open' and version = approved_version;
comment on view public.open_listings is 'Open listings at their approved version, with mandatory and desirable conditions.';

-- Newest recommendation per student, opportunity and method.
create view public.latest_recommendations with (security_invoker = true) as
select distinct on (student_id, opportunity_id, method_id) *
from public.recommendations
order by student_id, opportunity_id, method_id, computed_at desc, created_at desc;
comment on view public.latest_recommendations is 'Newest stored recommendation per student, opportunity and method.';

-- ---------- AI: nearest vocabulary skills for an embedding ----------
create or replace function public.ai_skill_neighbours(p_embedding extensions.vector, p_limit int default 3,
                                                      p_model text default 'Supabase/gte-small')
returns table (skill_id text, label text, similarity numeric)
language sql stable set search_path = public, extensions as $$
  select s.skill_id, s.label, round((1 - (e.embedding <=> p_embedding))::numeric, 4)
  from public.ai_embeddings e
  join public.skills s on s.skill_id = e.ref_id
  where e.kind = 'skill' and e.model = p_model
  order by e.embedding <=> p_embedding
  limit least(greatest(coalesce(p_limit, 3), 1), 10)
$$;
comment on function public.ai_skill_neighbours is 'Vocabulary skills closest to an embedding (cosine similarity).';

-- ---------- AI: signals for one goal text and some free-text phrases ----------
create or replace function public.ai_signals(p_goal text, p_phrases text[] default '{}',
                                             p_model text default 'Supabase/gte-small')
returns jsonb
language plpgsql stable set search_path = public, extensions as $$
declare
  g  extensions.vector;
  gj jsonb := '{}'::jsonb;
  ph jsonb := '{}'::jsonb;
begin
  if cardinality(coalesce(p_phrases, '{}')) > 20 then
    raise exception 'At most 20 phrases per call';
  end if;
  select e.embedding into g
  from public.ai_embeddings e
  where e.kind = 'goal' and e.model = p_model and e.text_hash = md5(coalesce(p_goal, ''))
  limit 1;
  if g is not null then
    select coalesce(jsonb_object_agg(e.ref_id, round((1 - (e.embedding <=> g))::numeric, 4)), '{}'::jsonb) into gj
    from public.ai_embeddings e
    where e.kind = 'opportunity' and e.model = p_model;
  end if;
  select coalesce(jsonb_object_agg(x.phrase, x.sugg), '{}'::jsonb) into ph
  from (
    select p.phrase,
           (select coalesce(jsonb_agg(jsonb_build_object('skill_id', n.skill_id, 'score', n.similarity)), '[]'::jsonb)
            from public.ai_skill_neighbours(pe.embedding, 3, p_model) n) as sugg
    from unnest(coalesce(p_phrases, '{}')) as p(phrase)
    join public.ai_embeddings pe on pe.kind = 'phrase' and pe.model = p_model and pe.text_hash = md5(p.phrase)
  ) x;
  return jsonb_build_object('model', p_model, 'goal_embedded', g is not null, 'goal', gj, 'phrases', ph);
end $$;
comment on function public.ai_signals is 'P05 AI signals: cosine similarity of a goal text to every opportunity version (key OP-028@2), and the 3 nearest skills for each known phrase.';

grant execute on function public.ai_skill_neighbours(extensions.vector, int, text) to anon, authenticated;
grant execute on function public.ai_signals(text, text[], text) to anon, authenticated;
