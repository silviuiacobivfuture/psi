# Clinic: psi's scheduling service, its components and the team's app

Status: plan, 2026-11-13. Owner's brief: replace the team's current scheduling app (a third-party
Supabase app, "PsiZone — Programări") with a real one, "make it a star"; migrate **Everything**
("with a capital E, be careful"); roles are **dynamic**; scheduling is **a separate, headless
service on the estate** that offers UI components other services consume ("like Clerk"). Builds on
`docs/plans/scheduling.md` (the store, the domain, the public booking flow), which stays valid.

## 1. Owner decisions (2026-11-13)

| Question | Decision |
| --- | --- |
| Clinical data (diagnoses, session reports, parent feedback, files) | Everything migrates, phase 1, with the tight access model below |
| Roles | Dynamic: roles are data, editable by owners; open source, light (OpenFGA through Polaris, already the estate's) |
| Shape | A separate headless service + a component kit consumed by the team's app, the sites and the CMS |
| Reminders | Automatic e-mail the day before with Confirm/Cancel links that update the calendar, plus a one-tap WhatsApp per appointment |
| Cut-over | A parallel week: the old app stays the source, the import re-runs (keyed on old ids), then a final import and the old app goes read-only |

## 2. What the team does today (the old app, studied 2026-11-13)

Export (aggregates): 5,595 appointments (2026-05-05 → 2026-12-17; 809 cancelled), 218 clients
(206 active), 70 session packages, 395 roster days, 179 ABA-style session reports, 14 Race Me Up
reports, 2 psychotherapy reports, 10 parent questionnaires, 3 staff blocks, 5 group activities,
4 OPTIMO volunteers, 11 client files, 13 notice-board documents. The export, the files and the old
bundle are in `<repo>/.data/old-scheduler/` (gitignored, mode 700); **nothing from it enters git,
tests, logs or a subagent's prompt.** Tests use synthetic fixtures.

Screens: Calendar (day/week/month/year; one column per therapist, device or room; compact; print;
block time; group activities; new appointment), Clients (current/archive, status, guardian, files,
import, financial report, export), Program ("Pontaj": per-person daily hours, CO, CM, free;
volunteers), Reminders (tomorrow's list, prepared WhatsApp text, sent/confirmed flags), Settings
(therapists, rooms, users with role admin|receptionist), Parent feedback, Packages ("Abonamente":
sessions, bonus, used, price, paid), Notice board ("Avizier": documents).

Facts the export alone does not hold (in the old bundle): rooms 1–7 (NFB 1, NFB 2, Cabinet
Psihoterapie 1, Cabinet Psihoterapie 2, Cabinet Terapie, Sală Grup / Hemi-Sync, Sală
Kinetoterapie); durations 20–240 min; session types; roles admin | receptie | terapeut | katy;
reception and roster-only staff (ids 101, 102); appointments under ids 10–14 are group activities;
"NFB 1/2" are devices and "Cabinet Grup" a room, **never practitioners**; ATELIER/GRUP "clients"
are groups. Clinic address for reminders: Strada General Alexandru Cernat 126, Galați.

### The reception's own requests (Iuliana, 2026-11-13)

1. Clients are **never moved by themselves**: the old app has moved clients to other therapists
   for two weeks, sending therapists wrong. Here: no implicit change, every change explicit and in
   the audit log; the import reports suspicious therapist changes in the history.
2. Sending a reminder asks once (the old app asks in the app and again in WhatsApp).
3. Each client's packages open as their own page: prices and offers editable; total, paid and
   remaining computed automatically.
4. Clients: an Archive button AND a Delete button (today deleting requires archiving first).

## 3. Shape

| Part | What | Where |
| --- | --- | --- |
| Store | Convex (self-hosted, open source), the existing deployment, schema extended | `packages/scheduling/convex/` |
| Domain | pure functions: slots, conflicts, packages and credits, money, roster, retention | `packages/scheduling/src/domain/` |
| **Service** (headless) | `scheduling-api`: Hono, JSON over HTTP + SSE for live calendars; OIDC bearer (estate sign-in) or a service key; every call authorized through OpenFGA; the only thing that talks to Convex | `apps/scheduling-api/` |
| SDK | typed client derived from the API's zod contract | `packages/scheduling/src/sdk/` |
| **Components** | server-rendered TSX + Datastar: calendar, appointment editor, client card, package ledger, roster grid, booking widget, reminder list, notes forms | `packages/scheduling-ui/` (`@psi/scheduling-ui`) |
| Team app | "Programări": the team's admin console, a **separate Hono + Datastar app**, built only from the components and the SDK; psi's design language with its **own admin theme** (`psizone-admin` light/dark tokens in `@psi/design`: denser, calmer, data-first), **fully mobile-responsive** (phone first: a reception desk on a phone, a therapist between sessions) and a **PWA** (installable, offline shell, push for new requests and reminders, through `@psi/pwa`) | `apps/clinic/` |
| Consumers | psizone-web booking, the guide's tools, the CMS | existing apps, moved to the SDK |

## 4. Apps and granular, dynamic authorization

Owner, 2026-11-13: "the admin side must be complete, it's imperative"; "Hemi should have its own
appointments thing"; "support Apps, with roles and permissions for each as granular as possible.
I really mean granular."

### Apps (tenants)

The service hosts several **apps**, each a closed world: its own team, services, calendars, rooms,
devices, clients, packages, roster, records, settings, roles and audit. First two: `psizone`
(the clinic, Galați) and `hemisync` (Hemi-Sync România: sessions, programmes, the club). An app is
created by an estate admin; nothing crosses apps unless a person is a member of both (their
roles are per app). Every row, every API call and every OpenFGA object carries its app.

Each app has BOTH sides, complete:
- **Team side** (the console, `apps/clinic`, one console for every app the person belongs to, with
  an app switcher): calendar, clients, packages and payments, roster, reminders, records, files,
  notice board, services and prices, rooms and devices, opening hours, roles and members, audit,
  reports. Imperative: everything the team does today, and the settings to run it without us.
- **Visitor side**: the booking widget and the guide's tools on that app's site (Psizone on
  landing.psizone.ro and its AI guide; Hemi-Sync on hemisync.psizone.ro and its guide), the
  visitor's account page (their appointments, cancel, reschedule, confirm reminders).

### Granular permissions (OpenFGA, roles as data)

OpenFGA (Apache-2.0, Zanzibar; the estate's data plane through Polaris). A permission is
**resource × action × scope**, optionally × field group:

- **Resources**: app settings, members, roles, services, prices, rooms, devices, group
  activities, practitioners' calendars, appointments, clients (contact), client clinical record,
  session reports (per kind: ABA, Race Me Up, psychotherapy), parent questionnaires, files,
  packages, payments, roster, leave, notice board, reminders, web requests, reports, audit log,
  imports/exports.
- **Actions**: view, create, edit, cancel/delete, archive, export, send (reminders), approve
  (leave, web requests), assign (practitioner/room), price (see/change money fields).
- **Scope**: `all` in the app | `assigned` (clients/appointments of practitioners the person is
  assigned to, e.g. a coordinator) | `own` (their own calendar, the clients they treat, their own
  leave). Scope comes from relations (`treating`, `assigned_to`, `self`), not from code.
- **Field groups** on clients and appointments: contact, guardian, money, clinical — so e.g.
  reception sees contact and money but not clinical; a therapist sees clinical of clients they
  treat but not money.
- **Model**: types prefixed `sched_`; `sched_app:<id>` holds `member`, and each fine permission
  is a relation on the app (`appointments_edit_all`, `appointments_edit_own`, `clinical_view_own`,
  `prices_change`, …) granted `from` `sched_role:<id>#member`; resource objects
  (`sched_client`, `sched_calendar`, `sched_appointment`, `sched_room`, …) link to their app and
  to people (`treating`, `owner_practitioner`, `assigned_to`) so Check answers per object.
  ListObjects drives what a list shows.
- **Roles are data**, per app: owners create, copy and edit roles in the console with a
  permission matrix (resource rows × action columns × scope, field groups as toggles); a person
  may hold several roles; an individual grant/deny per person is possible on top; changes apply
  at once (tuples written by the service) and land in the audit log.
- Seed roles per app (editable): Owner (everything), Admin (everything but roles and audit),
  Reception (calendar all, clients contact+guardian+money, packages, payments, reminders, web
  requests, roster view; no clinical), Therapist (own calendar, clinical own, own leave request),
  Coordinator (assigned scope), Volunteer (roster own), Accountant (money + reports, read-only).
- The permission catalogue is code (a typed list; the matrix UI and the OpenFGA model are
  generated from it, so they cannot drift); role contents are data.
- Checks pass `now` at Check time, never stored. The service pins the model id. Every refusal is
  its own test case asserting nothing was written.

### Single sign-on

Every person signs in once with the estate's sign-in (Authentik, OIDC), the same account across the
console, the CMS, the sites' account pages and Hemi-Sync. The service accepts the estate's tokens
(audience per consumer) and never keeps passwords. Visitors (parents, clients) use the same
sign-in as the sites' accounts (`packages/account`); booking without an account stays possible.
Membership of an app and its roles are data in the service, keyed on the token's subject.

### The builder: what each app's team sees is configurable

Owner, 2026-11-13: "I want to be able to build what they see, even in terms of UI, buttons, data."
Per app, owners (permission `builder_*`) define in the console, without code:
- **Fields**: custom fields on clients, appointments, packages, staff (type: text, long text,
  number, money, date, choice, multi-choice, yes/no, file, rating), each with a field group
  (contact | guardian | money | clinical | custom group) that the permissions govern, required or
  not, validation, ordering.
- **Forms**: session report and questionnaire templates (today's ABA, Race Me Up, psychotherapy and
  parent questionnaire become the first templates, imported data mapped onto them), versioned —
  an old report keeps the version it was written with.
- **Views**: the calendar's columns (people, devices, rooms, groups; order; colours), list columns,
  filters, saved views per role; the client page's sections and their order.
- **Actions (buttons)**: which actions appear where (e.g. "Send reminder", "Mark attended", "Add
  payment", "Copy to next week"), per role, with an optional confirmation — one, never two.
- **Catalogues**: services, session types, durations, prices, rooms, devices, group activities,
  reminder and message templates (e-mail, WhatsApp text) with placeholders.
Definitions are data (zod-validated JSON, versioned, audited, exportable/importable between apps);
the components render from them; a definition can never widen a permission.

## 5. Data safety (owner: "data is extremely important")

- The store moves to **Postgres** (CloudNativePG, the same pattern as the CMS: WAL archived to the
  estate's object storage, point-in-time recovery) before real data lands: Convex self-hosted
  supports `POSTGRES_URL`. The SQLite-on-volume setup is not acceptable for the clinic's records.
- Nightly logical export of every app (encrypted, to object storage, kept 90 days), and a
  **restore drill** (into a scratch deployment, counts and checksums compared) before go-live and
  monthly after; the console shows the last good backup and the last drill.
- Every write is versioned and audited; deletes are soft for 30 days (recoverable by owners) before
  the erasure job, except a GDPR erasure request which is immediate and logged.
- The import never deletes: it upserts by old id and reports; a re-run is a no-op.

## 6. Privacy (special-category health data, children)

- Clinical fields (diagnosis, session reports, therapist notes, parent questionnaires) are
  **encrypted per field** (AES-256-GCM, envelope key in OpenBao, never in Convex); files likewise,
  in object storage, never in git or the store's plain rows.
- Every read of a clinical record and every change of anything is an **audit event** (who, what,
  when, from where); owners read the log in the app.
- Clinic records are exempt from the web-request retention (`DEFAULT_RETENTION` erases contacts
  after 30 days: it must never touch clinic history). The clinic policy is its own, set by the
  owner (medical-record law), applied by its own job.
- Delete is real (erasure, cascaded, logged as a tombstone without content); Archive hides.
- **Go-live with real data is blocked on a tested restore** of the scheduling volume.

## 7. Slices

| # | Slice | Done when |
| --- | --- | --- |
| 0 | Web requests never lost: the callback form stores a request and e-mails the team; EQ-SYNC out of the header logo | live, a test request appears in the team's list and inbox |
| 1 | Schema + domain: clients & guardians, appointments (staff-made, series, groups, attendance, payment), rooms, devices, packages & ledger, roster & leave, clinical records (encrypted), files, notice board, audit, roles; clinic retention split | types + tests green |
| 2 | Import: re-runnable, keyed on old ids, dry-run report reconciling 218 / 5,595 / 70 / 395 / 179…, anomalies listed | dry run matches counts |
| 3 | `scheduling-api` + SDK + OpenFGA model + seed roles | deployed; refusals tested per permission |
| 4 | Components + `apps/clinic`: calendar parity first, then clients (Archive/Delete), packages page with automatic totals, roster, reminders (one confirm), notes forms, parent feedback, notice board, settings, roles editor, audit | the team can do a week's work in it |
| 5 | Reminders: e-mail with Confirm/Cancel links, one-tap WhatsApp; team notified of web requests | a confirm link changes the calendar |
| 6 | Sites, guide and CMS on the SDK | public booking shows real slots |
| 7 | Parallel week, final import, old app read-only | owner signs off |

## 8. Open

- Clinic record retention period (owner, medical-record law).
- The old app's user accounts → estate sign-in accounts (who gets an account).
- The "katy" role's meaning (mirrored as a role row until the owner says).

## 9. Production (owner, 2026-11-13)

The appointments system (store + its Postgres, scheduling-api, the console `apps/clinic`, the
deploy Job, notifications) runs TWICE on the one estate cluster: **dev** and **prod**. The sites
(landings, blog) stay single. Prod is a set of its own namespaces on the same cluster:
- `gitops/services/<app>/overlays/prod` for scheduling-backend, scheduling-deploy,
  scheduling-api, clinic; namespaces `scheduling-prod`, `scheduling-api-prod`, `clinic-prod`
  (own quotas, NetworkPolicies that admit only prod callers: no dev pod can reach prod data).
- Own data and keys: its own CNPG cluster and backups prefix (`cnpg/scheduling-db-prod`), own
  OpenBao paths (`secret/apps/scheduling-prod/*`, `secret/apps/clinic-prod/*`), own Convex
  instance secret, own OIDC client, own Novu environment or topics prefixed `prod:`.
- Hosts: prod `programari.psizone.ro` / `api-programari.psizone.ro`; dev
  `programari-dev.psizone.ro` / `api-programari-dev.psizone.ro`.
- Promotion is explicit: CI moves only `overlays/dev` tags; a prod release is one commit that
  copies the tested dev tags into `overlays/prod` (`tools/scheduling/promote.sh`), after the dev
  restore drill and smoke tests pass. The real clinic data is imported into PROD only.
- The visitor side: psizone-web and hemisync-web call the PROD API (their one deployment is the
  public one); the dev API serves the dev console and tests.
