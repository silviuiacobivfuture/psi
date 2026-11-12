# Agent Studio: Mastra Studio for staff, behind the estate's sign-in

Status: prepared. Nothing is registered with Argo, Authentik or CI's deploy path yet (see Registration).
App: `apps/agent-studio` (`@psi/agent-studio`). Manifests: `gitops/services/agent-studio`.

## The owner's two questions

- **Is Studio in the codebase?** Yes, for local use only: `packages/engine/studio/index.ts`
  (`pnpm --filter @psi/engine studio`, `mastra dev`, port 4360). It binds to localhost, has no
  sign-in, registers the ingest workflow, and writes `.data/studio.db`. The deployable Studio is a
  new app that imports the same engine and guides (`@psi/guide`, `@psi/knowledge`). The engine
  package is left untouched.
- **Does Mastra support SSO?** Only partly. `@mastra/auth` 1.1.5 ships `MastraJwtAuth` (a shared
  secret) plus providers for Auth0, Clerk, Supabase, Firebase, WorkOS and Better Auth. It has no
  generic OIDC provider. `@mastra/core` exports the abstract `MastraAuthProvider`, which is what we
  extend. **Studio's page with a third-party sign-in requires a Mastra Enterprise licence in
  production** (mastra.ai/docs/studio/auth). This was measured, not inferred: with `server.auth` set
  and `NODE_ENV=production`, `/api/auth/capabilities` answers `{enabled:true, login:null}` with no
  user (`@mastra/core` `buildCapabilities` calls `getCurrentUser` only when licensed). The page then
  stops at "Authentication Required", even though every API call it makes returns 200.
  RBAC and FGA (`server.rbac` / `server.fga`) also need the licence and make the server refuse to
  start without it, so we configure neither.

## Production build

`mastra build --dir src/mastra --studio` emits `.mastra/output/index.mjs`, a Hono server
(`@mastra/deployer`). It installs its own production `node_modules` and writes Studio's page to
`output/studio/`. The server serves that page when `MASTRA_STUDIO_PATH` points there; the image sets
`/app/studio`. The page is told where the API is through `server.studioHost`, `studioProtocol` and
`studioPort`, all derived from `AGENT_STUDIO_PUBLIC_URL`, so the browser calls
`https://studio.psizone.ro/api`. `GET /health` is registered before any middleware and answers
unauthenticated, which is what the probes use. The output is about 460 MB because of its
`node_modules`.

## Host, people, roles

- **Host:** `studio.psizone.ro`, `exposure: public` behind the gate. psi has no mesh
  (`estate/identity.yaml` `MESH: none`), and the estate's private tools open at
  `<tool>.psizone.ro` behind sign-in. Authentik is `auth.psizone.ro` (`AUTHENTIK_HOST_PREFIX: auth`
  on origin/dev). `sso.` is the sign-in hub.
- **Groups** (`app-<app>-<role>`, ROLES.md §1):
  - `app-agent-studio-viewer`: can open Studio and read agents, traces and threads.
  - `app-agent-studio-operator`: can also run agents, tools and workflows.
  - `authentik Admins` is bound as break-glass at the gate. It holds `view` in the pod
    (`AGENT_STUDIO_VIEW_GROUPS`), never `operate`.
- **Authorization:** `apps/agent-studio/authz.manifest.json` declares `agent_studio:psi` with the
  relations `view` and `operate`. When `OPENFGA_*` is set, the pod asks OpenFGA
  `Check(user:<sub>, view|operate, agent_studio:psi)` through `@psi/account`'s client. Until psi's
  OpenFGA has a store and model for it, the isolated interim (`groupAuthorizer`, as cms's
  `interim.ts`) reads the same two relations from the groups Authentik returns.
- **Read-only by default.** `AGENT_STUDIO_MODE=read-only` refuses every non-GET/HEAD/OPTIONS
  request to everyone, whatever their group. Running anything needs `AGENT_STUDIO_MODE=operate`
  **and** `operate`.

## SSO: two layers

**(a) Edge: Authentik's proxy provider and forward-auth at Traefik.** This copies pdfcraft
(`pieces/pdfcraft/base/{ingress,networkpolicy}.yaml`).
- The blueprint `gitops/platform/authentik/blueprints-agent-studio.yaml` creates the proxy provider
  `agent-studio` (mode `forward_single`, `external_host https://studio.psizone.ro`, explicit consent,
  `default-invalidation-flow`). It also creates the application `agent-studio` and three bindings:
  viewer, operator and `authentik Admins`.
- The gated Ingress uses `agent-studio-forwardauth` (in this namespace). It is the estate's
  Middleware plus `X-authentik-jwt` in `authResponseHeaders`. Traefik replaces each listed header
  with the outpost's value, so a browser cannot supply its own.
- The callback Ingress keeps the estate's exact chain,
  `authentik-sso-restart@kubernetescrd,authentik-authentik-forwardauth@kubernetescrd`.
- The NetworkPolicy admits only Traefik (plus kubelet probes). Egress is limited to DNS, Chroma's
  sidecar (`:8080`), Authentik's server pods (`:9000`; userinfo is called in-cluster, with no
  hairpin through the public address) and 443 out (OpenRouter).
- Behaviour:
  - A signed-out browser gets a 302 to `auth.psizone.ro`.
  - A signed-in person outside the three bindings is refused by Authentik.
  - Everyone else reaches the pod with `X-authentik-jwt`.

**(b) In the pod: `AuthentikAuthProvider`** (`apps/agent-studio/src/auth/`), a `MastraAuthProvider`.
- **Gate token (`X-authentik-jwt`).** This is the proxy provider's access token. Authentik forces a
  proxy provider's `signing_key` to None (`ProxyProvider.set_oauth_defaults`, 2026.5.3), so the
  token is **HS256 under a client secret that only Authentik's database holds**, and it cannot be
  verified with a JWKS. Live `pdfcraft` discovery confirms this: HS256 only, and an empty `jwks/`.
  The pod checks it in this order:
  1. Issuer equals `https://auth.psizone.ro/application/o/agent-studio/`. Issuers are per
     application, so another gated app's token is refused.
  2. Not expired (30 s skew).
  3. `aud`, if `AUTHENTIK_GATE_AUDIENCE` is set.
  4. **Authentik's userinfo endpoint answers 200 for exactly this token string.** Authentik looks
     the `AccessToken` up by its raw string and rejects it if expired or revoked
     (`providers/oauth2/utils.py`).
  5. The subject userinfo returns equals the token's.

  Groups come from userinfo (the `profile` scope's `groups`), never from a header. Answers are
  cached for 30 s per token.
- **Bearer (`Authorization: Bearer`): RS256 via JWKS** with `jose`. It checks issuer, audience and
  expiry, with `algorithms: ["RS256"]` pinned, so HS256 or `none` is refused before any key is
  read. It is for an OIDC provider *with* a `signing_key` (CLI or API callers). It is off unless
  `AUTHENTIK_BEARER_ISSUER`/`_AUDIENCE` are set. No such provider is declared yet; see Next.
- **Where the check runs** (`AGENT_STUDIO_AUTH_SURFACE`):
  - `edge-guard` (deployed default): the provider's own `authenticateToken`/`authorizeUser`/
    `mapUserToResourceId` run as Mastra `server.middleware` on every path. Studio's page works
    unlicensed. This calls nothing the licence gates and spoofs nothing.
  - `server-auth`: the same provider as `server.auth`, with `getCurrentUser` for the page. Use it if
    psi buys a licence (`MASTRA_LICENSE_KEY` in OpenBao).
  - **Owner decision:** confirm `edge-guard` against Mastra's terms, or license.
- **Results:** no identity, a forged or foreign token, or an expired one gives **401**. A signed-in
  person outside Studio's groups, a viewer making any write, or anyone writing in read-only mode
  gives **403**. The memory resource id is the person's `sub`.
- A production start without a gate or bearer issuer, or with `AGENT_STUDIO_AUTH=off`, is refused
  by `src/config.ts` (zod). The guard answers 500 rather than run a request without a request
  context to scope memory to.
- **Method gating covers execution.** Enumerating `@mastra/server` 1.82.0's 435 routes:
  - Every run, generate, stream-start, tool execute, workflow start and A2A call is a POST.
  - GET routes only list, read or tail existing streams.
  - `ALL /mcp/:serverId/{mcp,sse}` exist, but psi registers no MCP server.
  - The only framework-public routes (which skip the guard) are `/auth/*`. With no `server.auth`,
    they report sign-in as disabled.

## What Studio can reach (risk controls)

- **Money.** Agents call OpenRouter. Studio has its own key, `secret/apps/agent-studio/env`
  `OPENROUTER_API_KEY`, so it can be capped and revoked at OpenRouter separately from the sites.
  Read-only is the default.
- **Shared knowledge.** The knowledge base is passed in as **search only**: no `ingest-knowledge`
  workflow, and no raw vector store. Studio therefore cannot rewrite the Chroma every site reads.
- **Appointment holds.** The scheduling tools (`requestAppointment`, `cancelRequest`) are not wired
  (`AGENT_STUDIO_SCHEDULING=off`, and no Convex key in the ExternalSecret). Turning them on is a
  separate decision, ideally against a test Convex deployment.
- **Memory store.** Runs and traces go to libSQL on an `emptyDir` (1 Gi), so a restart forgets them.
  Next step: a PVC (hcloud-volumes, 10 Gi minimum), or `@mastra/pg` on a CNPG cluster with
  `secret/apps/agent-studio/db`.

## OpenBao paths and Authentik objects that must exist

| What | Where | Who writes it |
|------|-------|---------------|
| `OPENROUTER_API_KEY` (a new, Studio-only key) | `secret/apps/agent-studio/env` | owner (OpenRouter → OpenBao) |
| `CHROMA_SERVER_TOKEN` (existing, shared with the sites) | `secret/apps/chroma/env` | exists |
| Harbor pull | `secret/platform/harbor/pull` | exists |
| Groups `app-agent-studio-viewer`, `app-agent-studio-operator`; proxy provider + app `agent-studio` | blueprint above | Authentik, once wired |
| Later: `OPENFGA_*` / `MASTRA_LICENSE_KEY` | `secret/apps/agent-studio/env` | when chosen |

## Registration (not done here; who owns it)

1. **Embedded outpost.** Add `!Find [authentik_providers_proxy.proxyprovider, [name, agent-studio]]`
   to the outpost's `providers:` in `gitops/platform/authentik/blueprints-providers.yaml`. That list
   replaces the outpost's whole set. Until it is added, the domain-wide provider answers for the
   host. Its token carries that provider's issuer, so the pod refuses **every** request (401).
   *SEB / genesis render*, because the file carries `WLSLUG` placeholders.
2. **Blueprint wiring:** `blueprints-agent-studio.yaml` under `resources` in
   `gitops/platform/authentik/kustomization.yaml`, and `authentik-blueprints-agent-studio` under
   `blueprints.configMaps` in `gitops/apps/overlays/dev/authentik.yaml`, as the cms commit
   (f43a6f7) did. *Estate owner.*
3. **Forward the JWT at the estate's Middleware (preferred):** add `X-authentik-jwt` to
   `authResponseHeaders` in SEB's `middleware-forwardauth.yaml`. Studio could then drop its own
   Middleware. *SEB.*
4. **Argo:** `gitops/apps/overlays/dev/apps/agent-studio.yaml` (copy `cms.yaml`, namespace
   `agent-studio`, `CreateNamespace=true`) and its line in that kustomization. *Estate owner, last.*
5. **Docs and gates:** a ROLES.md matrix row, an `APP-SECRETS.md` row, and the groups in
   `blueprints-groups.yaml` if SEB wants them there (cms keeps its own in its blueprint). SEB's
   `sso-restart.sh` derives forward-auth hosts from `blueprints-providers.yaml` only, so it does not
   check Studio's callback until item 1 lands. *SEB.*
6. **CI** needs nothing: `.github/workflows/apps.yml` builds every `apps/*/Dockerfile` and bumps
   `overlays/dev` (`newTag: "unbuilt"` until then). **Pushing this app therefore builds and pushes
   its image.** It deploys nothing until item 4.
7. **Probe CIDRs** in `overlays/dev` are pdfcraft's. Re-read the live node addresses before the
   first sync.

## First live checks, after registration

1. The userinfo confirmation against the real outpost token: sign in, then check the pod logs show
   no `Authentik refused the token`. Confirmed from source (2026.5.3), not yet live.
2. A curl with no cookie to `https://studio.psizone.ro/api/agents` returns 302 to `auth.`.
3. A viewer gets the page. A viewer's POST returns 403. An outsider is refused at Authentik.

## Verification (local, 2026-11-12)

- `tsc` is clean. `vitest`: 32 tests across the RS256, gate, provider, edge-guard and config paths,
  using keys generated locally and a real HTTP stand-in for Authentik's JWKS and userinfo
  (`src/auth/authentik.fixture.ts`).
- `mastra build --studio` was run, the output was copied outside the workspace, and it was run with
  `NODE_ENV=production`. The matrix: `/health` 200; no identity 401; forged, foreign-app or
  wrong-audience token 401; outsider 403; viewer GET 200; viewer POST 403; operator POST 403 in
  read-only and allowed in operate; RS256 bearer 200. Studio's page renders the agents list through
  a header-injecting stand-in for Traefik.
- `kubectl kustomize gitops/services/agent-studio/overlays/dev` renders 10 objects. `seb.app.yaml`
  validates against SEB `schema/app.schema.json`.

## Next

- A JWKS-verified API path: an OAuth2 provider `agent-studio-api` with a `signing_key` and the
  client-credentials grant, for scripts.
- A PVC for Studio's store.
- The OpenFGA store and model for `agent_studio`.
- The licence decision.
