-- BUS2010 Co-op Platform: shared database, core schema
-- Maintained by Team 5 (P05). Synthetic data only.
-- Conventions: snake_case, text IDs in binder style, every table has created_at.
-- Versioned records (profile_versions, opportunity_versions, recommendations, ...) are append-only.

create extension if not exists pgcrypto with schema extensions;
create extension if not exists vector with schema extensions;

-- ---------- shared ----------
create table public.teams (
  team_id    text primary key check (team_id ~ '^P0[1-7]$'),
  name       text not null,
  created_at timestamptz not null default now()
);
comment on table public.teams is 'The seven BUS2010 co-op project teams (P01..P07).';

create table public.skills (
  skill_id   text primary key check (skill_id ~ '^SK-[A-Z]+-[0-9]{2}$'),
  label      text not null,
  synonyms   text[] not null default '{}',
  category   text not null,
  created_at timestamptz not null default now()
);
comment on table public.skills is 'Shared controlled skill vocabulary. Every team uses these IDs.';

-- ---------- P01 student profiles ----------
create table public.students (
  student_id text primary key check (student_id ~ '^COOP-[A-Z][0-9]{3}$'),
  full_name  text not null,
  programme  text,
  year       int check (year between 1 and 6),
  created_at timestamptz not null default now()
);

create table public.profile_versions (
  student_id          text not null references public.students(student_id),
  profile_version     int  not null check (profile_version >= 1),
  status              text not null check (status in ('draft','submitted','clarification_requested','reviewed')),
  goals               text,
  sectors             text[] not null default '{}',
  roles               text[] not null default '{}',
  locations           text[] not null default '{}',
  work_arrangements   text[] not null default '{}' check (work_arrangements <@ array['on-site','hybrid','remote']),
  available_from      date,
  available_to        date,
  change_note         text,
  coordinator_comment text,
  published_at        date,
  created_at          timestamptz not null default now(),
  primary key (student_id, profile_version),
  check (available_to is null or available_from is null or available_to >= available_from)
);
comment on table public.profile_versions is 'Append-only. A change is a new profile_version, never an update.';

create table public.profile_skills (
  student_id      text not null,
  profile_version int  not null,
  skill_id        text not null references public.skills(skill_id),
  source          text not null check (source in ('self_declared','reviewed')),
  evidence_id     text,
  review_date     date,
  created_at      timestamptz not null default now(),
  primary key (student_id, profile_version, skill_id),
  foreign key (student_id, profile_version) references public.profile_versions(student_id, profile_version),
  check (source = 'self_declared' or evidence_id is not null)
);
comment on column public.profile_skills.evidence_id is 'Soft reference to skill_evidence.evidence_id (P06). Required when source = reviewed.';

create table public.profile_unmapped_skills (
  student_id      text not null,
  profile_version int  not null,
  phrase          text not null check (length(phrase) between 1 and 200),
  created_at      timestamptz not null default now(),
  primary key (student_id, profile_version, phrase),
  foreign key (student_id, profile_version) references public.profile_versions(student_id, profile_version)
);
comment on table public.profile_unmapped_skills is 'Free-text skills that have no vocabulary term. Never matched silently.';

-- ---------- P02 employer submissions ----------
create table public.employers (
  employer_id text primary key check (employer_id ~ '^EMP-[0-9]{3}$'),
  name        text not null,
  sector      text,
  city        text,
  created_at  timestamptz not null default now()
);

create table public.opportunity_versions (
  opportunity_id    text not null check (opportunity_id ~ '^OP-[0-9]{3}$'),
  version           int  not null check (version >= 1),
  employer_id       text not null references public.employers(employer_id),
  title             text not null,
  sector            text,
  role_family       text,
  city              text,
  work_arrangement  text check (work_arrangement in ('on-site','hybrid','remote')),
  start_date        date,
  end_date          date,
  description       text,
  tasks             text[] not null default '{}',
  supervisor_name   text,
  submission_status text not null check (submission_status in ('draft','submitted','clarification_requested','resubmitted','withdrawn')),
  submitted_at      timestamptz,
  created_at        timestamptz not null default now(),
  primary key (opportunity_id, version)
);
comment on table public.opportunity_versions is 'Append-only. Only the version P03 approved is ever shown to students.';

create table public.opportunity_conditions (
  opportunity_id text not null,
  version        int  not null,
  requirement    text not null check (requirement in ('mandatory','desirable')),
  position       int  not null check (position >= 0),
  kind           text not null check (kind in ('skill','availability','arrangement')),
  skill_id       text references public.skills(skill_id),
  arrangements   text[],
  city           text,
  created_at     timestamptz not null default now(),
  primary key (opportunity_id, version, requirement, position),
  foreign key (opportunity_id, version) references public.opportunity_versions(opportunity_id, version),
  check ((kind = 'skill') = (skill_id is not null)),
  check (kind <> 'arrangement' or arrangements is not null),
  check (requirement = 'mandatory' or kind = 'skill')
);
comment on table public.opportunity_conditions is 'Mandatory conditions decide eligibility; desirable ones only order results.';

-- ---------- P03 review and publication ----------
create table public.listing_reviews (
  review_id      text primary key check (review_id ~ '^REV-[0-9]{4,}$'),
  opportunity_id text not null,
  version        int  not null,
  decision       text not null check (decision in ('clarification_requested','approved','declined')),
  reviewer       text not null,
  reason         text,
  decided_at     timestamptz not null,
  created_at     timestamptz not null default now(),
  foreign key (opportunity_id, version) references public.opportunity_versions(opportunity_id, version)
);

create table public.listings (
  opportunity_id   text primary key check (opportunity_id ~ '^OP-[0-9]{3}$'),
  approved_version int,
  listing_status   text not null check (listing_status in ('open','closed','withdrawn')),
  published_at     date,
  closed_on        date,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  foreign key (opportunity_id, approved_version) references public.opportunity_versions(opportunity_id, version),
  check (listing_status = 'open' or closed_on is not null)
);
comment on table public.listings is 'One row per published opportunity. P03 updates status; the approved version itself never changes.';

-- ---------- P04 applications and placements ----------
create table public.applications (
  application_id      text primary key check (application_id ~ '^APP-[0-9]{3,}$'),
  student_id          text not null references public.students(student_id),
  opportunity_id      text not null,
  opportunity_version int  not null,
  profile_version     int  not null,
  status              text not null check (status in ('submitted','under_review','interview','offer','accepted','not_selected','withdrawn')),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  foreign key (opportunity_id, opportunity_version) references public.opportunity_versions(opportunity_id, version),
  foreign key (student_id, profile_version) references public.profile_versions(student_id, profile_version)
);

create table public.application_events (
  event_id       bigint generated always as identity primary key,
  application_id text not null references public.applications(application_id),
  status         text not null check (status in ('submitted','under_review','interview','offer','accepted','not_selected','withdrawn')),
  actor          text not null,
  note           text,
  at             timestamptz not null,
  created_at     timestamptz not null default now()
);
comment on table public.application_events is 'Append-only status history for applications.';

create table public.placements (
  placement_id   text primary key check (placement_id ~ '^[A-Z]{2,4}-[A-Z]{3}-[0-9]{3}(-[0-9])?$'),
  application_id text not null unique references public.applications(application_id),
  student_id     text not null references public.students(student_id),
  opportunity_id text not null,
  confirmed_by   text not null,
  confirmed_at   timestamptz not null,
  created_at     timestamptz not null default now()
);
comment on table public.placements is 'Confirmed by a person (human approval), never by the matching engine.';

-- ---------- P05 matching ----------
create table public.match_methods (
  method_id  text primary key check (method_id ~ '^[a-z-]+-[0-9]+\.[0-9]+\.[0-9]+$'),
  family     text not null check (family in ('rules','ai')),
  label      text not null,
  weights    jsonb not null,
  params     jsonb not null default '{}',
  model      text,
  notes      text,
  created_at timestamptz not null default now()
);

create table public.recommendations (
  recommendation_id   text primary key check (recommendation_id ~ '^REC-[0-9A-F]{8}$'),
  student_id          text not null,
  profile_version     int  not null,
  opportunity_id      text not null,
  opportunity_version int,
  method_id           text not null references public.match_methods(method_id),
  status              text not null check (status in ('eligible','cannot_confirm','not_eligible','excluded')),
  status_reason       text not null,
  rank                int,
  pref_points         numeric not null default 0,
  reasons             jsonb not null default '[]',
  gaps                jsonb not null default '[]',
  unknowns            jsonb not null default '[]',
  mandatory           jsonb not null default '[]',
  desirable           jsonb not null default '[]',
  ai_notes            jsonb not null default '[]',
  computed_at         timestamptz not null default now(),
  created_at          timestamptz not null default now(),
  foreign key (student_id, profile_version) references public.profile_versions(student_id, profile_version),
  foreign key (opportunity_id, opportunity_version) references public.opportunity_versions(opportunity_id, version)
);
comment on table public.recommendations is 'Append-only. The ID is a hash of all input versions and the method, so new inputs create a new record.';

create table public.skill_gap_events (
  gap_id            text primary key check (gap_id ~ '^GAP-[0-9A-Z]{4,}$'),
  recommendation_id text not null references public.recommendations(recommendation_id),
  student_id        text not null references public.students(student_id),
  skill_id          text not null references public.skills(skill_id),
  opportunity_id    text not null,
  requirement       text not null check (requirement in ('mandatory','desirable')),
  status            text not null default 'sent' check (status in ('sent','acknowledged','resolved')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
comment on table public.skill_gap_events is 'P05 to P06 hand-off. P05 creates; P06 moves status to acknowledged/resolved.';

create table public.recommendation_challenges (
  challenge_id      text primary key check (challenge_id ~ '^CH-[0-9A-Z]{3,}$'),
  recommendation_id text not null references public.recommendations(recommendation_id),
  raised_by         text not null,
  question          text not null check (length(question) between 1 and 2000),
  status            text not null default 'open' check (status in ('open','reviewed')),
  resolution        text,
  resolved_by       text,
  resolved_at       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table public.coordinator_labels (
  label_id       bigint generated always as identity primary key,
  student_id     text not null references public.students(student_id),
  opportunity_id text not null,
  label          text not null check (label in ('good_fit','possible','not_fit')),
  labelled_by    text not null,
  note           text,
  created_at     timestamptz not null default now(),
  unique (student_id, opportunity_id, labelled_by)
);
comment on table public.coordinator_labels is 'Human judgements used to compare the rules baseline with the AI method. Not hiring decisions.';

create table public.ai_embeddings (
  kind        text not null check (kind in ('skill','goal','opportunity','phrase')),
  ref_id      text not null,
  model       text not null,
  source_text text not null,
  text_hash   text generated always as (md5(source_text)) stored,
  embedding   extensions.vector(384) not null,
  created_at  timestamptz not null default now(),
  primary key (kind, ref_id, model)
);
create index ai_embeddings_text_idx on public.ai_embeddings (kind, model, text_hash);
comment on table public.ai_embeddings is 'Sentence embeddings (Supabase/gte-small, 384 dims) used by P05 ai-embed methods. ref_id: skill_id, STUDENT@version, OP@version or phrase text.';

-- ---------- P06 preparation and skill evidence ----------
create table public.learning_modules (
  module_id  text primary key check (module_id ~ '^MOD-[A-Z]+-[0-9]{2}$'),
  skill_id   text not null references public.skills(skill_id),
  title      text not null,
  outcome    text,
  created_at timestamptz not null default now()
);

create table public.skill_evidence (
  evidence_id    text primary key check (evidence_id ~ '^E-[A-Z]+-[0-9]{2,}$'),
  student_id     text not null references public.students(student_id),
  skill_id       text not null references public.skills(skill_id),
  module_id      text references public.learning_modules(module_id),
  gap_id         text,
  activity       text not null,
  review_outcome text not null check (review_outcome in ('pending','revision_requested','demonstrated','not_demonstrated')),
  reviewer       text,
  reviewed_at    date,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
comment on column public.skill_evidence.gap_id is 'Soft reference to skill_gap_events.gap_id when the evidence answers a P05 gap.';

-- ---------- P07 learning progress ----------
create table public.learning_logs (
  log_id        text primary key check (log_id ~ '^LOG-[0-9]{4,}$'),
  placement_id  text not null references public.placements(placement_id),
  period        text not null,
  goal_id       text,
  entry         text not null,
  evidence_ids  text[] not null default '{}',
  feedback      text,
  review_status text not null check (review_status in ('submitted','reviewed','revision_requested')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ---------- helpful indexes ----------
create index on public.profile_versions (student_id, status);
create index on public.profile_skills (skill_id);
create index on public.opportunity_conditions (skill_id);
create index on public.listings (listing_status);
create index on public.applications (student_id);
create index on public.applications (opportunity_id);
create index on public.application_events (application_id);
create index on public.recommendations (student_id, method_id);
create index on public.recommendations (opportunity_id);
create index on public.skill_gap_events (student_id);
create index on public.skill_evidence (student_id, skill_id);
create index on public.learning_logs (placement_id);

-- ---------- updated_at bookkeeping ----------
create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger listings_touch before update on public.listings for each row execute function public.touch_updated_at();
create trigger applications_touch before update on public.applications for each row execute function public.touch_updated_at();
create trigger gaps_touch before update on public.skill_gap_events for each row execute function public.touch_updated_at();
create trigger challenges_touch before update on public.recommendation_challenges for each row execute function public.touch_updated_at();
create trigger evidence_touch before update on public.skill_evidence for each row execute function public.touch_updated_at();
create trigger logs_touch before update on public.learning_logs for each row execute function public.touch_updated_at();
