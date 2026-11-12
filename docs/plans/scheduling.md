# Scheduling: psi's booking engine

Status: plan and first slice, 2026-11-12. The code is `packages/scheduling` (`@psi/scheduling`), the
engine's tools are in `packages/engine/src/scheduling/`, and Psizone's /contact is the first
consumer. The owner's brief: "build new tool with mastra: ability to create scheduling. structure
the scheduling engine separately. use convex as a database."

## 1. What exists after this slice

| Piece | Where | State |
| --- | --- | --- |
| Domain (pure functions): slots, DST, holds, lifecycle, conflicts, retention, reminder seam | `packages/scheduling/src/domain/` | done, tested |
| Convex schema, queries, mutations, crons, seed | `packages/scheduling/convex/` | done, deployed locally |
| Typed server clients (visitor, staff) over `ConvexHttpClient` | `packages/scheduling/src/client.ts`, `staff-client.ts` | done |
| Mastra tools `findAvailability`, `requestAppointment`, `cancelRequest` | `packages/engine/src/scheduling/` | done, registered on the Mastra instance |
| Psizone's scheduling agent (evaluations) | `packages/guide/src/profiles/index.ts` | opted in |
| /contact shows free evaluation times, holds one, confirms a request | `apps/psizone-web/src/booking.tsx`, `server.tsx` | done; callback form without `CONVEX_URL` |
| Staff UI, notifications, reminders, the guide's chat hand-off | — | tasks, section 9 |

## 2. Domain

- **Tenant**: one brand's calendar space (`psizone`, `eqsync`, `hemisync`), with its IANA zone
  (`Europe/Bucharest`). Every row carries its tenant; every function filters by it.
- **Practitioner** (provider): a person who takes sessions. Only a public display name the person
  agreed to show; their account lives in the estate's IdP, never here.
- **Service**: what can be booked. Duration, buffer after it, the grid slots start on (`step`),
  minimum notice, horizon (days ahead), hold length, modes (`onsite` or `online`), an onsite
  location key, and the practitioners who offer it. Psizone: `evaluation` (60 min + 15 buffer,
  onsite, 12 h notice, 28 days). EQ-SYNC: `online-session` (50 min, online). Hemi-Sync: none yet;
  its session requests stay "a request, not a booking" until it has a service.
- **Availability rule**: a weekly window of one practitioner, in **wall time** (weekday, start and
  end minutes), with modes and an optional validity range.
- **Exception**: one date: closed (whole day or part of it) or an extra open window.
- **Slot**: a start the rules offer that nothing blocks, computed, never stored.
- **Hold**: a slot kept for a visitor for `holdMinutes` (10). It holds no personal data: only the
  slot, a readable reference (`K7M3-9QXA`) and the hash of a hold token that the confirm form
  carries. A hold that lapses stops blocking at once; the sweep only tidies it.
- **Request**: a hold the visitor confirmed with their contact. It blocks the slot until the team
  decides. **Appointment**: a request the team confirmed.
- **Lifecycle** (`src/domain/lifecycle.ts`): `held → requested` (submit, refused once lapsed);
  `held → cancelled` (release); `held → expired`; `requested → confirmed | declined | cancelled`;
  `confirmed → cancelled`. **Reschedule** (staff) cancels the old one and creates the new one in
  one transaction, linked both ways, keeping the status and the contact.
- **Cancellation** by the visitor needs the reference and the cancel code shown once at submit
  (80 bits, only its hash stored). Staff cancel through the staff client.
- **Time**: instants are UTC ms; rules are wall time in the tenant's zone, resolved through `Intl`
  (so the zone database decides the offset, in Node and in the Convex runtime alike). A 09:00
  opening stays 09:00 across the change of time. A wall time the clocks skip (03:00 to 03:59 on the
  last Sunday of March) is never offered; one they repeat (03:00 to 03:59 on the last Sunday of
  October) is offered once, at its first occurrence. Durations are real elapsed time, and a slot
  never ends past its window's real end.
- **Reminders**: an interface only (`ReminderPort`, `remindersFor`): confirmed appointments get
  reminders 24 h and 2 h before, none in the past. A sender (Plunk or n8n) implements it later; it
  looks the contact up at send time, so a cancelled or erased appointment is never reminded.

## 3. Concurrency: no double booking

The hold is one Convex mutation that re-reads, inside its transaction, the practitioner's rules,
exceptions and every appointment whose start falls in `[start − 12 h, blockedUntil)` through the
`by_practitioner_start` index, then re-runs slot generation for that start. Convex mutations are
serializable with optimistic concurrency: two holds racing for overlapping times read the same
index range, so one commits and the other is retried, sees the first, and answers `slot_taken`.
Nothing trusts an earlier availability query. The race tests (`src/test/convex.test.ts`) fire 12
identical holds and 10 overlapping-but-different holds from separate clients (no client-side
queue) against the local backend: exactly one wins each time. With the conflict check removed the
same tests fail, so they test what they claim.

## 4. Multi-brand

Psizone, EQ-SYNC and Hemi-Sync are separate tenants in one deployment: their own practitioners,
services, rules and appointments, and every query is scoped by tenant (a hold naming another
tenant's service is `unknown_service`). A profile opts in with `scheduling: { tenant, services }`;
only Psizone does today. One deployment per brand is possible later (the client takes a URL) if
the owner wants the data physically apart.

## 5. Authorization

Convex trusts only psi's servers: every public function demands the shared server key
(`PSI_SCHEDULING_KEY`, set in the deployment and in each app's secret, fail-closed when unset).
Seeding and the crons are internal functions, reachable only with the deployment's admin key.
Who may see or change which calendar is decided in the app, before the call, through the estate,
following `docs/plans/accounts.md` §4: types are `<module>_<entity>`, scoped to `platform:psi`;
staff hold persisted catalog-role tuples granted in Polaris; a record's owner is a contextual tuple
read from the site's own row at Check time, never persisted in OpenFGA.

| Object (psizone module) | Relations | Who |
| --- | --- | --- |
| `psizone_booking_request:<reference>` (exists in the manifest) | `viewer`, `editor` | `psizone:reception` (catalog role: `bookings:view`, `bookings:manage`); the visitor as contextual owner once requests are tied to a signed-in account (accounts task A5) |
| `psizone_calendar:<practitioner id>` (proposed) | `viewer`, `editor` | `psizone:reception`; the practitioner as contextual owner (`viewer`), from a `subject` column the practitioners table gains |

EQ-SYNC and Hemi-Sync get the same pair (`hemisync_session_request` already exists, with
`hemisync:reception`).

- A staff route mounts `account.requireSignIn()`, then `account.can("editor", resolve)`, where
  `resolve(c)` returns the `RecordRef` (`{ object: "psizone_booking_request:K7M3-9QXA", owner:
  null, ownerRelations: [] }`, or the calendar with the practitioner's subject as owner). Denied is
  404, an OpenFGA outage 503 (fail closed). Only then does it call the staff client with
  `actor: { subject }` from `account.current(c)`; Convex records it as `decidedBy`.
- No role, group or permission is written in app code; a practitioner sees only their own calendar
  unless they also hold the reception role.
- Visitors have no relation today: they act through the hold token or the cancel code they hold.
- `psizone_calendar` is a proposal for the manifest's owner (the accounts work); this slice edits
  no authz file.

## 6. Privacy (a clinic)

- **Minimal data.** A hold stores no person. A request stores a name, one way to call back
  (phone or e-mail), who it is for (`child`, `teen`, `adult`) and the locale. **No reason for the
  visit and no free text**: the service chosen is all the store knows. The form and the tools take
  nothing else, and the guide never asks for health details (its scheduling rules say so).
- **The model never carries personal data.** The tools take a service, a date range, a slot id,
  and for cancelling a reference and a code. Names, phones and e-mails go from the form to the app
  to Convex, never through a tool argument or a prompt.
- **Retention** (`src/domain/retention.ts`, daily cron): a lapsed or released hold is deleted the
  next day; the contact is erased 30 days after the appointment ends (or is closed, if later); the
  bare slot (no person in it) is deleted after a year. The clinical record, if any, lives in the
  clinic's own system, not here.
- **Logs**: the Convex backend runs with `REDACT_LOGS_TO_CLIENT`, the client logs nothing, and an
  error message names the cause, never a value.
- **Secrets**: the server key and the admin key live in OpenBao in the estate; locally in files
  with mode 600 under `<repo>/.data/convex/secrets` (gitignored).

### Clients (staff-side records)

`clients` holds the clinic's own customers for the team to link to requests and appointments: a
name, a phone and/or e-mail (stored as the team wrote them; duplicates are found by a normalised
phone, e-mail, or a guardian's contact with the child's name), `child`/`teen`/`adult`, a guardian
for a minor, consent flags (contact, reminders), and a short **administrative** staff-only note
(500 characters; never why they come: nothing clinical is asked for, imported or stored here). No
visitor-facing function reads it. A client is kept while the relationship lasts and erased on
request (`staffClients.eraseClient`: the record, its keys, and the link on their appointments).
The import (`POST /api/platform/scheduling/setup/clients/import`, `calendar_manager`) takes the CSV
template (`GET …/clients/template`), is a **dry run unless `commit: true`**, refuses bad rows with
their line and reason, skips duplicates, and logs counts only.

## 7. Hosting Convex (the owner decides)

| Option | For | Against |
| --- | --- | --- |
| **Self-hosted open-source backend in the estate** (recommended) | Health-adjacent data stays in the estate, under the estate's OpenBao, backups and network policy; no new processor in the privacy notice; the same image runs locally | psi runs it: upgrades (pinned image digest), backups (SQLite volume, or Postgres), monitoring |
| Convex Cloud, EU region (`aws-eu-west-1`, Ireland) | No operations; the docs say all infrastructure for the deployment stays in that region | Convex is a US company: a processor under a DPA with transfer exposure (US CLOUD Act) for clinic data; 30 % regional surcharge; region fixed at creation |
| Convex Cloud, US default | Cheapest, simplest | Data in the US: not acceptable for a clinic's booking contacts |

The brief assumed Convex Cloud is US-only; it now has an EU region, which narrows the gap but does
not close it, because the provider remains US-based. **Recommendation: self-host**, as a
StatefulSet with a PVC (SQLite first, the estate's Postgres when it is there), an in-cluster
Service only (no Ingress: only psi's servers call it), `CONVEX_CLOUD_ORIGIN` set to the Service
URL, the dashboard not deployed (or behind the estate's sign-in), the instance secret, admin key
and server key in OpenBao through ExternalSecrets. Image: `ghcr.io/convex/convex-backend` pinned
by digest (`sha256:e9c084e8bd6c1f249012c672193f0988c748824f55a24cdad45f6185a8462f9a`, revision
`d1fcbeaf`, 2026-10-28). The image lives under `convex/`, not `get-convex/`.

## 8. The guide flow

1. A visitor on Psizone asks the guide a question: the grounded-answer path, unchanged
   (screening, retrieval, the per-sentence gate, the scorer). That agent holds no scheduling tool.
2. When the app routes a turn to scheduling (the visitor pressed "find a time", or a booking
   intent), it uses the profile's **separate scheduling agent** (`psi-guide-psizone-scheduling`),
   which holds only the three tools and the scheduling rules.
3. `findAvailability` lists free times on the clinic's wall clock. The agent proposes only those.
4. The visitor picks one: `requestAppointment` checks it is still free and returns a
   **proposal** (`status: "needs_confirmation"`, `booked: false`). It writes nothing.
5. The app renders the proposal as its confirm step, a Datastar form (the /contact form with that
   slot chosen); the visitor types their contact there and submits. Only that request, in another
   HTTP round trip and never in the model's turn, creates the hold and then the request. The port
   the engine gets has no method that could book.
6. `cancelRequest` cancels with the reference and the cancel code the visitor gives.

The scheduling agent has no screening of its own. The chat hand-off (task S7) must run the same
screening chain in front of it as the grounded path does (crisis rules first, then rate limit,
injection, abuse, PII redaction), so a crisis message on a booking turn still gets the fixed
crisis answer and never reaches a model.

### 8.1 The conversation as built

The chat does not hand a booking turn to the model: the engine reads it (Romanian and English) and
answers with a `booking` event that the app renders. Each turn leaves a `BookingState` (the
criteria so far and the times last shown) on the guide's turn in the page; the next question
carries it back, so "next week, mornings", "Tuesday at 10", "the second one" and "another day"
refine or pick from what is on screen. Nothing in the state is trusted: a picked time is looked up
in the store again (`requestAppointment`'s check) before the confirm step, and the hold checks it a
third time. The confirm step is the booking form in the chat (one fresh form id per offer), which
posts to `/programare` and `/programare/confirma`, never through the model; its last card shows the
reference, the one-time cancel code and what happens next. "I want to cancel" asks for both
codes in the chat and `cancelRequest`'s function answers. A message that is not about booking falls
through to the grounded answer, state kept for two turns.

## 9. Tasks

| # | Task | Where | Depends on |
| --- | --- | --- | --- |
| S1 | Owner decision: self-host (recommended) or Convex Cloud EU | section 7 | — |
| S2 | Deploy the backend in the estate: StatefulSet, PVC, Service, NetworkPolicy, ExternalSecrets for instance secret, admin key and server key; `convex deploy` in CI with the admin key | `gitops/`, `estate/APP-SECRETS.md` | S1 |
| S3 | Real practitioners, rooms, services and schedules (weekly, alternating A/B, periods, days off, contractors) entered by the team, replacing the DEMO seed; staff calendar; clients and a CSV import | `convex/staffSetup.ts`, `staffRooms.ts`, `staffSchedule.ts`, `staffBoard.ts`, `staffClients.ts`; CMS `/admin/platform/scheduling` (Calendar, Requests, Setup) | built; the owner enters the real people and rooms and hands over the clients CSV. The chat offers the tenant's active services from the store (catalogue, cached 60 s) |
| S4 | Authz: add `psizone_calendar` (and the EQ-SYNC/Hemi-Sync pairs) to the manifests; staff tuples from Polaris | `apps/psizone-web/authz.manifest.json` (accounts owner) | `@psi/account` |
| S5 | Staff console: requests to confirm or decline, calendar, exceptions, reschedule, behind `account.requireSignIn()` and `account.can("editor", resolve)` | a staff app or `/cont/echipa` | S4 |
| S6 | Notifications: the team on a new request, the visitor on submit and decision (Plunk), reminders through `ReminderPort` | `@psi/scheduling` + a sender | S2 |
| S7 | The guide's chat hand-off: booking turns are handled by the engine itself (`packages/engine/src/booking*.ts`, no model) behind the screening chain (crisis first): first request, refinements, a pick by text or click, the confirm step rendered as the booking form in the chat, cancellation with reference and code. The booking state travels with the page's turns (`AskInput.booking`) | `@psi/engine`, `@psi/guide`, `@psi/ui`, `apps/psizone-web/src/chat-booking.tsx` | done |
| S8 | Cancel with reference + code: in the guide's chat (done); a visitor cancel page on the site | psizone-web | chat done, page open |
| S9 | EQ-SYNC online sessions (replacing the Calendly link-out), then Hemi-Sync session requests | the sites, `guide/src/profiles` | S3 |
| S10 | Legal: the privacy notice names the store, the data, the retention and the processor (if any) | legal pages | S1 |
| S11 | Rate limit and honeypot on `/programare*`; hold quotas per client so a bot cannot hold every slot | psizone-web | — |

## 10. Owner decisions

1. Convex hosting: self-hosted in the estate (recommended) or Convex Cloud EU (section 7).
2. Retention: contact 30 days after the appointment, records one year (proposed) — or other limits.
3. Does a request block the slot until the team decides (as built), or only for a fixed time?
4. Which practitioners appear by name to visitors, and for which services.
5. Evaluation length, buffer, notice and horizon (the seed uses 60 + 15 min, 12 h, 28 days).
