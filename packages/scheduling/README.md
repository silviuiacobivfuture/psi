# @psi/scheduling

psi's scheduling engine, framework-free, with Convex as its database. The plan, the privacy and
authorization model and the hosting decision are in `docs/plans/scheduling.md`.

| Part | Where |
| --- | --- |
| Domain, pure functions: wall time and DST (`time.ts`), slot generation (`slots.ts`), what blocks a calendar (`conflicts.ts`), the hold/request/appointment lifecycle (`lifecycle.ts`), retention, reminders (interface), contact rules, references and codes | `src/domain/` |
| Convex schema and functions: `catalog.services`, `availability.slots`, `appointments.hold / submit / release / cancel`, `staff.calendar / decide / reschedule / addException`, `staffCatalog.catalog / availability / updateService / addRule / removeRule / removeException`, `staffRooms.createRoom / updateRoom / addRoomClosure / removeRoomClosure / rooms`, `staffSchedule.setAlternating / setPeriod / removePeriod`, `staffBoard.board` (the staff calendar's data), `staffClients.importClients / createClient / clients / linkClient / eraseClient`, `staffSetup.createPractitioner / updatePractitioner / createService / setDayRules / addDaysOff` (the team's setup: the first create also makes the tenant, so production needs no seed; each records the acting staff subject), `staffRequests.requests`, the hold-expiry sweep (internal action) and retention (crons), the DEMO seed (`seed:demo`, `seed:demoRequests`) | `convex/` |
| Server clients for Hono apps (`ConvexHttpClient`, every answer parsed with zod, a deadline per call) | `src/client.ts` (visitor), `src/staff-client.ts` (team) |
| Configuration from the environment | `src/config.ts` |

The engine's Mastra tools (`findAvailability`, `requestAppointment`, `cancelRequest`) are in
`@psi/engine` (`src/scheduling/`) and take a port this client satisfies; `@psi/guide` wires the two
(`schedulingFromEnv`).

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
