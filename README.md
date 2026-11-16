# P05 Opportunity Matcher — Team 5 prototype (Sprint 2 increment)

BUS2010 Co-op Platform · P05 AI-Assisted Opportunity Matching.
All people, employers, records and decisions are synthetic.

## Run it

- **Open `index.html`** in any browser (double-click). It loads the shared BUS2010 database; if that cannot be reached it says "Demo data — couldn't reach the shared database" and uses the six built-in students. Add `?demo` to the address to force the offline copy.
- Tests: `node tests/run-tests.js` (21 checks on the fixtures with precomputed AI scores).
- Live checks (maintainer, needs `supabase/.env.local` and `supabase/team-keys.private.md`): `node scripts/verify_live.mjs` (demo slice equals `src/data.js`, the 21 checks on live data, row counts, access rules) and `node scripts/test_guide_examples.mjs` (runs every example in the partner guide).
- Rebuild `index.html` after editing `src/`: `python3 build.py`, then copy `dist/index.html` over `index.html`.

## Files

| Path | What it is |
|---|---|
| `src/data.js` | Offline fixtures: 6 students, 6 listings, 14-term vocabulary, evidence, data dictionary. Seeded defects D1–D8. Identical to the demo slice in the database. |
| `src/ai-signals.js` | Precomputed gte-small scores for the demo slice (generated), so the AI method also works offline. |
| `src/config.js` | Database URL and publishable (read-only) key. No team keys. |
| `src/supabase-source.js` | Reads the shared database over REST and maps rows into the engine's data shape; AI scores (`rpc/ai_signals`), live phrase suggestions (`functions/v1/ai-suggest`), opt-in writes with the P05 key. |
| `src/engine.js` | Matching engine: rules baseline `rules-1.0.0` and AI method `ai-embed-1.0.0`, three-state conditions, explanations, immutable records, gap events, recompute, notes, method versions. |
| `src/eval.js` | Rules vs AI comparison on 30 labelled pairs (labels provisional). |
| `src/tests.js` | 21 checks: D1–D8, M1, M2, R1, R2, H1, I1, I2, S1, A1–A3, E1, L1. |
| `src/app.js`, `src/styles.css`, `src/app.html` | Browser UI. |
| `supabase/migrations/` | Shared database schema, access rules (RLS + team keys), views, AI functions. |
| `supabase/seed/` | Generated synthetic data (`node scripts/generate_seed.mjs`, fixed seed). `supabase/sandbox/` holds practice records for other teams. |
| `supabase/functions/ai-suggest/` | Edge Function: embeds a new phrase with gte-small and returns the nearest skill terms. |
| `scripts/` | Seed generator, team-key rotation, sandbox reset, live verification, guide example runner. |
| `docs/SUPABASE_GUIDE.md` | Guide for the other six teams (connect, ownership, data dictionary, rules, hand-off recipes). |
| `docs/AI_METHOD.md` | Sprint 2 AI method record: goal, success criteria, CRISP-DM mapping, results, failure and correction, limits. |

## Sprint 2 additions to the demo

- **Top 3 for you** on My matches, each with plain reasons; ranking is decision support, eligibility is checked separately, placements are approved by a person.
- **Coordinator → Students see → With AI similarity (gte-small):** the AI adds a "close in meaning" reason and reorders jobs within the same group. **Compare both methods** shows the difference.
- **Coordinator → AI skill suggestions:** Arjun's "agile board hygiene" → Agile (0.878), Jira (0.858); Confirm or Reject sends a note to P01, the profile is unchanged. **Try a phrase** asks the live model (try "customer journey mapping" to show the known failure).
- **Quality checks:** 21 of 21, plus the rules vs AI comparison.
- **Data:** where the data comes from; P05 writing to the shared database (opt-in with the P05 key).

## Demo script (about 4 minutes)

The first time the page opens, a welcome screen explains the 7-step co-op journey. "Show me around" starts a 6-step guided tour. "Guide" replays it, "?" opens the glossary, and the last button switches light and dark mode.

1. **How it works.** Show the 7 steps and point at step 4: our team (P05) decides which jobs fit a student and what is missing.
2. **My matches, Layla.** The summary says she can apply to 2 jobs and 2 need one thing from her. Results use three colours only: green ✓ can apply, yellow ! one thing to do, gray – not now or closed.
3. **Your next step** (lime card): "Get Jira verified to unlock Aviation Analytics Intern". Open the job with **View**: it lists why it was suggested and what it requires; Jira shows a yellow ! because Layla listed it herself and nobody verified it.
4. Click **Send Jira to skills training**.
5. **Partner teams** (simulated P06): **Review the work**, then **Save review**. The loop shows the skill reviewed and the profile updated.
6. **My matches**: "Good news: Jira is now verified" then **Refresh my matches**. "What changed" shows Aviation Analytics Intern moving to Can apply, number 1. Older results are kept.
7. **Coordinator**: Arjun's question about his "agile board hygiene" phrase. Check the result and leave a correction note; the profile itself is never edited.
8. **Quality checks**: 21 of 21 checks pass; the 6 × 6 grid shows every student against every job, with the eight planted data problems D1–D8.

"Start the demo over" on the Data page resets everything.

## Working / simulated / deferred

- **Working:** shared Supabase database with per-team write keys and row level security; live data in the prototype with offline fallback; rules baseline with editable weights and method versions; AI method with a pretrained embedding model (gte-small) for goal ↔ job meaning and free-text skill suggestions, labelled and bounded; three-state conditions; explanations with field and version citations; skill gaps; recompute with history; challenges and coordinator review; correction notes; immutable records; 21 checks; live verification scripts.
- **Simulated:** P01 profile edits and P06 reviews inside the prototype (they are stored in this browser; the real teams write to the database themselves); identities (role tabs, no sign-in); coordinator labels (written by Team 5 as a stand-in).
- **Deferred:** labels from a real coordinator (20+ pairs); jointly tested live hand-off with P06; usability test with three non-builders; synonym fixes found by the AI failure analysis.
