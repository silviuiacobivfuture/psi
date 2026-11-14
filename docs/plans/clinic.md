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
| Cut-over | A parallel week: the old app stays the source, the import re-runs (keyed on old ids), then a final import and the old app goes read-only. Until then production runs with `NOTIFY_DELIVERY=hold` (no notice reaches anyone); removing that line from `gitops/services/scheduling-api/overlays/prod` is the cut-over's last step |

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
- As built (2026-11-13): the namespaces are `scheduling-backend-prod` (the store, its CNPG `scheduling-db` and the
  deploy Job), `scheduling-api-prod`, `clinic-prod` and `account-db-prod`; the Argo Applications are `*-prod` in
  `gitops/apps/overlays/dev/apps/`; the store's Postgres is `POSTGRES_URL` (Convex on CNPG). The API scopes its app
  objects with `OPENFGA_APP_PREFIX` (`prod-` in production). Dev keeps its unprefixed `sched_app:psizone` until its
  tuples are rewritten to `dev-`.
- Hosts: prod `programari.psizone.ro` / `api-programari.psizone.ro`; dev
  `programari-dev.psizone.ro` / `api-programari-dev.psizone.ro`.
- Promotion is explicit: CI moves only `overlays/dev` tags; a prod release is one commit that
  copies the tested dev tags into `overlays/prod` (`tools/scheduling/promote.sh`), after the dev
  restore drill and smoke tests pass. The real clinic data is imported into PROD only.
- ONE sign-in for both (owner, 2026-11-13): the estate's Authentik; each instance is its own
  OIDC client (`clinic-dev`, `clinic-prod`, and the API audiences likewise) with its own redirect
  URIs, so the same person signs in to both. Roles are per instance: OpenFGA objects carry the
  environment (`sched_app:dev-psizone`, `sched_app:prod-psizone`), so a dev role never grants
  anything in prod. Databases, backups, encryption keys and secrets are separate.
- The visitor side: psizone-web and hemisync-web call the PROD API (their one deployment is the
  public one); the dev API serves the dev console and tests.

## 10. Booking support: blacklist, data check, feedback, reports (2026-11-13)

Owner: "it's a mini CRM, but we only focus on reservations". Everything here serves booking. All of it
lives in `packages/scheduling` (domain in `src/clinic/`, store functions in `convex/api*.ts`), tested
against a throwaway backend; the API (slice 3) wires permissions to it.

**Blacklist, with a reason.** Per app, an entry names a client record and/or an E.164 phone and/or an
e-mail (never a name alone), with a reason (staff-only text, at most 2000), a category (`no_show_repeated`,
`unpaid`, `abusive`, `duplicate`, `other`), a severity, an optional expiry, an active flag, creator and
dates, and an audit event for every change. Severities: `warn` (staff acknowledge; online allowed),
`block_online` (web and chat refused neutrally; staff book with an override and a reason), `block_all`
(only the elevated override books). `blacklistMatch(candidate, entries, now)` returns the strongest hit
(harshest severity, then client > phone > e-mail) and which identifier matched; a guardian's phone is part of
a child's candidate. Enforcement: `appointments.submit` (a hold carries no contact, so submit is the first
moment to ask) and `apiBlacklist.screen` (the gate for the callback form and any other online path) answer
`unavailable_online` and record an event and an audit entry; `apiVisits.create` and `move` answer
`warning` / `blocked` with the reason unless given `override: { reason, authority }`, and store the override
and its reason. Catalogue: `blacklist` view / create / edit / delete / `create_warn` / `override` /
`override_admin`, scope all. Seed roles: Owner and Admin everything; Reception `view` + `create_warn`.

**Data check.** `validateSnapshot` (pure) reports, without changing anything: invalid phones and e-mails,
clients with no usable contact, contacts shared by two clients, visits on a day off or outside roster hours,
overlaps, packages used past their sessions, clients matching the blacklist. The import runs it on what it
would write (dry run and real run: codes, counts, old ids only; never blocking); `validateClinicData(admin,
app)` runs it over the stored data. `--blacklist <file>` seeds entries (validated, idempotent, never rewritten
once staff own them).

**Feedback.** Kinds `appointment_rating`, `general`, `suggestion`, `complaint`, `site_issue`; rating 1 to 5;
text up to 4000 characters (checked on the plain text, stored and replied to as ciphertext); linked to a
visit, a booking, a client or an account hash; channels `account`, `email_link`, `chat`, `staff`; status
`new` > `read` > `answered` > `closed`; a reply thread; consent to be contacted (contact details stored only
with it). One-time links: signed (HMAC under a key derived from the server key), expiring (14 days, 1 hour
to 90 days), single use, redeemed in one transaction; `feedbackLinks.issue` is what the notify layer calls.
Catalogue: `feedback` view / reply / close with field groups `core` (rating, text, replies) and `contact`.
The parent questionnaire stays a form.

**Reports.** Read-only queries over a range (at most a year and a day), bucketed by LOCAL date: appointments
by status / service / practitioner / room / device per day, week, month; utilisation (booked against
available minutes from the roster; rooms and devices are available while any practitioner is); no-show and
cancellation rates (and by client); new against returning clients; packages sold, used, remaining;
revenue (paid, by method, outstanding); the web and chat funnel; feedback ratings; blacklist hits. Counts
and rates need `reports_view_all_core`; **revenue alone** needs `reports_view_all_money`
(`src/clinic/reports/permissions.ts` maps each report to its key).

**Owner decisions taken for you (change any of them):**
1. A hold has no contact, so the blacklist is asked at submit, not at hold.
2. `warn` refuses once with `warning` and proceeds on an acknowledgement with a reason (no extra permission);
   `block_online` needs `blacklist_override_all`; `block_all` needs `blacklist_override_admin_all` ("roles_admin
   override" read as a separate, admin-only permission, since no `roles_admin` action exists).
3. Reception may flag at `warn` level only, may not edit, delete or override.
4. Erasing a client keeps their blacklist entries' phone, e-mail and reason (a safety record) but drops the
   client link and name; it deletes their feedback and replies.
5. Reception handles feedback (view, reply, close, with text and contact); no other seed role sees it.
6. Accountant gains the `core` and `money` report groups; no one else reads reports but Owner and Admin.
7. Seeded blacklist entries are created once; a re-run never revives what staff switched off.
8. The feedback-link key is derived from the deployment's server key, so no new secret is deployed.

## 11. Three kinds of settings (owner, 2026-11-13)

The console has three kinds of settings, each in its own place and gated on its own.

1. **Setările mele** (`/me/settings`, everyone): profile, theme, language, decorative background, notifications and
   push devices, sign-out. Entry: the account menu. Still to come there: the assistant's presentation (bar or panel) and
   "my feedback".
2. **Setări organizație** (`/settings`, per app, each area gated by its own permission): Profil organizație, Membri,
   Roluri și permisiuni, Servicii și prețuri, Cabinete, Aparate, Plan cabinete (draw mode), Program și pontaj, Reguli
   programare online, Mementouri și șabloane, Listă neagră, Feedback, Acces la rapoarte, Constructor (fields, forms,
   views, buttons), Date și confidențialitate, Jurnal, Import. Grouped Echipă, Servicii și spații, Programări, Clienți,
   Constructor, Date și jurnal. One table (`apps/clinic/src/lib/areas.ts`) holds the areas, their group and their key;
   the gates, the landing, the left list and the command palette all read it. Areas the service cannot serve yet say
   "în curând".
3. **Administrare platformă** (`/platform`, only `platformAdmin` from `/me`): organisations, platform-wide users and
   roles, integrations' health, environment, feature flags, platform audit. A separate item at the foot of the
   navigation. Today: the organisations and a placeholder for the rest.

"Plan cabinete" (the live occupancy) is a daily screen and stays in the main navigation. `/admin` leads to `/settings`,
`/audit` to `/settings/audit`, `/settings/notifications` to `/me/settings`.

## 12. Online accounts and notifications (2026-11-13)

Owner: "transform a customer into a registered user from the panel" and "Novu integrated for notifications via e-mail and
push for customers and operators of all kinds, with notifications specific to what they need."

**Customer to registered user.** `clients_invite` (reception, admin, owner) on the client page: pick the client's or the
guardian's e-mail (the person must be allowed to read that contact), preview the e-mail as it will go, send. The service
finds the address in Authentik or creates the user in the customers group (never resets an existing account), links the
account to the client, and Novu sends the branded RO/EN e-mail. Its button leads to `/v1/public/invites/<token>`: a page
with one button (a mail scanner opening it changes nothing) that sends the person to set a password, or, for an account that
existed, to the site's sign-in. The link works a week, stops when withdrawn or replaced by a resend, and is not single use.
Status on the client: invitat, activ (the sign-in provider says the account signed in after the invitation, asked every five
minutes, and at once when a site calls the account routes), expirat (derived from the date, no job), retras. Withdrawing never touches the sign-in account. "Programările mele" (`visitor.mine`) now also
lists the clinic's own appointments of every client the account was invited for (a guardian's account covers each child) and
lets the person cancel an upcoming one. Until the sites move to the SDK (slice 6) the sites' own account page still reads
Convex directly and does not show them.

**Catalogue.** Every event is for one audience and has RO/EN templates; routing is by permission (`needs` in the entry),
resolved to people at send time, never a Novu topic, the person who did it left out. A person's choices (channel by kind,
quiet hours, language) are `GET/PUT /v1/apps/:app/me/notifications` (and `/me/account/notifications` for a registered
customer); the preferences page lists what each kind offers and which channels are locked (an invitation or a booking's
e-mail, the owners' security notice). Scheduled ones run in the API (`engagement/scheduler.ts`, every minute, each thing
claimed once across replicas): reminders 24 h and 2 h, the desk's list 07:30, the therapists' tomorrow 19:00, the owners'
day 20:00 and week on Monday 08:00 (the clinic's own wall clock, so summer time moves nothing), the report waiting, the
feedback request, conflicts (two sessions at once, or a session on a day the therapist does not work). Every step of a
delivery is logged (`GET /v1/apps/:app/notifications/deliveries`): Novu's open-source server reports no delivery webhooks,
so the ladder ends at "Novu accepted it". A message given up on tells the owners once; that notice cannot loop.

**No clinical content.** A payload is a closed list of fields (`catalogue/payloads.ts`); a field not named there is dropped
before anything is queued. A service name is treated as a booking label, not clinical (an appointment e-mail to its own
client already prints it); diagnoses, notes, reports, files, questionnaires and the staff-only blacklist reason never are
fields. Push says only "you have a new notification".

**Deploy.** Novu: the estate's one bridge serves `@psi/notify`'s workflows; after a release that changes the catalogue the
estate runs `novu-bootstrap.sh <env>` (SEB) to sync, and `pnpm --filter @psi/notify workflows:check` (env `NOVU_API_URL`,
`NOVU_SECRET_KEY`) says what is missing. Plunk: the integration `plunk-<app>` per sender (`psizone`, `hemisync`), declared in
`gitops/services/plunk/senders/`. Push: VAPID pair at `secret/apps/pwa/vapid`; the push webhook integration's HMAC key is `NOVU_PUSH_SECRET` of each app that receives it. Only
the console mounts `/__pwa/novu` today: customers' push (their devices on `psizone:client:<id>`) needs the sites to mount the
hook and sync devices (not done), so for customers e-mail is what arrives. The senders `psizone` and `hemisync` are not yet
declared in `gitops/services/plunk/senders/` (genesis's): until they are, every e-mail step fails in Novu. The bridge rebuild
and the sync must come BEFORE the API rolls out (an unsynced workflow is refused and given up). The sign-in: `secret/apps/scheduling-api/sso` (`AUTHENTIK_URL`,
`AUTHENTIK_API_TOKEN`), optional. The permission catalogue gained `clients_invite`: the OpenFGA model must be re-released and
`OPENFGA_MODEL_ID` re-pinned; roles that already exist gain the new key only when an owner adds it in the console.

**Decisions taken for you (change any):** a client with no e-mail is not mailed (reception is told, to reach them another
way); the day-before reminder is skipped for a booking made less than 26 h ahead; the 2-hour nudge is a push by default and
its e-mail is off until chosen; new requests default to the bell, push and e-mail; appointment changes and conflicts to the bell and push (a
confirmation to the bell only); the lists to the bell and e-mail; the owners' numbers to e-mail; the feedback e-mail is switched off for an app until its site has the page that opens the link
(`off` in the app's notification settings); revoking an invitation leaves the sign-in account as it was.

## 13. Asked of SEB (2026-11-14)

psi cannot do these itself; each stays open until SEB answers.

1. **Novu bridge: no workflow is synced on dev, and psi cannot sync one.** Two routes were tried on 2026-11-14:
   - psi's own bridge, `apps/notify-bridge` (the `@psi/notify` registry: 84 workflows, 150 steps), runs at
     `http://notify-bridge.notify-bridge.svc:8080/api/novu`. Novu refuses to sync it: "The provided bridge URL is
     blocked by the outbound SSRF policy". `NOVU_SAFE_OUTBOUND_ALLOW` (the `novu-config` ConfigMap) names only
     `novu-bridge.novu.svc.cluster.local` and `plunk-smtp.psizone.ro`. It is not a slot of the novu piece, and SEB's
     doctor fails any other value. The allowed URL itself syncs (201), with the 0 workflows SEB's bridge serves.
   - SEB's bridge rebuilt from the locked release (v0.1.88, `apps/novu-bridge/build.sh`) with
     `NOVU_BRIDGE_CATALOGUES=packages/notify`: it bundles the catalogue, but the image dies at start ("psizone is not an
     estate application: the estate bridge has no address for it"). SEB's bridge only addresses applications declared
     in `brand/estate.config.json`, at `https://<app>.psizone.ro/`. psi's catalogue is for the product sites
     (psizone.ro, hemisync.ro, programari.psizone.ro), which are not estate hub applications and do not live at those
     addresses. Declaring them there would also put them in the estate launcher. It was not pushed and nothing was
     signed.

   Ask SEB for either of these:
   - (a) let an estate add its own bridge host to `NOVU_SAFE_OUTBOUND_ALLOW` (a slot), or name its bridge URL in
     `novu-bootstrap`;
   - (b) let SEB's bridge serve a catalogue whose applications have their own addresses.

   psi's bridge stays deployed so that (a) needs only the sync. Prod sends nothing until cut-over (`NOTIFY_DELIVERY=hold`).
2. **The scheduling service's Authentik token.** `secret/apps/scheduling-api/sso` (and `-prod/sso`) hold a token minted by
   hand for the `scheduling-invites` service account. Ask: an OpenBao auth role so a reconcile Job can mint and rotate it
   as code.
3. **Polaris serves psi.3's model.** The permissions bundle Polaris serves comes from the signed OCI bundle (psi.3), not from
   `gitops/services/autorizare-permissions`. Ask: release psi.4 so Polaris serves the current model (`clients_invite` and
   the later keys).

## 14. Deploying production: by hand, one click (owner, 2026-11-14)

Production changes only when someone runs it. Merges to dev and the `apps` workflow never reach it.

1. Dev runs the build you want, and its checks have passed.
2. On GitHub, go to Actions → **promote** → Run workflow, from `dev`. Optional inputs:
   - `sha`: the dev commit to promote (default: dev's head).
   - `apps`: some of `scheduling-backend, scheduling-deploy, scheduling-sync, scheduling-api, clinic` (default: all).
3. The workflow:
   - merges that commit into the `prod` branch;
   - pins each production service to the image dev runs at that commit (`tools/scheduling/promote.sh dev`), which
     rebuilds nothing;
   - checks every pinned image is in Harbor, then pushes `prod`.

   Argo deploys production from `prod`. The commits name who ran it (`Promoted-by`) and the run (`Promote-run`).

What stops anything else:
- `prod-guard` (`tools/ci/prod-guard.sh`) fails any commit on `prod` that the workflow did not make, and any dev push
  that changes a production image pin.
- `apps` runs only on dev.
- A setting changed in a production overlay on dev (not a pin) takes effect at the next promotion, never before.

Rolling back: run promote with an older dev `sha`.

### Building dev on this workstation (owner, 2026-11-14)

The single CI runner builds every image in turn. When it is the bottleneck, `tools/ci/local-release.sh` does the
`apps` workflow's work here, for DEV only: the same plan (`scripts/affected-apps.mjs --since-deployed dev`), the same
Dockerfiles, build args, locked SEB bundle and Harbor tags (the commit's 7 characters), parallel builds, and the same
tag-bump commits on dev (`ci(<app>): deploy <tag> to dev [skip ci]`), made only once every image is pushed.

    BAO_TOKEN=<OpenBao token> tools/ci/local-release.sh [<dev sha>]

- It reads CI's push robot (`platform/harbor/ci-robot`) from OpenBao (`BAO_ADDR`, default the port-forward on
  127.0.0.1:18200). The login lives in a private docker config that is removed on exit. Nothing secret is printed.
- Cancel the queued `apps` run of the same commit first: otherwise it rebuilds the same images, and a run still in
  flight can move a tag back to its older commit.
- It never builds for production. Production still moves only through **promote**, which pins tags that already
  exist. The tests stay CI's (`estate-gates`).


