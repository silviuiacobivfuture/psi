# @psi/scheduling

psi's scheduling engine, framework-free, with Convex as its database. The plan, the privacy and
authorization model and the hosting decision are in `docs/plans/scheduling.md`.

| Part | Where |
| --- | --- |
| Domain, pure functions: wall time and DST (`time.ts`), slot generation (`slots.ts`), what blocks a calendar (`conflicts.ts`), the hold/request/appointment lifecycle (`lifecycle.ts`), retention, reminders (interface), contact rules, references and codes | `src/domain/` |
| Convex schema and functions: `catalog.services`, `availability.slots`, `appointments.hold / submit / release / cancel`, `staff.calendar / decide / reschedule / addException`, `staffCatalog.catalog / availability / updateService / addRule / removeRule / removeException`, `staffRooms.createRoom / updateRoom / addRoomClosure / removeRoomClosure / rooms`, `staffSchedule.setAlternating / setPeriod / removePeriod`, `staffBoard.board` (the staff calendar's data), `staffClients.importClients / createClient / clients / linkClient / eraseClient`, `staffSetup.createPractitioner / updatePractitioner / createService / setDayRules / addDaysOff` (the team's setup: the first create also makes the tenant, so production needs no seed; each records the acting staff subject), `staffRequests.requests`, the hold-expiry sweep (internal action) and retention (crons), the DEMO seed (`seed:demo`, `seed:demoRequests`) | `convex/` |
| Server clients for Hono apps (`ConvexHttpClient`, every answer parsed with zod, a deadline per call) | `src/client.ts` (visitor), `src/staff-client.ts` (team) |
| Configuration from the environment | `src/config.ts` |
| **The clinic** (docs/plans/clinic.md): pure domain for staff-made visits and overlaps, packages and money derived from the calendar, roster, client standing (archive / soft delete), builder forms and the four seeded templates, custom fields, view and action definitions, audit events | `src/clinic/` |
| Granular permissions: the catalogue (resource x action x scope x field group, legal OpenFGA relation names), seed roles, `effectivePermissions`, `can`, scope relations | `src/permissions/` |
| Field encryption: AES-256-GCM per field, an envelope key per app wrapped by `CLINIC_MASTER_KEY` (never in Convex), rotation by re-wrapping | `src/crypto/` |
| Object-storage port (S3 over SigV4, memory) and the admin client for internal functions | `src/storage/`, `src/admin-client.ts` |
| The clinic's tables (every table and index starts with the app), app setup, wrapped keys, standing changes, the clinic's own erasure job, keyed upserts for the import | `convex/tables/clinic*.ts`, `convex/clinic*.ts`, `convex/import*.ts` |
| The old-app import | `scripts/import-old/` |

The engine's Mastra tools (`findAvailability`, `requestAppointment`, `cancelRequest`) are in
`@psi/engine` (`src/scheduling/`) and take a port this client satisfies; `@psi/guide` wires the two
(`schedulingFromEnv`).

## The clinic: apps, privacy, retention

- **Apps.** A tenant is an app (`psizone`, `hemisync`). Every clinic row carries it and every clinic
  index starts with it. Practitioners, devices, rooms and group activities are different tables: only
  practitioners are ever offered by the public picker.
- **Staff-made appointments are `visits`**, not `appointments`; the public flow reads them as busy time of the practitioner (`calendar.busyAround`) and of the room (`roomPlan.ts`), so the two cannot take the same time or room, and `clinicVisits.create` refuses a visit over time the public flow holds. The web-request retention
  (`retention.ts`, 30 days for a booking contact) only reads `appointments`, so it can never reach a
  clinic row (`clinic-backend.test.ts` runs the real `retention:purgePage` over aged clinic rows).
  The clinic's own job (`clinicRetention.eraseDue`, daily) erases one thing: a client soft-deleted
  more than 30 days ago, with what hangs on them (the books keep visits, packages and payments on an
  emptied client row). Clinical history is never erased by age.
- **Encryption.** Diagnosis, the reason for coming, health notes, therapist notes, form answers and
  clinical custom values are ciphertext (`{ keyVersion, iv, data }`); Convex stores them and the
  wrapped data keys, and nothing else: no function encrypts or decrypts. `CLINIC_MASTER_KEY` (base64
  of 32 bytes) lives with the process that encrypts (the import now, the service later).
- **Nothing moves a client.** Who treats a client is the `treating` relation; the import writes it once
  and only flags a later difference; `planTreatingChange` refuses every system origin but that seeding.
- **Permissions** are a catalogue in code (`src/permissions/catalogue.ts`); roles, members and
  per-person grant/deny overrides are data (`roles`, `roleMembers`, `permissionOverrides`), scope
  relations too (`treating`, `coordinatorAssignments`, `practitioners.staffSubject`).

## Contract

```ts
import { createSchedulingClient, readSchedulingEnv } from "@psi/scheduling";

const env = readSchedulingEnv(process.env); // CONVEX_URL, PSI_SCHEDULING_KEY, PSI_SCHEDULING_TIMEOUT_MS
if (env.ok) {
  const client = createSchedulingClient(env.config);
  const free = await client.findSlots({ tenant: "psizone", service: "evaluation", from, to });
  const held = await client.hold({ tenant, service, practitioner, start, mode, locale: "ro", channel: "form" });
  // held.holdToken goes into the confirm form only; nothing personal is stored yet.
  const sent = await client.submit({ reference, holdToken, contact: { name, phone }, audience: "adult" });
  // sent.cancelCode is shown once; only its hash is stored.
}
```

- Business outcomes are results (`{ ok: false, reason: "slot_taken" }`); a transport failure
  (unreachable, too slow, a refused key, a wrong shape) throws `SchedulingUnavailable`, whose
  message names the cause and never a value.
- Every public Convex function demands `PSI_SCHEDULING_KEY` and fails closed without it. The
  seed and the crons are internal (admin key only).
- `CONVEX_URL` unset means scheduling is off; the apps keep their callback forms.

## Local development

The self-hosted, open-source backend, pinned by digest, on 127.0.0.1 only; its data in
`<repo>/.data/convex` (gitignored). The image is `ghcr.io/convex/convex-backend` (the old
`get-convex/` path is not published on ghcr).

```sh
# from the repo root
packages/scheduling/scripts/local-backend.sh up        # docker: psi-convex on 127.0.0.1:3210 (API) and :3211
packages/scheduling/scripts/local-backend.sh env       # stores the CLI admin key in .data/convex/secrets/admin-key
                                                       # and sets PSI_SCHEDULING_KEY in the deployment
pnpm --filter @psi/scheduling convex:deploy            # scripts/convex.sh deploy --yes: schema + functions + crons
pnpm --filter @psi/scheduling convex:seed              # scripts/convex.sh run seed:demo: DEMO practitioners, rules, services
packages/scheduling/scripts/convex.sh run seed:demoRequests # three DEMO requests on rule-valid slots (skips if already there)
packages/scheduling/scripts/local-backend.sh app-env apps/psizone-web/.env
                                                       # appends CONVEX_URL and PSI_SCHEDULING_KEY if absent
packages/scheduling/scripts/local-backend.sh down      # removes the container; the data stays
```

No command prints a secret. The instance secret, the admin key and the server key are files with
mode 600 in `<repo>/.data/convex/secrets/` (gitignored and docker-ignored); `scripts/convex.sh`
runs any Convex CLI command with them (`scripts/convex.sh run expiry:sweep`, `… env list`), so no
secret sits in this package. The seed is idempotent and every name in it says DEMO.

Studio with the scheduling tools: `pnpm --filter @psi/engine studio --env ../../apps/psizone-web/.env`
(http://localhost:4360; the tools and `psi-guide-psizone-scheduling` appear when `CONVEX_URL` and
the key are set).

```sh
curl -s -X POST localhost:4360/api/tools/findAvailability/execute -H 'content-type: application/json' \
  -d '{"data":{"profile":"psizone","service":"evaluation","days":3,"partOfDay":"morning"}}'
```

## Importing the old scheduling app

`scripts/import-old/` (`scripts/import-old.sh`, `pnpm --filter @psi/scheduling import:old -- …`). Input
is the export JSON (`{ exported_at, tables }`) and a mapping file (`mapping.example.json` has the clinic's
rooms, devices, group-activity columns and roster-only staff). Every row is zod-parsed; the whole
export is parsed and mapped before the first write.

```sh
scripts/import-old.sh --dry-run --export <export.json> --mapping <mapping.json> [--files <dir>]
scripts/import-old.sh           --export <export.json> --mapping <mapping.json> --files <dir> [--allow-skips] [--report out.json]
```

- A dry run needs no key and no network; it prints aggregate counts, anomalies and OLD ids only.
- A real run needs `CONVEX_SELF_HOSTED_URL` and the admin key (the wrapper reads the local secrets file
  like `convex.sh`), `CLINIC_MASTER_KEY`, and for files `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`,
  `S3_SECRET_ACCESS_KEY` (`S3_REGION`). Files are read from `<dir>/<bucket>/<file_path>`
  (`client-files`, `avize`), hashed, encrypted and put in the object store.
- Keyed on old ids (`legacyId`), never deleting. An unchanged row (keyed fingerprint) is not written,
  versioned or audited; a changed one is updated and its version bumped; one audit event per batch.
- **blocking** anomalies (a non-empty column nothing maps, a clinical value that cannot be read as its
  field, a table that must be empty and is not, a row that does not parse) refuse the run;
  **skipped** ones (a column that does not exist, a time the clocks skip) refuse it unless `--allow-skips`.
- Reported: practitioner changes inside a weekly series (the "moved by itself" bug), overlaps on a
  practitioner, device or room, package usage stored against derived, orphan references, duplicate
  client names, group-like clients, unknown statuses.
- **Data check** (`src/clinic/validate.ts`, shown in the dry run and the real run, never blocking, changes
  nothing): invalid or unnormalisable phones and e-mails (client and guardian), clients with no usable
  contact, contacts shared by two clients, visits on a day off or outside the roster hours (judged in the
  app's zone, DST included; people with no roster rows at all are counted, not flagged), packages used
  past their sessions, clients matching a blacklist entry. Codes, counts and old ids only.
  `validateClinicData(admin, app)` (`src/admin-validate.ts`) runs the same check over the stored data,
  also with overlaps; `--validate-store` prints it after a real run.
- **`--blacklist <entries.json>`** seeds blacklist entries (`blacklist.example.json`: `key`, `clientLegacy`
  and/or `phone` and/or `email`, `reason`, `category`, `severity`, optional `expires`). The file is
  validated whole; a wrong entry blocks a real run, by key. A seeded entry is created once; a re-run
  never rewrites it, so what staff switched off stays off.

## The blacklist, feedback and reports

- **Blacklist** (`src/clinic/blacklist.ts`, `convex/apiBlacklist.ts`, `convex/blacklistGate.ts`): an entry
  names a client record and/or an E.164 phone and/or an e-mail (a name alone never matches), with a
  reason (staff-only text), a category, and a severity: `warn` (staff acknowledge, online allowed),
  `block_online` (web and chat refused neutrally; staff need an override and a reason) or `block_all`
  (only the admin override). `appointments.submit` and `apiBlacklist.screen` (the gate for the callback
  form) answer `unavailable_online` and record an event + audit entry; `apiVisits.create` and `move` answer
  `blocked` / `warning` with the reason unless given `override: { reason, authority }`, the authority being
  what the API vouches for (`ack`, `staff` = `blacklist_override_all`, `admin` = `blacklist_override_admin_all`);
  the override and its reason are stored (`apiBlacklist.events`). A hold carries no identifier, so the
  check is at submit.

- **Feedback** (`src/clinic/feedback.ts`, `convex/apiFeedback.ts`, `convex/feedbackLinks.ts`): kind
  (`appointment_rating`, `general`, `suggestion`, `complaint`, `site_issue`), a rating 1 to 5, a text up to
  4000 characters (checked on the plain text; the store holds ciphertext and the replies too), a link to
  the visit / booking / client / account hash, the channel (`account`, `email_link`, `chat`, `staff`), a
  status (`new`, `read`, `answered`, `closed`), a reply thread, and consent to be contacted (contact
  details are stored only with it). Field groups: `core` is the rating, text and replies, `contact` is who
  wrote it. `feedbackLinks.issue` (the notify layer calls it with the server key) returns a signed token:
  HMAC-SHA256 under a key derived from the server key, 14 days by default (1 hour to 90 days), usable
  once, for one finished appointment of one app; `inspect` shows the form, `redeem` stores the rating and
  uses the link up in one transaction. The parent questionnaire stays a form (`formResponses`). Erasing a
  client deletes their feedback and its replies.

## Tests

```sh
pnpm --filter @psi/scheduling exec tsc --noEmit
pnpm --filter @psi/scheduling exec vitest run --maxWorkers=2
```

- `time.test.ts`, `slots.test.ts`: both daylight-saving changes in Europe/Bucharest (the March gap,
  the October repeat, 23- and 25-hour days), checked against `Intl`; rules, exceptions, buffers,
  notice, horizon and modes.
- `lifecycle.test.ts`: the state machine, hold expiry, what blocks, retention, codes, contact rules.
- `rooms-schedules.test.ts` (pure): alternating weeks A/B, period schedules that replace the regular week, buffers, DST weeks, room suitability and room conflicts, closures across a 23-hour day. `staff-rooms.test.ts` and `clients.test.ts`: the same and the client import against the local backend (rooms never double-booked under racing holds' room reads, contractors invisible to visitors, dry run writes nothing, duplicates by phone/e-mail/guardian).
- `staff-setup.test.ts`: against the local backend, in an empty `test-setup-…` tenant like production's first day: creating the tenant, practitioners, services, regular hours, days off, every refusal writing nothing, idempotent repeats, the server key.
- Clinic: `crypto.test.ts`, `permissions.test.ts` (every refusal reason), `clinic-*.test.ts` (pure),
  `storage.test.ts` (SigV4 against AWS's published example), `clinic-backend.test.ts` and
  `scripts/import-old/*.test.ts` (the import against a synthetic export; `import.backend.test.ts` runs
  it into a real backend). Backend tests are skipped, with a warning, when none is up.
- A session that must not touch the shared `psi-convex` runs its own: `PSI_CONVEX_NAME=… PSI_CONVEX_PORT=3410
  PSI_CONVEX_SITE_PORT=3411 PSI_CONVEX_DATA=<dir>` before `local-backend.sh up` / `env` / `convex.sh deploy`,
  and the same `PSI_CONVEX_PORT` and `PSI_CONVEX_DATA` for the tests.
- `convex.test.ts`: against the local backend, in a throwaway `test-…` tenant (internal fixture,
  dropped afterwards): twelve identical and ten overlapping holds racing from separate clients,
  exactly one wins; hold, wrong token, submit, cancel with the code, release, an off-grid start,
  another tenant, a wrong server key. It is skipped, with a warning, when the backend is not up.

## Deploying (prepared, not yet applied)

`docs/plans/scheduling.md` §7 and §9 (S2). In the cluster the store is `gitops/services/scheduling-backend`
(StatefulSet, 10Gi SQLite volume, in-cluster Service `http://scheduling-backend.scheduling.svc:3210`,
NetworkPolicy, no Ingress, no dashboard) and the functions are deployed by `gitops/services/scheduling-deploy`:
an Argo PostSync Job running `apps/scheduling-deploy/deploy.sh` from the image CI builds
(`apps/scheduling-deploy/Dockerfile`). It sets `PSI_SCHEDULING_KEY` inside the deployment, then runs
`convex deploy`; it never runs a function, so the DEMO seed (`seed:demo`) is never called in the cluster.

OpenBao (`secret/apps/scheduling/env`: `INSTANCE_NAME`, `INSTANCE_SECRET`, `PSI_SCHEDULING_KEY`;
`secret/apps/scheduling/admin`: `CONVEX_SELF_HOSTED_ADMIN_KEY`) and the rows in `estate/APP-SECRETS.md`.
The admin key is derived from `INSTANCE_NAME` + `INSTANCE_SECRET`, so it is computed locally, with no
cluster access and no echo (`tools/scheduling/admin-key.sh`; the values go in over stdin, never argv):

```sh
bao kv get -format=json secret/apps/scheduling/env \
  | jq -r '.data.data | "INSTANCE_NAME=\(.INSTANCE_NAME)\nINSTANCE_SECRET=\(.INSTANCE_SECRET)"' \
  | tools/scheduling/admin-key.sh \
  | bao kv put secret/apps/scheduling/admin CONVEX_SELF_HOSTED_ADMIN_KEY=-
```

The backend image is built by CI from `apps/scheduling-backend/Dockerfile` (upstream Convex backend,
pinned by digest, permissions fixed for a non-root user); the CMS reads the store with
`CONVEX_URL` + the optional `cms-scheduling` Secret (`PSI_SCHEDULING_KEY`).
