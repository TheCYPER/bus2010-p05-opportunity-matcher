# Shared Co-op Platform Database: Guide for Partner Teams

BUS2010 Co-op Platform · maintained by Team 5 (P05 AI-assisted matching) · last checked 16 November 2026

Every example in this guide was run against the live database before it was handed over (`node scripts/test_guide_examples.mjs`).

See P05 use it: https://thecyper.github.io/bus2010-p05-opportunity-matcher/ · source: https://github.com/TheCYPER/bus2010-p05-opportunity-matcher

## 1. What this is

One shared [Supabase](https://supabase.com) (PostgreSQL) database that the seven BUS2010 co-op teams can read and write, so each team's prototype works on the same students, employers and jobs instead of seven separate fixture files.

- **Synthetic data only.** Every student, employer, record and decision is invented. Never store real personal information here.
- **What is in it** (16 November 2026): 44 shared skill terms, 60 employers, 400 students with 808 profile versions, 240 opportunities with 404 versions, 208 listings (178 open), 616 applications with 1,422 status events, 53 placements, 831 skill-evidence records, 127 learning logs, 8,231 P05 recommendations and 421 skill-gap events, plus the sandbox records below.
- **Demo thread kept exactly as in the binder:** Layla Hassan `COOP-B001`, OP-028 Aviation Analytics Intern (version 2), APP-028, skill `SK-JIRA-01` self-declared until evidence `E-JIRA-01` is reviewed. Students `COOP-B001`…`COOP-B006` and listings `OP-026`…`OP-031` contain the eight planted data problems P05 tests against (missing end date, self-declared skill, free-text skill, listing with no requirements, closed listing, superseded version, profile changed after a result, remote-only student). Please do not change them; use the sandbox instead.
- **Sandbox for practice:** student `COOP-Z001`, employer `EMP-999`, listing `OP-999`. Write to these as much as you like; Team 5 resets them with `node scripts/sandbox.mjs reset`.
- **Scope note:** the group brief assumed no shared service. Sharing one database is a scope change agreed for the co-op project; Team 5 hosts it on a free Supabase project.

## 2. Connect in five minutes

| Setting | Value |
| --- | --- |
| Project URL | `https://zbcgneyhwuswyxeaufjh.supabase.co` |
| Publishable key (read-only, safe in a web page) | `sb_publishable_YFs2qxwH6YU7-F-_8_ppoQ_-hW861yy` |
| REST endpoint | `https://zbcgneyhwuswyxeaufjh.supabase.co/rest/v1/<table or view>` |
| Your team's write key | Ask Che (Team 5) in a direct message. Each team gets its own key. |

The publishable key lets anyone **read** every table. To **write**, add your team's key in the `x-team-key` header. Keep that key out of GitHub, group chats and published pages: put it in an environment variable or a local `.env` file that git ignores.

### REST with curl

```bash
export SB_URL=https://zbcgneyhwuswyxeaufjh.supabase.co
export SB_KEY=sb_publishable_YFs2qxwH6YU7-F-_8_ppoQ_-hW861yy

# Five open listings with their requirements
curl -fsS "$SB_URL/rest/v1/open_listings?select=opportunity_id,version,title,employer,city,mandatory&order=opportunity_id&limit=5" \
  -H "apikey: $SB_KEY"
```

Filters use PostgREST syntax: `?column=eq.value`, `gt.`, `in.(a,b)`, `order=column.desc`, `limit=`, `offset=`. One request returns at most 1,000 rows; page with `limit` and `offset`. When you insert several rows in one request, every row must have the same fields (use `null` for an empty one).

### JavaScript (browser or Node) with supabase-js

```js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient('https://zbcgneyhwuswyxeaufjh.supabase.co', 'sb_publishable_YFs2qxwH6YU7-F-_8_ppoQ_-hW861yy');

// Layla's current profile, with skills and their review status
const { data, error } = await supabase
  .from('current_profiles')
  .select('student_id, full_name, profile_version, goals, skills, unmapped_skills')
  .eq('student_id', 'COOP-B001')
  .single();
if (error) throw error;
console.log(data.full_name, 'profile v' + data.profile_version, data.skills.map((s) => `${s.skill_id} (${s.source})`).join(', '));
```

In a page without a bundler, load it with `<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4"></script>` and call `supabase.createClient(...)`. To write, create a second client with your key in the header:

```js
import { createClient } from '@supabase/supabase-js';

const writer = createClient('https://zbcgneyhwuswyxeaufjh.supabase.co', 'sb_publishable_YFs2qxwH6YU7-F-_8_ppoQ_-hW861yy', {
  global: { headers: { 'x-team-key': process.env.P07_KEY } } // your team's key, never hard-coded
});
const { data: team, error } = await writer.rpc('whoami');
if (error) throw error;
console.log('This key writes as', team); // "P07"; null means the key is wrong
```

### Python (standard library only)

```python
import json, urllib.request

URL = "https://zbcgneyhwuswyxeaufjh.supabase.co"
KEY = "sb_publishable_YFs2qxwH6YU7-F-_8_ppoQ_-hW861yy"

def get(path):
    req = urllib.request.Request(f"{URL}/rest/v1/{path}", headers={"apikey": KEY})
    with urllib.request.urlopen(req, timeout=20) as res:
        return json.load(res)

rows = get("open_listings?select=opportunity_id,title,sector,city&sector=eq.aviation&order=opportunity_id")
print(len(rows), "open aviation listings, e.g.", rows[0]["opportunity_id"], rows[0]["title"])
```

The `supabase` package for Python (`pip install supabase`) works the same way as supabase-js if you prefer it.

## 3. Which team owns which tables

Everyone can read everything. Only the owner team inserts; some tables also allow updates by named teams. Nobody can delete through the API. The same map is in the database:

```bash
curl -fsS "$SB_URL/rest/v1/table_owners?select=table_name,owner_team,insert_teams,update_teams,append_only&order=owner_team,table_name" \
  -H "apikey: $SB_KEY"
```

| Team | Tables it writes | Can update |
| --- | --- | --- |
| P01 Student profiles | `students`, `profile_versions`, `profile_skills`, `profile_unmapped_skills`; may add `skills` | `students` |
| P02 Employer submissions | `employers`, `opportunity_versions`, `opportunity_conditions` | `employers` |
| P03 Review and publication | `listing_reviews`, `listings` | `listings` (status, approved version) |
| P04 Applications | `applications`, `application_events`, `placements` | `applications` (status) |
| P05 Matching (Team 5) | `match_methods`, `recommendations`, `skill_gap_events`, `recommendation_challenges`, `coordinator_labels`, `ai_embeddings`; curates `skills` | `skill_gap_events`, `recommendation_challenges`, `coordinator_labels`, `ai_embeddings`, `skills` |
| P06 Preparation LMS | `learning_modules`, `skill_evidence`; may add `skills` | `learning_modules`, `skill_evidence`, `skill_gap_events` (status only) |
| P07 Learning progress | `learning_logs` | `learning_logs` |
| Maintainer only | `teams`, `table_owners` | – |

## 4. Tables and fields

All tables live in the `public` schema, use snake_case, and have `created_at` (timestamp, set by the database). Text IDs follow the binder. "Append-only" means rows are never updated: a change is a new row with a higher version number.

**Read-friendly views** (use these first):

| View | One row per | Notes |
| --- | --- | --- |
| `current_profiles` | student | Newest profile version whose status is `submitted` or `reviewed`. Drafts and clarification requests are ignored. Includes `skills` (JSON list) and `unmapped_skills`. |
| `profile_feed` | usable profile version | Every submitted or reviewed version, same columns as `current_profiles`. |
| `open_listings` | open listing | The approved version of every open listing, with `mandatory` and `desirable` condition lists and the employer name. |
| `opportunity_feed` | version of a listed opportunity | All versions, plus `approved_version`, `listing_status`, `closed_on`. Show students only rows where `version = approved_version`. |
| `latest_recommendations` | student × opportunity × method | Newest stored P05 result. |

**Shared**

| Table | Key | Fields |
| --- | --- | --- |
| `teams` | `team_id` (`P01`…`P07`) | `name` |
| `skills` | `skill_id` (`SK-SQL-01`) | `label`, `synonyms` (text list), `category`. 44 terms; the first 14 are the original P05/P06 vocabulary. |
| `table_owners` | `table_name` | `owner_team`, `insert_teams`, `update_teams`, `append_only`, `notes` |

**P01 student profiles**

| Table | Key | Fields and rules |
| --- | --- | --- |
| `students` | `student_id` (`COOP-B001`) | `full_name`, `programme`, `year` (1–6) |
| `profile_versions` | `student_id` + `profile_version` | `status` draft / submitted / clarification_requested / reviewed; `goals`; `sectors`, `roles`, `locations`, `work_arrangements` (on-site / hybrid / remote) as text lists; `available_from`, `available_to` (dates, may be null = unknown); `change_note`, `coordinator_comment`, `published_at`. Append-only. |
| `profile_skills` | `student_id` + `profile_version` + `skill_id` | `source` self_declared / reviewed; `evidence_id` (required when reviewed, and it must be a `demonstrated` row in `skill_evidence` for the same student and skill: the database checks this); `review_date` |
| `profile_unmapped_skills` | `student_id` + `profile_version` + `phrase` | Free-text skills with no vocabulary term. Never matched silently. |

**P02 employer submissions**

| Table | Key | Fields and rules |
| --- | --- | --- |
| `employers` | `employer_id` (`EMP-001`) | `name`, `sector`, `city` |
| `opportunity_versions` | `opportunity_id` (`OP-028`) + `version` | `employer_id`, `title`, `sector`, `role_family`, `city`, `work_arrangement`, `start_date`, `end_date`, `description`, `tasks` (text list), `supervisor_name`, `submission_status` draft / submitted / clarification_requested / resubmitted / withdrawn, `submitted_at`. Append-only. |
| `opportunity_conditions` | `opportunity_id` + `version` + `requirement` + `position` | `requirement` mandatory / desirable; `kind` skill / availability / arrangement; `skill_id` (for skill); `arrangements` + `city` (for arrangement). Desirable conditions are skills only. Append-only. |

**P03 review and publication**

| Table | Key | Fields and rules |
| --- | --- | --- |
| `listing_reviews` | `review_id` (`REV-0001`) | `opportunity_id`, `version`, `decision` clarification_requested / approved / declined, `reviewer`, `reason`, `decided_at`. Append-only. |
| `listings` | `opportunity_id` | `approved_version` (the only version students see), `listing_status` open / closed / withdrawn, `published_at`, `closed_on` (required unless open), `updated_at` |

**P04 applications and placements**

| Table | Key | Fields and rules |
| --- | --- | --- |
| `applications` | `application_id` (`APP-028`) | `student_id`, `opportunity_id`, `opportunity_version`, `profile_version`, `status` submitted / under_review / interview / offer / accepted / not_selected / withdrawn, `updated_at`. Every status change also goes into `application_events`. |
| `application_events` | `event_id` (number, automatic) | `application_id`, `status`, `actor`, `note`, `at`. Append-only. |
| `placements` | `placement_id` (`EG-DXB-028`: employer initials, city code, opportunity number) | `application_id` (one placement per application), `student_id`, `opportunity_id`, `confirmed_by` (a person), `confirmed_at`. Append-only. |

**P05 matching**

| Table | Key | Fields and rules |
| --- | --- | --- |
| `match_methods` | `method_id` (`rules-1.0.0`) | `family` rules / ai, `label`, `weights` (JSON), `params` (JSON), `model`, `notes`. Append-only. |
| `recommendations` | `recommendation_id` (`REC-` + 8 hex, a hash of all input versions and the method) | `student_id`, `profile_version`, `opportunity_id`, `opportunity_version`, `method_id`, `status` eligible / cannot_confirm / not_eligible / excluded, `status_reason`, `rank`, `pref_points`, and JSON lists `reasons`, `gaps`, `unknowns`, `mandatory`, `desirable`, `ai_notes`; `computed_at`. Append-only. Top 10 per student per method are stored. |
| `skill_gap_events` | `gap_id` (`GAP-0001`) | `recommendation_id`, `student_id`, `skill_id`, `opportunity_id`, `requirement`, `status` sent / acknowledged / resolved, `updated_at`. P06 may change `status` only. |
| `recommendation_challenges` | `challenge_id` (`CH-001`) | `recommendation_id`, `raised_by`, `question`, `status` open / reviewed, `resolution`, `resolved_by`, `resolved_at` |
| `coordinator_labels` | `label_id` (automatic) | `student_id`, `opportunity_id`, `label` good_fit / possible / not_fit, `labelled_by`, `note`. The 30 current labels are provisional (written by Team 5, not a coordinator). |
| `ai_embeddings` | `kind` + `ref_id` + `model` | `kind` skill / goal / opportunity / phrase; `source_text`; `embedding` (384 numbers from the pretrained `Supabase/gte-small` model). |

**P06 preparation and evidence**

| Table | Key | Fields and rules |
| --- | --- | --- |
| `learning_modules` | `module_id` (`MOD-JIRA-01`) | `skill_id`, `title`, `outcome`. One per skill term. |
| `skill_evidence` | `evidence_id` (`E-JIRA-01`) | `student_id`, `skill_id`, `module_id`, `gap_id` (when it answers a P05 gap), `activity`, `review_outcome` pending / revision_requested / demonstrated / not_demonstrated, `reviewer`, `reviewed_at` |

**P07 learning progress**

| Table | Key | Fields and rules |
| --- | --- | --- |
| `learning_logs` | `log_id` (`LOG-0001`) | `placement_id`, `period`, `goal_id`, `entry`, `evidence_ids` (text list), `feedback`, `review_status` submitted / reviewed / revision_requested. Placements start in 2027, so most logs are simulated future entries for testing. |

**P05 AI functions** (callable with the publishable key)

| Function | What it returns |
| --- | --- |
| `rpc/ai_signals` with `{"p_goal": "...", "p_phrases": ["..."]}` | Cosine similarity of a stored goal text to every opportunity version (`"OP-028@2": 0.9117`), and the 3 nearest skill terms for each stored phrase. |
| `functions/v1/ai-suggest` with `{"phrase": "..."}` | Embeds any new phrase live with gte-small and returns the 3 nearest skill terms. A score of 0.84 or more counts as a suggestion. Suggestions are unconfirmed: a person decides. Send the publishable key as `apikey`; phrases up to 120 characters; about 20 calls a minute per client. |
| `rpc/whoami` with your `x-team-key` | Which team your key writes as, or null. |

```bash
curl -fsS -X POST "$SB_URL/functions/v1/ai-suggest" -H "apikey: $SB_KEY" -H "Content-Type: application/json" \
  -d '{"phrase": "agile board hygiene"}'
```

## 5. Rules everyone follows

1. **Synthetic data only.** No real names, emails, phone numbers or student records.
2. **Never overwrite another team's records.** The database refuses writes to tables you do not own. If another team's data looks wrong, tell them (or leave a correction note through P05's coordinator view); do not work around it.
3. **Versions are append-only.** To change a profile or an opportunity, insert a new row with `version + 1`. Old versions stay, so every result can be traced to what it used.
4. **Use the shared IDs and vocabulary.** Skill IDs come from `skills`; if a term is missing, P01 or P06 may add one (`SK-WORD-01` format) and tell P05. Keep the ID formats in section 4.
5. **Verified means verified.** A profile skill can be `reviewed` only after P06 has recorded `demonstrated` evidence for that student and skill. P01 adds the reviewed skill in a new profile version after that.
6. **Unknown is not "no".** Leave a date or field null when it is unknown; P05 shows it as "cannot confirm", never as a failure.
7. **People approve.** Rankings are decision support. Placements are confirmed by a named person (`placements.confirmed_by`), never by code.
8. **Write access:** ask Che (Team 5) for your team's key. Keys can be rotated if one leaks; tell Team 5 at once.
9. **Practise on the sandbox** (`COOP-Z001`, `EMP-999`, `OP-999`), not on the demo thread.

What happens when a rule is broken: inserting without a key or with another team's key returns HTTP 401 `new row violates row-level security policy`; updating an append-only table or another team's table changes zero rows; deleting returns HTTP 401 `permission denied`; a `reviewed` skill without demonstrated evidence returns HTTP 400 `not demonstrated evidence`.

## 6. Hand-off recipes

The recipes below run in order on the sandbox. Each team only needs its own key (`P0x_KEY` in your environment). `SB_URL` and `SB_KEY` are set as in section 2.

### 6.1 P02 submits, P03 publishes, P04 and P05 read

P02 submits version 2 of the practice listing with a new requirement:

```bash
curl -fsS -X POST "$SB_URL/rest/v1/opportunity_versions" -H "apikey: $SB_KEY" -H "x-team-key: $P02_KEY" \
  -H "Content-Type: application/json" -H "Prefer: return=minimal" \
  -d '{"opportunity_id":"OP-999","version":2,"employer_id":"EMP-999","title":"Practice listing (sandbox, not a real job)","sector":"other","role_family":"practice","city":"Abu Dhabi","work_arrangement":"hybrid","start_date":"2027-02-01","end_date":"2027-05-15","description":"Version 2: SQL is still required; Jira is now nice to have.","submission_status":"resubmitted","submitted_at":"2026-11-16T10:00:00Z"}'
curl -fsS -X POST "$SB_URL/rest/v1/opportunity_conditions" -H "apikey: $SB_KEY" -H "x-team-key: $P02_KEY" \
  -H "Content-Type: application/json" -H "Prefer: return=minimal" \
  -d '[{"opportunity_id":"OP-999","version":2,"requirement":"mandatory","position":0,"kind":"skill","skill_id":"SK-SQL-01"},
       {"opportunity_id":"OP-999","version":2,"requirement":"mandatory","position":1,"kind":"availability","skill_id":null},
       {"opportunity_id":"OP-999","version":2,"requirement":"desirable","position":0,"kind":"skill","skill_id":"SK-JIRA-01"}]'
```

P03 approves it and moves the listing to the new version:

```bash
curl -fsS -X POST "$SB_URL/rest/v1/listing_reviews" -H "apikey: $SB_KEY" -H "x-team-key: $P03_KEY" \
  -H "Content-Type: application/json" -H "Prefer: return=minimal" \
  -d '{"review_id":"REV-9998","opportunity_id":"OP-999","version":2,"decision":"approved","reviewer":"Sandbox reviewer","reason":"Clearer requirements","decided_at":"2026-11-16T11:00:00Z"}'
curl -fsS -X PATCH "$SB_URL/rest/v1/listings?opportunity_id=eq.OP-999" -H "apikey: $SB_KEY" -H "x-team-key: $P03_KEY" \
  -H "Content-Type: application/json" -H "Prefer: return=representation" \
  -d '{"approved_version":2,"published_at":"2026-11-16"}'
```

P04 and P05 now see version 2 in `open_listings`:

```bash
curl -fsS "$SB_URL/rest/v1/open_listings?opportunity_id=eq.OP-999&select=opportunity_id,version,title,mandatory,desirable" -H "apikey: $SB_KEY"
```

### 6.2 P05 sends a skill gap to P06

P05 stores a result and a gap. (P05 computes results with its engine; this is the minimal shape.)

```js
import { createClient } from '@supabase/supabase-js';

const p05 = createClient('https://zbcgneyhwuswyxeaufjh.supabase.co', 'sb_publishable_YFs2qxwH6YU7-F-_8_ppoQ_-hW861yy', {
  global: { headers: { 'x-team-key': process.env.P05_KEY } }
});
const rec = {
  recommendation_id: 'REC-00000999', student_id: 'COOP-Z001', profile_version: 1, opportunity_id: 'OP-999', opportunity_version: 2,
  method_id: 'rules-1.0.0', status: 'cannot_confirm', status_reason: 'Cannot confirm: SQL querying (SK-SQL-01)', rank: 1, pref_points: 0,
  gaps: [{ skill_id: 'SK-SQL-01', requirement: 'mandatory', current_source: 'self_declared' }]
};
let { error } = await p05.from('recommendations').insert(rec);
if (error) throw error;
({ error } = await p05.from('skill_gap_events').insert({
  gap_id: 'GAP-Z0001', recommendation_id: rec.recommendation_id, student_id: 'COOP-Z001', skill_id: 'SK-SQL-01', opportunity_id: 'OP-999', requirement: 'mandatory'
}));
if (error) throw error;
console.log('Gap GAP-Z0001 sent to P06');
```

P06 picks up new gaps and acknowledges one:

```bash
curl -fsS "$SB_URL/rest/v1/skill_gap_events?status=eq.sent&student_id=eq.COOP-Z001&select=gap_id,student_id,skill_id,opportunity_id,created_at" -H "apikey: $SB_KEY"
curl -fsS -X PATCH "$SB_URL/rest/v1/skill_gap_events?gap_id=eq.GAP-Z0001" -H "apikey: $SB_KEY" -H "x-team-key: $P06_KEY" \
  -H "Content-Type: application/json" -H "Prefer: return=representation" -d '{"status":"acknowledged"}'
```

### 6.3 P06 records evidence, P01 publishes a new profile version, P05 recomputes

P06 reviews the student's work and closes the gap:

```bash
curl -fsS -X POST "$SB_URL/rest/v1/skill_evidence" -H "apikey: $SB_KEY" -H "x-team-key: $P06_KEY" \
  -H "Content-Type: application/json" -H "Prefer: return=minimal" \
  -d '{"evidence_id":"E-SQL-9001","student_id":"COOP-Z001","skill_id":"SK-SQL-01","module_id":"MOD-SQL-01","gap_id":"GAP-Z0001","activity":"SQL practice set","review_outcome":"demonstrated","reviewer":"Sandbox reviewer","reviewed_at":"2026-11-16"}'
curl -fsS -X PATCH "$SB_URL/rest/v1/skill_gap_events?gap_id=eq.GAP-Z0001" -H "apikey: $SB_KEY" -H "x-team-key: $P06_KEY" \
  -H "Content-Type: application/json" -H "Prefer: return=minimal" -d '{"status":"resolved"}'
```

P01 publishes profile version 2 with the reviewed skill (a new version, never an edit):

```bash
curl -fsS -X POST "$SB_URL/rest/v1/profile_versions" -H "apikey: $SB_KEY" -H "x-team-key: $P01_KEY" \
  -H "Content-Type: application/json" -H "Prefer: return=minimal" \
  -d '{"student_id":"COOP-Z001","profile_version":2,"status":"submitted","goals":"Practise using the shared database API.","sectors":["other"],"roles":["practice"],"locations":["Abu Dhabi"],"work_arrangements":["hybrid"],"available_from":"2027-01-10","available_to":"2027-05-31","change_note":"Accepted reviewed evidence E-SQL-9001 from P06","published_at":"2026-11-16"}'
curl -fsS -X POST "$SB_URL/rest/v1/profile_skills" -H "apikey: $SB_KEY" -H "x-team-key: $P01_KEY" \
  -H "Content-Type: application/json" -H "Prefer: return=minimal" \
  -d '{"student_id":"COOP-Z001","profile_version":2,"skill_id":"SK-SQL-01","source":"reviewed","evidence_id":"E-SQL-9001","review_date":"2026-11-16"}'
```

P05 sees the newer version, recomputes and stores a new result; the old one stays:

```python
import json, os, urllib.request

URL = "https://zbcgneyhwuswyxeaufjh.supabase.co"
KEY = "sb_publishable_YFs2qxwH6YU7-F-_8_ppoQ_-hW861yy"

def call(method, path, body=None, team_key=None):
    headers = {"apikey": KEY, "Content-Type": "application/json", "Prefer": "return=minimal"}
    if team_key:
        headers["x-team-key"] = team_key
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f"{URL}/rest/v1/{path}", data=data, method=method, headers=headers)
    with urllib.request.urlopen(req, timeout=20) as res:
        text = res.read().decode()
        return json.loads(text) if text else None

profile = call("GET", "current_profiles?student_id=eq.COOP-Z001&select=profile_version,skills")[0]
print("current profile version", profile["profile_version"], [s["source"] for s in profile["skills"]])
call("POST", "recommendations", {
    "recommendation_id": "REC-00000998", "student_id": "COOP-Z001", "profile_version": profile["profile_version"],
    "opportunity_id": "OP-999", "opportunity_version": 2, "method_id": "rules-1.0.0", "status": "eligible",
    "status_reason": "All 2 mandatory conditions met", "rank": 1, "pref_points": 0}, os.environ["P05_KEY"])
history = call("GET", "recommendations?student_id=eq.COOP-Z001&select=recommendation_id,profile_version,status&order=profile_version")
print(history)
```

### 6.4 P04 records an application and a placement, P07 logs progress

```bash
curl -fsS -X POST "$SB_URL/rest/v1/applications" -H "apikey: $SB_KEY" -H "x-team-key: $P04_KEY" \
  -H "Content-Type: application/json" -H "Prefer: return=minimal" \
  -d '{"application_id":"APP-9001","student_id":"COOP-Z001","opportunity_id":"OP-999","opportunity_version":2,"profile_version":2,"status":"accepted"}'
curl -fsS -X POST "$SB_URL/rest/v1/application_events" -H "apikey: $SB_KEY" -H "x-team-key: $P04_KEY" \
  -H "Content-Type: application/json" -H "Prefer: return=minimal" \
  -d '[{"application_id":"APP-9001","status":"submitted","actor":"Student COOP-Z001","at":"2026-11-16T12:00:00Z"},
       {"application_id":"APP-9001","status":"accepted","actor":"Student COOP-Z001","at":"2026-11-16T12:30:00Z"}]'
curl -fsS -X POST "$SB_URL/rest/v1/placements" -H "apikey: $SB_KEY" -H "x-team-key: $P04_KEY" \
  -H "Content-Type: application/json" -H "Prefer: return=minimal" \
  -d '{"placement_id":"SBX-AUH-999","application_id":"APP-9001","student_id":"COOP-Z001","opportunity_id":"OP-999","confirmed_by":"Co-op office: sandbox officer","confirmed_at":"2026-11-16T13:00:00Z"}'
```

```js
import { createClient } from '@supabase/supabase-js';

const p07 = createClient('https://zbcgneyhwuswyxeaufjh.supabase.co', 'sb_publishable_YFs2qxwH6YU7-F-_8_ppoQ_-hW861yy', {
  global: { headers: { 'x-team-key': process.env.P07_KEY } }
});
const { error } = await p07.from('learning_logs').insert({
  log_id: 'LOG-9001', placement_id: 'SBX-AUH-999', period: 'Pre-placement plan', goal_id: 'G-1',
  entry: 'Goal: write three SQL reports for the team.', evidence_ids: ['E-SQL-9001'], review_status: 'submitted'
});
if (error) throw error;
const { data } = await p07.from('learning_logs').select('log_id, period, review_status').eq('placement_id', 'SBX-AUH-999');
console.log(data);
```

## 7. Help and change requests

- **Contact:** Che Liu, Team 5 (P05). Ask in the Scrum-of-Scrums channel or by direct message. Write keys are only sent one to one.
- **Schema changes:** describe the table or column you need in the SoS meeting (or send the SQL). Team 5 adds it as a migration in `supabase/migrations/` of the P05 repository and records the decision in the SoS minutes. Please do not ask for broader keys instead.
- **Reset the sandbox:** ask Team 5 (`node scripts/sandbox.mjs reset`).
- **Known limits:**
  - Free Supabase project: it pauses after about a week without traffic (Team 5 restores it; tell us if the API stops answering), has a 500 MB database limit and fair-use rate limits. Do not load-test it.
  - One REST request returns at most 1,000 rows; page with `limit` and `offset`.
  - There is no sign-in. Team keys identify teams, not people.
  - The publishable key is public on purpose: the data are synthetic. Never put real data here.
  - The first call to `ai-suggest` after a quiet period can take a few seconds while the model loads.
  - The 30 `coordinator_labels` are provisional until a real coordinator labels pairs.
