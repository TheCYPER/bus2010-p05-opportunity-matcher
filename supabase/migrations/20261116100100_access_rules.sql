-- Access model
--   * Everyone with the publishable (anon) key can READ every table: the data are synthetic.
--   * Writing needs a per-team key sent as the HTTP header  x-team-key: <key>.
--     request_team() hashes that header and looks it up in private.team_keys.
--   * Each table names the teams that may insert and the teams that may update.
--     Append-only tables have no update rule. Nobody can delete through the API.
--   * The ownership map lives in public.table_owners so every team can query it.

create table public.table_owners (
  table_name   text primary key,
  owner_team   text not null references public.teams(team_id),
  insert_teams text[] not null,
  update_teams text[] not null default '{}',
  append_only  boolean not null,
  notes        text,
  created_at   timestamptz not null default now()
);
comment on table public.table_owners is 'Who may write which table. Read by the RLS set-up below and by other teams.';

insert into public.teams (team_id, name) values
  ('P01', 'Student profiles and internship interests'),
  ('P02', 'Employer opportunity submission'),
  ('P03', 'University staff review and publication'),
  ('P04', 'AI discovery and application tracking'),
  ('P05', 'AI-assisted matching'),
  ('P06', 'Internship preparation LMS'),
  ('P07', 'Co-op learning and progress');

insert into public.table_owners (table_name, owner_team, insert_teams, update_teams, append_only, notes) values
  ('teams',                     'P05', '{}',            '{}',        true,  'Fixed list. Changed only by the maintainer.'),
  ('table_owners',              'P05', '{}',            '{}',        true,  'This map. Changed only by migration.'),
  ('skills',                    'P05', '{P01,P05,P06}', '{P05}',     false, 'Shared vocabulary. Any of P01/P05/P06 may add a term; P05 curates labels and synonyms.'),
  ('students',                  'P01', '{P01}',         '{P01}',     false, null),
  ('profile_versions',          'P01', '{P01}',         '{}',        true,  'New version for every change.'),
  ('profile_skills',            'P01', '{P01}',         '{}',        true,  'Skills belong to one profile version.'),
  ('profile_unmapped_skills',   'P01', '{P01}',         '{}',        true,  null),
  ('employers',                 'P02', '{P02}',         '{P02}',     false, null),
  ('opportunity_versions',      'P02', '{P02}',         '{}',        true,  'New version for every change.'),
  ('opportunity_conditions',    'P02', '{P02}',         '{}',        true,  'Conditions belong to one opportunity version.'),
  ('listing_reviews',           'P03', '{P03}',         '{}',        true,  null),
  ('listings',                  'P03', '{P03}',         '{P03}',     false, 'P03 publishes, closes or withdraws.'),
  ('applications',              'P04', '{P04}',         '{P04}',     false, 'Status changes also go into application_events.'),
  ('application_events',        'P04', '{P04}',         '{}',        true,  null),
  ('placements',                'P04', '{P04}',         '{}',        true,  'Confirmed by a person.'),
  ('match_methods',             'P05', '{P05}',         '{}',        true,  'New method_id for every change of weights.'),
  ('recommendations',           'P05', '{P05}',         '{}',        true,  'Immutable; ID is a hash of input versions and method.'),
  ('skill_gap_events',          'P05', '{P05}',         '{P05,P06}', false, 'P06 may move status to acknowledged or resolved.'),
  ('recommendation_challenges', 'P05', '{P05}',         '{P05}',     false, null),
  ('coordinator_labels',        'P05', '{P05}',         '{P05}',     false, null),
  ('ai_embeddings',             'P05', '{P05}',         '{P05}',     false, null),
  ('learning_modules',          'P06', '{P06}',         '{P06}',     false, null),
  ('skill_evidence',            'P06', '{P06}',         '{P06}',     false, null),
  ('learning_logs',             'P07', '{P07}',         '{P07}',     false, null);

-- ---------- team keys (schema not exposed through the API) ----------
create schema if not exists private;
revoke all on schema private from public;
revoke all on schema private from anon, authenticated;

create table private.team_keys (
  team_id    text primary key references public.teams(team_id),
  key_hash   text not null unique,
  created_at timestamptz not null default now()
);

create or replace function public.request_team() returns text
language sql stable security definer set search_path = '' as $$
  select tk.team_id
  from private.team_keys tk
  where tk.key_hash = encode(extensions.digest(
          coalesce(nullif(current_setting('request.headers', true), '')::json ->> 'x-team-key', ''), 'sha256'), 'hex')
$$;
comment on function public.request_team() is 'Team whose key is in the x-team-key request header, or null.';
revoke all on function public.request_team() from public;
grant execute on function public.request_team() to anon, authenticated, service_role;

-- ---------- row level security from the ownership map ----------
do $$
declare
  owners public.table_owners[];
  o      public.table_owners;
begin
  -- Read the map into an array first: table_owners itself is altered inside the loop.
  owners := array(select t from public.table_owners t order by t.table_name);
  foreach o in array owners loop
    execute format('alter table public.%I enable row level security', o.table_name);
    execute format('create policy "read: everyone" on public.%I for select to anon, authenticated using (true)', o.table_name);
    if cardinality(o.insert_teams) > 0 then
      execute format(
        'create policy %I on public.%I for insert to anon, authenticated with check ((select public.request_team()) = any (%L::text[]))',
        'insert: ' || array_to_string(o.insert_teams, ', '), o.table_name, o.insert_teams);
    end if;
    if cardinality(o.update_teams) > 0 then
      execute format(
        'create policy %I on public.%I for update to anon, authenticated using ((select public.request_team()) = any (%L::text[])) with check ((select public.request_team()) = any (%L::text[]))',
        'update: ' || array_to_string(o.update_teams, ', '), o.table_name, o.update_teams, o.update_teams);
    end if;
  end loop;
end $$;

-- Nobody deletes or truncates through the API.
revoke delete, truncate on all tables in schema public from anon, authenticated;

-- A team can check its key: select whoami()  ->  'P05' or null.
create or replace function public.whoami() returns text
language sql stable set search_path = '' as $$ select public.request_team() $$;
grant execute on function public.whoami() to anon, authenticated;
