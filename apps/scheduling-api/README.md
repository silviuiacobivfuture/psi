# scheduling-api

psi's headless scheduling service (docs/plans/clinic.md, slice 3). JSON over HTTP under `/v1`, SSE streams, OpenAPI at
`/v1/openapi.json`. The contract is `packages/scheduling-sdk` (`@psi/scheduling-sdk/contract`: one zod route table);
the server mounts it, the typed client and the OpenAPI document derive from it.

```bash
pnpm --filter @psi/scheduling-api local   # port 4380, in-memory adapters, synthetic data, a dev issuer
curl -XPOST localhost:4380/dev/token -H 'content-type: application/json' -d '{"subject":"rita"}'
pnpm --filter @psi/scheduling-api authz:gen   # authz.manifest.json from src/authz/catalogue.ts + model.ts
```

Regenerating the OpenFGA module needs a SEB checkout: copy the manifest next to a scratch copy of SEB's `authz/` and run
`python3 authz/tools/generate.py --estate estate/authz.json <manifest>`; commit `estate/authz/modules/sched.fga`,
`estate/authz/catalog/scheduling-api.roles.json` and `src/authz/permissions.generated.ts`. The 1 MB closure test the
generator also writes is not committed. `src/authz/drift.test.ts` fails when the committed module or manifest differ from
the model.

## Not available yet on the Convex adapter

`src/store/convex.ts` wires the visitor flow and the web requests. Everything else answers `not_available_yet` (501):
every collection (`apps`, `members`, `roles`, `people`, `rooms`, `devices`, `groups`, `services`, `clients`,
`appointments`, `packages`, `payments`, `roster`, `leave`, `reminders`, `records`, `files`, `audit`, `definitions`,
`imports`), the change feed (`changes:since` as a live query, plus an append), `visitor.callback`, `visitor.mine`,
`visitor.cancelMine`, `members.appsOf`.

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
