# Sprint 3: integration readiness (Team 5, P05)

Sprint 3 ran from 17 to 24 November 2026. Its goal, from the Sprint 2 lab notes: show an end-to-end path through one IPP app, where a student sees three recommended internships, understands what still needs human approval, and every team's part looks like one product. The professor's Sprint 3 template adds one request: “Please make your app look unified”.

All data is synthetic. Every figure below was checked against the live database or the code on 23 November 2026.

## Key user stories completed

| ID | Story | Acceptance criteria | Evidence |
| --- | --- | --- | --- |
| US-S3-1 | As a partner team, we read and write one shared database with our own key, so all seven modules use the same records. | Every table has one owner team; writes need that team’s key; versions are only added; nobody deletes; the guide’s examples run. | Team 1 (P01) wrote student `COOP-P001` (Mira Haddad) with 3 profile versions and 9 skills on 16 Nov using its own key. The shared app’s INTEGRATION.md maps its records to our tables. 16 of 16 live checks pass, including the access rules. |
| US-S3-2 | As a student whose profile another team created, I get AI-ranked internships with reasons straight away, so P05 works on everyone’s data, not only ours. | A profile written after the seed is ranked by both methods; the AI method uses the real model (not the word-overlap fallback); the AI never changes who can apply. | Mira (`COOP-P001`): 16 internships she can apply to, 29 with one thing to do. Her goal had no stored embedding, so the `ai-suggest` Edge Function now scores it live with gte-small (351 job versions). The AI moves Airport BI Developer Intern to second place. Live check: “A goal with no stored embedding gets live AI scores”. |
| US-S3-3 | As anyone moving between modules, I see one consistent app, so the platform feels like one product. | One palette, type and status-colour set for every page; no team module rewritten; type-check, 73 tests and build pass. | Pull request [ipp-coop#2](https://github.com/ipp-coop-2026/ipp-coop/pull/2) gives the shared app one look through its design tokens. Pull request [ipp-coop#3](https://github.com/ipp-coop-2026/ipp-coop/pull/3) adds P05 to its navigation (external, Phase 1). |

## Tools used

| Tool | What we used it for |
| --- | --- |
| Supabase | The shared PostgreSQL database for all seven teams: row level security with one key per team, read views, a pgvector table of embeddings, and the `ai-suggest` Edge Function |
| gte-small | Pretrained sentence-embedding model (not trained by us) for goal ↔ internship meaning and free-text skill suggestions |
| GitHub | Our repository and live prototype (GitHub Pages); a fork of the shared IPP app for pull requests |
| Shared IPP app | TanStack Start, React, Tailwind and shadcn: the common app the class is merging into |
| Claude Code | Building, testing and checking the database, prototype and documents |
| Team coordination | [Team chat and task board: the team to confirm] |

## Demo (24 November)

- Prototype: https://thecyper.github.io/bus2010-p05-opportunity-matcher/ (live data from the shared database)
- Shared app with the unified look: pull request #2 (local preview until merged); live demo of the current shared app: https://coh-ipp-coop-26b134973f81406a.cohesivity.workers.dev
- Journeys: (1) Mira, created by Team 1, ranked by P05 with live AI scores; (2) Layla’s Jira gap sent to skills training and back; (3) the coordinator confirms or rejects an AI skill suggestion.

## Key impediment from Sprint 2

| Field | Entry |
| --- | --- |
| ID | IMP-01 |
| Description | P05 could not use other teams’ student and listing data: Team 1’s app kept its own records with different field names, IDs and a different skill list (14 skill IDs against the shared 44; OP-026 is a design internship in Boston in one and an airport data internship in Dubai in the other; review IDs `REV-###` against `REV-0001`). |
| Impact | Recommendations could not be computed for students created in another module, and integration testing between P01 and P05 could not start. |
| Detected on | 16 November 2026 (first cross-team handoff); documented in the shared app’s INTEGRATION.md §7 on 22 November |
| Responsible | P01 and P05 integrators |
| Resolution | One shared database as the data contract: agreed tables and views, one owner per table, a written mapping from Team 1’s fields to the shared ones, and a tested guide. P01 now writes profiles there and P05 reads them; for new text, P05 computes AI scores live. |
| Escalation | Scrum of Scrums: the merge plan (shared app issue #1) gives P05 the shared read client `src/lib/db/` for 28 November to 4 December. |
| Status | Partly resolved. P01 → P05 through the database works (resolved 23 November). The shared app still shows its local seed records until the read client lands. |

## Retrospective: SoS liaison and team

**Cross-team communication**

- What helped: the guide with examples that had been run against the live data, and a sandbox. Team 1 wrote its first records on 16 November, the day the guide was shared.
- What hurt: decisions were scattered across chat, the guide and a new repository. We learned about the common repository only when it appeared on 23 November, and its open questions (instructor approval of the shared database, who owns the merged repository, the review-ID clash) are still open.
- Change for the final sprint: answer the merge-plan issue with our integrators, record every schema change as a migration with an entry in the shared decision log, and give each open question one owner and a date.

**Team learning**

- A data contract is worth more than a polished screen: the hardest Sprint 2 problem was field names, not the algorithm.
- Test the claims, not only the code: the guide test caught a broken bulk-insert example before other teams copied it.
- Keep AI bounded and labelled. A text with no AI score used to fall back silently to word overlap; it now gets a real score, and the fallback says “simulated” when it is used.

## Next (final sprint)

- Port the P05 engine into the shared app (`src/lib/p05/`) and replace the Recommended stand-in.
- Build `src/lib/db/`, the read-only Supabase client every team imports.
- A coordinator labels 20 or more pairs; fix the synonyms the AI failure showed; re-run the comparison.
- Joint test of the skill-gap handoff with P06 through the database.
