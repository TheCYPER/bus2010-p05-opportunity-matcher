#!/usr/bin/env node
// Resets the practice records (COOP-Z001, EMP-999, OP-999) to their starting state.
// Maintainer only: runs SQL through the Management API with the logged-in Supabase CLI token.
// Usage: node scripts/sandbox.mjs reset
import { readFileSync } from 'node:fs';
import { runSql } from './lib/mgmt.mjs';

const CLEAR = `
delete from public.learning_logs where placement_id in (select placement_id from public.placements where student_id = 'COOP-Z001' or opportunity_id = 'OP-999');
delete from public.placements where student_id = 'COOP-Z001' or opportunity_id = 'OP-999';
delete from public.application_events where application_id in (select application_id from public.applications where student_id = 'COOP-Z001' or opportunity_id = 'OP-999');
delete from public.applications where student_id = 'COOP-Z001' or opportunity_id = 'OP-999';
delete from public.skill_evidence where student_id = 'COOP-Z001';
delete from public.recommendation_challenges where recommendation_id in (select recommendation_id from public.recommendations where student_id = 'COOP-Z001' or opportunity_id = 'OP-999');
delete from public.skill_gap_events where student_id = 'COOP-Z001' or opportunity_id = 'OP-999';
delete from public.recommendations where student_id = 'COOP-Z001' or opportunity_id = 'OP-999';
delete from public.coordinator_labels where student_id = 'COOP-Z001' or opportunity_id = 'OP-999' or labelled_by like '%probe%';
delete from public.ai_embeddings where ref_id like 'COOP-Z001@%' or ref_id like 'OP-999@%';
delete from public.profile_unmapped_skills where student_id = 'COOP-Z001';
delete from public.profile_skills where student_id = 'COOP-Z001';
delete from public.profile_versions where student_id = 'COOP-Z001';
delete from public.students where student_id = 'COOP-Z001';
delete from public.listings where opportunity_id = 'OP-999';
delete from public.listing_reviews where opportunity_id = 'OP-999';
delete from public.opportunity_conditions where opportunity_id = 'OP-999';
delete from public.opportunity_versions where opportunity_id = 'OP-999';
delete from public.employers where employer_id = 'EMP-999';
delete from public.match_methods where method_id like 'practice-%';
`;

if (process.argv[2] !== 'reset') {
  console.log('Usage: node scripts/sandbox.mjs reset');
  process.exit(1);
}
const seed = readFileSync(new URL('../supabase/sandbox/sandbox.sql', import.meta.url), 'utf8');
await runSql(`begin;\n${CLEAR}\n${seed}\ncommit;`);
console.log('Sandbox reset: COOP-Z001, EMP-999, OP-999 are back to their starting state.');
