-- Hardening after the security review of 16 November 2026.

-- 1. A skill can only be "reviewed" if P06 has recorded demonstrated evidence for the same
--    student and skill. Without this, a profile could mark a skill verified with a made-up ID.
create or replace function public.check_reviewed_skill() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.source = 'reviewed' and not exists (
    select 1 from public.skill_evidence e
    where e.evidence_id = new.evidence_id and e.student_id = new.student_id
      and e.skill_id = new.skill_id and e.review_outcome = 'demonstrated') then
    raise exception 'profile_skills: % is marked reviewed for %, but % is not demonstrated evidence for that student and skill in skill_evidence',
      new.skill_id, new.student_id, new.evidence_id using errcode = '23514';
  end if;
  return new;
end $$;
create trigger profile_skills_reviewed_check before insert or update on public.profile_skills
  for each row execute function public.check_reviewed_skill();

-- 2. P06 may move a gap's status, nothing else (the P05 owner and the maintainer are not limited).
create or replace function public.guard_gap_update() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user in ('anon', 'authenticated') and public.request_team() is distinct from 'P05'
     and (new.gap_id, new.recommendation_id, new.student_id, new.skill_id, new.opportunity_id, new.requirement)
         is distinct from (old.gap_id, old.recommendation_id, old.student_id, old.skill_id, old.opportunity_id, old.requirement) then
    raise exception 'skill_gap_events: team % may only change status', public.request_team() using errcode = '42501';
  end if;
  return new;
end $$;
create trigger gaps_guard before update on public.skill_gap_events
  for each row execute function public.guard_gap_update();

-- 3. Updates keep the original creation time.
create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.created_at := old.created_at;
  new.updated_at := now();
  return new;
end $$;

-- 4. Defence in depth: tables created later never get delete rights for API roles,
--    and the key table refuses everyone but its owner even if it were exposed.
alter default privileges in schema public revoke delete, truncate on tables from anon, authenticated;
alter table private.team_keys enable row level security;
