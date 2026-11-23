-- Student questions (recommendation_challenges) now match the stored result they are about.
-- The first seed gave each of the 25 questions a random text and picked only results students could
-- already apply to, so a question such as "why does this skill show as missing?" sat on a result that
-- said "can apply". The seed generator now chooses the result by kind (self-declared skill, missing
-- skill, dates, ranking) and writes the question and answer from what that result says.
-- This updates the same 25 rows in place (same IDs); created_at is kept by the touch trigger.
do $$
declare n int;
begin
  update public.recommendation_challenges c
     set recommendation_id = v.recommendation_id,
         raised_by         = v.raised_by,
         question          = v.question,
         status            = v.status,
         resolution        = v.resolution,
         resolved_by       = v.resolved_by,
         resolved_at       = v.resolved_at::timestamptz
    from (values
    ('CH-001', 'REC-C4FF7C82', 'COOP-B007', 'I used Machine learning fundamentals in my capstone project. Why does it show as missing?', 'reviewed', 'Machine learning fundamentals is not on your submitted profile (v1). Add it in P01 with the capstone as evidence; P06 reviews it and the result updates.', 'Sara Al-Marzouqi (coordinator, synthetic)', '2026-11-14T13:00:00Z'),
    ('CH-002', 'REC-DC07F1C9', 'COOP-B009', 'I listed R programming on my profile. Why does it not count for this job?', 'open', null, null, null),
    ('CH-003', 'REC-82FCE044', 'COOP-B014', 'Why do my dates not fit this job?', 'open', null, null, null),
    ('CH-004', 'REC-C3B51CDE', 'COOP-B044', 'I used Advanced Excel in my capstone project. Why does it show as missing?', 'open', null, null, null),
    ('CH-005', 'REC-D7388E29', 'COOP-B080', 'I listed Power BI dashboards on my profile. Why does it not count for this job?', 'open', null, null, null),
    ('CH-006', 'REC-0BE9DED5', 'COOP-B111', 'Why is this job below one I care less about?', 'open', null, null, null),
    ('CH-007', 'REC-F318714F', 'COOP-B114', 'I listed SQL querying on my profile. Why does it not count for this job?', 'open', null, null, null),
    ('CH-008', 'REC-76A11CB6', 'COOP-B121', 'I used R programming in my capstone project. Why does it show as missing?', 'reviewed', 'R programming is not on your submitted profile (v1). Add it in P01 with the capstone as evidence; P06 reviews it and the result updates.', 'Sara Al-Marzouqi (coordinator, synthetic)', '2026-11-14T13:00:00Z'),
    ('CH-009', 'REC-F8C2F170', 'COOP-B167', 'Why is this job below one I care less about?', 'reviewed', 'You can apply to this job. Jobs you can apply to come first; among them the order follows your sector, role and city choices. I left a note for P01 to update your interests.', 'Sara Al-Marzouqi (coordinator, synthetic)', '2026-11-14T13:00:00Z'),
    ('CH-010', 'REC-C2C08DED', 'COOP-B170', 'I listed Jira work-item management on my profile. Why does it not count for this job?', 'open', null, null, null),
    ('CH-011', 'REC-5765D1E1', 'COOP-B194', 'Why is this job below one I care less about?', 'open', null, null, null),
    ('CH-012', 'REC-996B0AE0', 'COOP-B204', 'Why is this job below one I care less about?', 'open', null, null, null),
    ('CH-013', 'REC-09DFF360', 'COOP-B214', 'Why is this job below one I care less about?', 'open', null, null, null),
    ('CH-014', 'REC-E99A7C14', 'COOP-B235', 'I listed Python for data analysis on my profile. Why does it not count for this job?', 'reviewed', 'Python for data analysis is on your profile as self-declared. A requirement needs reviewed evidence, so for now it counts only as nice to have. I sent it to P06 for a short review.', 'Sara Al-Marzouqi (coordinator, synthetic)', '2026-11-14T13:00:00Z'),
    ('CH-015', 'REC-A23973D1', 'COOP-B239', 'I used Applied statistics in my capstone project. Why does it show as missing?', 'open', null, null, null),
    ('CH-016', 'REC-BFF451FA', 'COOP-B240', 'I listed Project planning on my profile. Why does it not count for this job?', 'open', null, null, null),
    ('CH-017', 'REC-6E2E4D60', 'COOP-B241', 'Why is this job below one I care less about?', 'open', null, null, null),
    ('CH-018', 'REC-1308171E', 'COOP-B303', 'Why is this job below one I care less about?', 'reviewed', 'You can apply to this job. Jobs you can apply to come first; among them the order follows your sector, role and city choices. I left a note for P01 to update your interests.', 'Sara Al-Marzouqi (coordinator, synthetic)', '2026-11-14T13:00:00Z'),
    ('CH-019', 'REC-FAC4A9C8', 'COOP-B305', 'I listed Stakeholder communication on my profile. Why does it not count for this job?', 'open', null, null, null),
    ('CH-020', 'REC-33E0BED5', 'COOP-B343', 'I used Python for data analysis in my capstone project. Why does it show as missing?', 'open', null, null, null),
    ('CH-021', 'REC-C2CEBF3B', 'COOP-B345', 'I used REST API design in my capstone project. Why does it show as missing?', 'open', null, null, null),
    ('CH-022', 'REC-4AB29C8C', 'COOP-B384', 'Why is this job below one I care less about?', 'reviewed', 'You can apply to this job. Jobs you can apply to come first; among them the order follows your sector, role and city choices. I left a note for P01 to update your interests.', 'Sara Al-Marzouqi (coordinator, synthetic)', '2026-11-14T13:00:00Z'),
    ('CH-023', 'REC-DD54B9C5', 'COOP-B387', 'Why is this job below one I care less about?', 'reviewed', 'You can apply to this job. Jobs you can apply to come first; among them the order follows your sector, role and city choices. I left a note for P01 to update your interests.', 'Sara Al-Marzouqi (coordinator, synthetic)', '2026-11-14T13:00:00Z'),
    ('CH-024', 'REC-7ADF26E4', 'COOP-B388', 'I used Power BI dashboards in my capstone project. Why does it show as missing?', 'open', null, null, null),
    ('CH-025', 'REC-62C88ABC', 'COOP-B398', 'I listed Advanced Excel on my profile. Why does it not count for this job?', 'open', null, null, null)
    ) as v(challenge_id, recommendation_id, raised_by, question, status, resolution, resolved_by, resolved_at)
   where c.challenge_id = v.challenge_id;
  get diagnostics n = row_count;
  if n <> 25 then
    raise exception 'expected to update 25 challenges, updated %', n;
  end if;
end $$;
