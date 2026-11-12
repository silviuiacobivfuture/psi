# @psi/scheduling

psi's scheduling engine, framework-free, with Convex as its database. The plan, the privacy and
authorization model and the hosting decision are in `docs/plans/scheduling.md`.

| Part | Where |
| --- | --- |
| Domain, pure functions: wall time and DST (`time.ts`), slot generation (`slots.ts`), what blocks a calendar (`conflicts.ts`), the hold/request/appointment lifecycle (`lifecycle.ts`), retention, reminders (interface), contact rules, references and codes | `src/domain/` |
| Convex schema and functions: `catalog.services`, `availability.slots`, `appointments.hold / submit / release / cancel`, `staff.calendar / decide / reschedule / addException`, `staffCatalog.catalog / availability / updateService / addRule / removeRule / removeException`, `staffRequests.requests`, the hold-expiry sweep (internal action) and retention (crons), the DEMO seed (`seed:demo`, `seed:demoRequests`) | `convex/` |
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
- `convex.test.ts`: against the local backend, in a throwaway `test-…` tenant (internal fixture,
  dropped afterwards): twelve identical and ten overlapping holds racing from separate clients,
  exactly one wins; hold, wrong token, submit, cancel with the code, release, an off-grid start,
  another tenant, a wrong server key. It is skipped, with a warning, when the backend is not up.

## Deploying (not done)

`docs/plans/scheduling.md` §7 and §9: a StatefulSet in the estate with the same image digest, an
in-cluster Service only, the instance secret, admin key and server key from OpenBao, and
`convex deploy` from CI with `CONVEX_SELF_HOSTED_URL` and `CONVEX_SELF_HOSTED_ADMIN_KEY`.
