# scheduling-api

psi's headless scheduling service (docs/plans/clinic.md, slice 3). JSON over HTTP under `/v1`, SSE streams, OpenAPI at
`/v1/openapi.json`. The contract is `packages/scheduling-sdk` (`@psi/scheduling-sdk/contract`: one zod route table);
the server mounts it, the typed client and the OpenAPI document derive from it.

```bash
pnpm --filter @psi/scheduling-api local   # port 4380, in-memory adapters, synthetic data, a dev issuer
curl -XPOST localhost:4380/dev/token -H 'content-type: application/json' -d '{"subject":"rita"}'
pnpm --filter @psi/scheduling-api authz:gen   # authz.manifest.json from src/authz/catalogue.ts + model.ts
```

The catalogue is `@psi/scheduling/permissions` (nothing is copied here); `src/authz/catalogue.ts` derives from it what the
service checks, and `model.ts` / `manifest.ts` / `roles-seed.ts` generate the rest. Regenerating the OpenFGA module,
the role catalog and the permission constants needs a SEB checkout (default `../seb`, or `SEB_CHECKOUT`); the script
takes the generator at the release `estate/platform.lock` pins:

```bash
pnpm --filter @psi/scheduling-api authz:gen   # manifest, then scripts/regen-authz.sh
```

and commit `authz.manifest.json`, `estate/authz/modules/sched.fga`, `estate/authz/catalog/scheduling-api.roles.json` and
`src/authz/permissions.generated.ts`. `src/authz/drift.test.ts` fails when a committed file differs from the model.
`fga model validate` on `estate/authz/fga.mod` must stay under SEB's 80% size gate (the model is about 95 KB of 256).

## Permissions

A key is `<resource>_<action>_<scope>[_<group>]` (scope `all`, `assigned`, `own`). A key without a group grants identity
only; every field group (`core`, `contact`, `guardian`, `money`, `clinical`) is granted by its own key. A route names the
key without its scope (`clients_view`), and the service checks `clients_view_all` on the app, or the narrower scopes
together with the object's reach (`reach_own`, `reach_assigned`). An individual denial names ONE relation
(`clients_view_own`), so a denial of one scope leaves the others; it is evaluated scope by scope.

* Record routes declare `record:dynamic`: the caller must hold ANY record resource first (403), then the handler asks for
  the resource of the record's form (`recordResourceFor(form id)`, 404) before it writes; the pipeline refuses to answer a
  handler that never asked. `payments.remove` and `leave.decide` are dynamic the same way.
* View-as: `GET /v1/apps/:app/me?as=` needs `roles_edit`; a request carrying `x-psi-view-as` that is not a GET is refused
  (`view_as_read_only`) before anything else.
* Role, member and app writes are one operation with their tuples: the row is written, then the tuples; a tuple failure
  puts the row back (and a removal writes the tuples first).

## Platform prerequisites (SEB changes; not made here)

1. **OpenFGA's NetworkPolicy** (`gitops/seb-pieces/openfga`, rendered by SEB) admits only Polaris and Authentik today. It
   must gain an ingress rule for this service, in ONE `from` element (namespace AND pod label):

   ```yaml
   - from:
       - namespaceSelector: { matchLabels: { kubernetes.io/metadata.name: scheduling-api } }
         podSelector: { matchLabels: { app: scheduling-api } }
     ports:
       - { port: 8081, protocol: TCP }   # Check / ListObjects (the read port)
       - { port: 8080, protocol: TCP }   # Write: tuples for roles, members and links (the admin port)
   ```
2. **A write path for `sched_` tuples.** Polaris's grant API refuses a machine's write of a userset (`sched_role#member`)
   or of a person (`not_grantable`, `machine_grants_person`), and roles-as-data need both. The service therefore writes
   tuples to OpenFGA's write API (`OPENFGA_WRITE_ENDPOINT`, `http://openfga-admin.openfga.svc:8080`) with the same preshared
   key as the read port. If SEB would rather route those writes through Polaris, only `src/authz/live.ts` changes.
3. The released model id, pinned in `secret/apps/scheduling-api/env` (`OPENFGA_MODEL_ID`), never `latest`.

## Rate limits

Visitor routes only: a token bucket in memory per service key and visitor (the site forwards the visitor's address in
`x-psi-client-ip`), or per subject for a signed-in visitor. 30 calls at once, refilling 5 a second; over it, `429
rate_limited` with `Retry-After`. Per replica.

## Convex: what is wired

Every collection is re-backed on the server-keyed wrappers of `packages/scheduling/convex` (see `src/store/convex/`),
and no route answers `not_available_yet`. The service calls them over Convex's HTTP API (`store/convex/rpc.ts`, the
server key added in one place) and the change feed over its WebSocket. The CONTRACT SUITE (`src/store/contract/`) runs
the same assertions on the in-memory adapter and on Convex, and `src/happy.test.ts` runs every route's happy path on
both.

```bash
# a throwaway backend of your own, on a free port (data outside the repository's .data)
export PSI_CONVEX_NAME=psi-convex-api PSI_CONVEX_PORT=3580 PSI_CONVEX_SITE_PORT=3581 PSI_CONVEX_DATA=<dir>
packages/scheduling/scripts/local-backend.sh up && packages/scheduling/scripts/local-backend.sh env
packages/scheduling/scripts/convex.sh deploy --yes
CONVEX_URL=http://127.0.0.1:3580 pnpm --filter @psi/scheduling-api test
packages/scheduling/scripts/local-backend.sh down
```

Without `CONVEX_URL` and `PSI_CONVEX_DATA` the Convex run is skipped, loudly (CI has no backend).

* Convex assigns ids; the API passes them through (`store/convex/ids.ts` is the one module that maps them: a table
  prefix where the API merges tables, a derived id for a roster day).
* The acting person reaches the wrappers through `store/actor.ts` (the HTTP layer runs each handler in `withActor`).
* Clinical text is sealed in the service (`CLINIC_MASTER_KEY`, `ports/crypto.ts`) and travels as Convex's encrypted
  field (`store/convex/envelope.ts`); Convex never sees plain text.
* The change feed: `changes:since` and `webRequests:feed` are live queries; the clinic wrappers write the log in the
  transaction of the write, so `append` does nothing.
