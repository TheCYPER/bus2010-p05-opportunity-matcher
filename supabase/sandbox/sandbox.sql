-- Practice records for other teams (and for the examples in docs/SUPABASE_GUIDE.md).
-- Anything with these IDs may be reset at any time by: node scripts/sandbox.mjs reset
--   student COOP-Z001, employer EMP-999, opportunity OP-999, review REV-9999
insert into public.employers (employer_id, name, sector, city) values
  ('EMP-999', 'Sandbox Employer (practice, not real)', 'other', 'Abu Dhabi');
insert into public.students (student_id, full_name, programme, year) values
  ('COOP-Z001', 'Sandbox Student (practice)', 'BSc Data Science', 3);
insert into public.profile_versions (student_id, profile_version, status, goals, sectors, roles, locations, work_arrangements, available_from, available_to, change_note, published_at) values
  ('COOP-Z001', 1, 'submitted', 'Practise using the shared database API.', array['other'], array['practice'], array['Abu Dhabi'], array['hybrid'], '2027-01-10', '2027-05-31', 'Sandbox profile', '2026-11-16');
insert into public.profile_skills (student_id, profile_version, skill_id, source, evidence_id, review_date) values
  ('COOP-Z001', 1, 'SK-SQL-01', 'self_declared', null, null);
insert into public.opportunity_versions (opportunity_id, version, employer_id, title, sector, role_family, city, work_arrangement, start_date, end_date, description, tasks, supervisor_name, submission_status, submitted_at) values
  ('OP-999', 1, 'EMP-999', 'Practice listing (sandbox, not a real job)', 'other', 'practice', 'Abu Dhabi', 'hybrid', '2027-02-01', '2027-05-15', 'A listing other teams can read and write while they learn the API.', array['Read this listing', 'Apply to it from P04'], 'Sandbox Supervisor', 'submitted', '2026-11-16T08:00:00Z');
insert into public.opportunity_conditions (opportunity_id, version, requirement, position, kind, skill_id, arrangements, city) values
  ('OP-999', 1, 'mandatory', 0, 'skill', 'SK-SQL-01', null, null),
  ('OP-999', 1, 'mandatory', 1, 'availability', null, null, null),
  ('OP-999', 1, 'desirable', 0, 'skill', 'SK-PY-01', null, null);
insert into public.listing_reviews (review_id, opportunity_id, version, decision, reviewer, reason, decided_at) values
  ('REV-9999', 'OP-999', 1, 'approved', 'Sandbox reviewer', 'Practice record', '2026-11-16T09:00:00Z');
insert into public.listings (opportunity_id, approved_version, listing_status, published_at, closed_on) values
  ('OP-999', 1, 'open', '2026-11-16', null);
