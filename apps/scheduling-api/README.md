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
