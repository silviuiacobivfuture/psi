# Accounts — one estate account across psi's four sites

Status: plan and first slice, 2026-11-12. Package `packages/account` (`@psi/account`).
**OWNER** marks a decision that is the owner's; each one has a default that the code already follows.

## 1. What exists today (verified 2026-11-12)

| Fact | Source |
|---|---|
| Authentik answers at **`https://auth.psizone.ro`**; an application's issuer is `https://auth.psizone.ro/application/o/<slug>/`. The `cms` discovery is live. Its back-channel and front-channel logout are both supported (`backchannel_logout_supported: true`) | e3e61b5; probed discovery |
| Authentik 2026.5.3. An OAuth2 provider takes `logout_uri` + `logout_method: backchannel` | `gitops/apps/overlays/dev/authentik.yaml`; the live `/api/v3/schema/` |
| `sso.psizone.ro` is kept for the **sign-in hub** (Polaris's OIDC broker, `HUB_HOST_PREFIX: sso`). The hub is not deployed: no autorizare Application in `gitops/apps/overlays/dev/seb-pieces` | e3e61b5 |
| **OpenFGA is deployed** (SEB piece, `openfga` namespace): `openfga:8081` read port behind `authzfilter`, `openfga-admin:8080` for Polaris only, preshared keys from OpenBao `apps/openfga/env#OPENFGA_AUTHN_PRESHARED_KEYS` | `gitops/seb-pieces/openfga/rendered.yaml` (origin/dev) |
| **Polaris (`autorizare`) and its sign-in hub are now in gitops** (d956fdb: `seb-pieces/autorizare`, hub at `sso.psizone.ro`, registry `estate/seb-components/autorizare/hub/clients.json`). On 2026-11-12 both answer **503**: no store, model release or grant path is usable yet | origin/dev; probed |
| OpenFGA's NetworkPolicy admits `:8081` from Polaris's hub, Authentik's server and four node/CNI addresses only. **No site namespace can reach it** | same file, `NetworkPolicy openfga` |
| The sites answer at `landing.`, `eqsync.`, `hemisync.`, `blog.psizone.ro`. They are public and have no secrets today | `gitops/services/*-web/base` |
| The CMS signs in through Authentik directly (`blueprints-cms.yaml`, `OIDC_ISSUER=https://auth.psizone.ro/application/o/cms/` since e3e61b5) | origin/dev |

## 2. Sign-in: one estate account through Authentik

```
visitor ─► landing.psizone.ro/auth/sign-in ─302─► auth.psizone.ro/application/o/psizone-web/ (code + PKCE S256, state, nonce)
        ◄─302── /auth/callback?code  ─► token exchange (confidential client) ─► ID token verified (openid-client)
        server-side session row (Postgres) ◄─ opaque id in __Host-psi-psizone-session (httpOnly, Secure, Lax)
```

- **One Authentik application and provider per site** (`psizone-web`, `eqsync-web`, `hemisync-web`, `blog-web`), following
  `blueprints-cms.yaml`: a confidential client, the authorization code grant plus refresh, `sub_mode: hashed_user_id`,
  and scopes openid, email and profile. Authentik keeps one session for the browser at `auth.psizone.ro`, so a person
  who signs in on one site is signed in on the next site's redirect without a prompt. That is the single sign-on.
- **The account key is the Authentik `sub`.** `hashed_user_id` is instance-wide, so it is the same on all four
  providers. Each `(iss, sub)` pair is recorded as an identity link, the way D25 (in SEB's docs) does it, so a later move
  to the hub re-points links and never rewrites ids. **Verify on the first live sign-in:** sign in on two sites and
  compare the `sub`. **OWNER:** sign in through Authentik directly (the default), or through the hub at
  `sso.psizone.ro`. SEB's D23 says business apps sign in through the hub. The hub issues no token to a person who
  belongs to no organisation, and psi's visitors belong to none. Moving to the hub therefore needs a SEB decision first:
  a personal org per visitor, or a consumer context. That is also why the sites are not in the hub's client registry
  (`estate/seb-components/autorizare/hub/clients.json`). Like the CMS, Argo CD and OpenBao (8db1e02), they are
  Authentik applications.
- **No local passwords**, no password field, no local strategy. Authentik's own policy decides how a person signs in.
- **The session stays on the server.** The cookie holds only a random id; Postgres holds `sha256(id)`. Each site has its
  own cookie, scoped to its own host by the `__Host-` prefix, and its own name, because `localhost` shares cookies
  across ports in development. Idle timeout is 8 h and the absolute limit is 30 days (**OWNER**). The login transaction
  (state, nonce, PKCE verifier, return path) travels in a sealed `__Host-…-txn` cookie for 10 min. The return path is
  limited to the same origin.
- **Signing out signs out of the estate.** `POST /auth/sign-out` deletes the session and sends the browser to that
  provider's `end_session_endpoint` with `id_token_hint`. Authentik ends its own session and calls every provider's
  **back-channel logout** (`POST /auth/backchannel-logout`, a signed `logout_token`). Each site then deletes the sessions
  with that `sid` (or that `sub` when no `sid` is sent). Without back-channel logout, another site's session would
  outlive the Authentik session until its own idle timeout. **Verify live** that Authentik 2026.5 sends logout tokens to
  every provider the session used.
- **Writes must come from the same origin.** The four sites are same-site with each other, so `SameSite=Lax` alone
  does not stop one site posting to another. Every state-changing route refuses a foreign `Origin` and a
  `Sec-Fetch-Site` other than `same-origin`/`none`. This is the CMS's `sameOrigin` rule.
- **Public pages stay public.** The Compass carries a static "Account" link, so no page reads the session in order to
  render. Account pages and every write that belongs to a person require sign-in.

## 3. What an account holds — minimal, GDPR-aware

psi is a psychology clinic, so anything touching health is special-category data (GDPR art. 9). The account holds:

| Holds | Never holds |
|---|---|
| `sub`, the identity links `(iss, sub)`, created / last seen | passwords (Authentik's), MFA secrets |
| e-mail and display name **as Authentik sent them**, refreshed at each sign-in, for the account page only | clinical records, diagnoses, assessments, therapy notes |
| one consent row per **purpose** (`guide_memory`, `programme_progress`, `booking_contact`): granted at, withdrawn at, wording version | anything inferred: no profiling, no "interests" |
| each site's own records, listed below | the guide's free text, unless `guide_memory` is granted |

**Consent is explicit, per purpose, and withdrawable.** Withdrawing a consent deletes that purpose's data in the same
transaction, never "later". Nothing a person can do needs a consent they have not given.

**The journey** (`@psi/account` `registerJourney`, every page in the site's own shell, ro/en, `private, no-store`):
`/cont` (who, sign-out everywhere, a timeline of bookings, consents, saved articles, conversations), `/cont/profil`
(display name, phone, preferred contact, language; the e-mail is Authentik's), `/cont/consimtaminte`,
`/cont/programari`, `/cont/conversatii`, `/cont/date` (JSON export; erasure behind a typed word). Signed out, every
page is an invitation back to itself (a write whose session ended goes through sign-in to the page it came from). Every
journey GET first makes one silent `prompt=none` check, so a person signed in elsewhere arrives recognised.

- **Reservations (Psizone).** A signed-in booking (`/contact` or the guide's in-chat form) carries
  `accountHashOf(sub)` = SHA-256(`psi-account:` + sub) on the Convex request (`@psi/scheduling`, `by_account_start`);
  the store never holds the subject and still does not depend on the CMS. `/cont/programari` lists, and cancels upcoming
  ones, after OpenFGA allows `psizone_booking_request` viewer/editor with the account as contextual owner; Convex
  re-checks the hash inside the transaction (that is the real guard: the contextual owner is always the asker). An
  anonymous request is linked only with its reference **and** cancel code, by a signed-in person; never by name or e-mail.
- **Pre-fill.** For a signed-in person only, the booking form, the guide's in-chat form and its confirm step start with
  the profile's name, e-mail and phone, editable. Anonymous visitors get an empty form and a sign-in line back to the page they are on (a chat too).
- **History (deviation, flagged).** The brief said "the guide's consented `threadId` memory". The engine stores threads
  with no list or delete API and is another agent's, so a person could not see or delete them. Instead, with
  `guide_memory` granted, `rememberingGuide` keeps each answered turn in `account_conversation[_turn]` (one per account
  and site), sends it back as `history` (never twice), and keeps nothing refused. `/cont/conversatii` shows it word for
  word; delete-one and delete-all are `psizone_guide_thread#forgetter`; withdrawing the consent deletes it all.
- **Consents offered:** only `guide_memory` (the only purpose that changes something today); `booking_contact` and
  `programme_progress` stay in the schema for A7/A8.
- **Export and erasure live on Psizone** (`/cont/date`), where the reservations are; the other sites' data page sends
  the person there. Erasure unlinks the person's Convex requests first (they stay with the clinic, cancelled or not),
  then ends the session through Authentik's end-session (every site, back-channel) and deletes the account row, which
  cascades through profile, consents, sessions, conversations and saved articles. **OWNER:** delete the Authentik user
  too (a new sign-in recreates an empty account today); legal retention of booking rows.

## 4. Authorization — Polaris's model, OpenFGA's decisions

**The one rule:** OpenFGA is the data plane and Polaris is the control plane. The sites call OpenFGA's read port
directly for every Check (`POST /stores/{id}/check`), with the pinned model id. Polaris is never in the decision path.

**Modules: one per application, generated.** Each site declares `apps/<app>/authz.manifest.json` (relational model).
SEB's generator emits `estate/authz/modules/<module>.fga`, the catalog `estate/authz/catalog/<app>.roles.json`, the
closure tests and `apps/<app>/src/authz/permissions.generated.ts`. `estate/authz/fga.mod` begins with SEB's `core`
and `autorizare` (vendored), then `psizone`, `eqsync`, `hemisync`, `blog` and `cms` (the CMS's own manifest,
`apps/cms/authz.manifest.json`). The CMS's generated `apps/cms/lib/authz/permissions.generated.ts` is owed by its owner.
The generator writes beneath SEB's own root, so it runs from a scratch copy of SEB's `authz/`, with psi's manifests
copied under it. The outputs are then copied back here, and SEB itself is never written. The following all pass over
the six manifests: `generate.py --check`, `check-manifest.py`, `check-catalog.py` (psi's model staged as `authz/`),
`check-model-size.py` (12.75 KB), `fga model validate`, `fga model test` (9 files). **OWNER:** SEB's lumen example and its `platform.fga.mod`
say an estate vendors `core.fga`/`autorizare.fga` beside its own modules, but psi's CLAUDE.md says platform code is
never copied here. Keep the two vendored files (fga.mod cannot reference a sibling checkout), or have SEB's bundle
supply them.

| Module | Object types (scope: `platform:psi` via `parent_platform`) | Catalog roles (platform scope) |
|---|---|---|
| psizone | `psizone_account` (viewer, editor, eraser), `psizone_booking_request` (viewer, editor), `psizone_guide_thread` (viewer, forgetter); account and thread types serve all four sites (one model) | `psizone:reception` (bookings), `psizone:privacy_officer` (account export/erase) |
| eqsync | `eqsync_programme_enrollment` (viewer, editor), `eqsync_protocol_licence` (listener) | `eqsync:programme_support` (view enrolment) |
| hemisync | `hemisync_session_request` (viewer, editor), `hemisync_exercise` (listener) | `hemisync:reception` |
| blog | `blog_saved_article` (viewer, editor) | `blog:privacy_officer` (export) |

The brief's bare `account` and `booking_request` are not legal type names: AUTZ-1 requires `<module>_<entity>`, so the
names follow the contract. Every object is scoped to the platform because psi's visitors belong to no organisation.

**The owner is a contextual tuple.** A record's owner is a fact in the site's own row, which is the system of record. At
Check time `@psi/account` sends it as contextual tuples: `user:<owner sub> viewer|editor <type>:<id>` and
`platform:psi parent_platform <type>:<id>`. The subject is the verified session `sub`. Nothing about a visitor is
persisted in OpenFGA, for three reasons:

1. Persisting the owner would need a write path. Tuples are written only through Polaris, and a machine's write naming
   a person is refused (`machine_grants_person`, AUTZ-20). The person's delegated token comes from the hub, which psi
   does not run.
2. Health-adjacent facts ("this person requested a session") stay out of a shared authorization graph.
3. Erasure needs nothing deleted in OpenFGA.

**Staff are persisted tuples.** A staff member holds a catalog role, e.g. `user:<sub> role_psizone_reception
platform:psi`, granted in Polaris's console and audited there. No role, group name or permission is written in app
code. Group names in the token are never read.

Every relation has a positive and a negative assertion in `estate/authz/tests/<module>.fga.yaml` (owner, stranger,
the owner without the row, and each staff role) and in the generated `*.closure.fga.yaml`.

**Estate administrators.** The generator makes `platform#administrator` confer every platform-scoped permission, so an
estate operator can read saved articles and bookings. **OWNER:** accept this, or ask SEB for an opt-out on platform scope.
`org_administrator_uses_app: false` covers organisations only.

**The client.** `@psi/account`'s `createAuthzClient` follows SEB's TypeScript SDK contract (03-contracts §7): `check`,
`batchCheck`, `listObjects`, `afterWrite`; model pin required; `now` injected and refused from callers;
`MINIMIZE_LATENCY`, with `HIGHER_CONSISTENCY` for 5 s after the caller's own write; the closed error union; a missing
batch entry is never `false`. A contract-faithful copy until SEB's bundle (and its SDK) reaches psi.

## 5. When OpenFGA is unreachable (cache wall)

SEB's 17-cache-wall: an application with no mirror **fails closed**.

- No decision is cached, no allow is remembered, and no local role is ever a fallback.
- A transport failure or 5xx is `unavailable`, and the protected surface answers **503** with the site's "temporarily
  unavailable" page. The rest of the page, and every public page, renders normally.
- A batch entry OpenFGA did not answer is treated as unknown and that row is hidden, never shown as "denied".
- When SEB ships the `mirror-agent` sidecar (17, build step 7), only `OPENFGA_ENDPOINT` changes, to `127.0.0.1:8081`.

## 6. Configuration — drop-in

`@psi/account` parses the environment with zod. In production accounts are optional: all eight settings below → on;
none → off (sites boot, Compass entry hidden, /cont/* and /auth/* say "coming soon", one log line); some → the boot
stops with `MISSING REQUIRED SECRET` naming them. In development the sites boot and report what is missing.

| Variable | Per site | Source in the cluster (OpenBao) |
|---|---|---|
| `OIDC_ISSUER` | `https://auth.psizone.ro/application/o/<app>/` (default derived from `AUTHENTIK_URL` + slug) | Deployment env |
| `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` | yes | `secret/apps/<app>/oidc` `client_id`, `client_secret` — the same pair the Authentik blueprint reads |
| `SESSION_SECRET` | yes (≥ 32 chars, generated) | `secret/apps/<app>/env` `SESSION_SECRET` |
| `ACCOUNT_DATABASE_URL` | shared | `secret/apps/account/db` `username`, `password` → `account-db-rw.account` (dev, first consumer clinic: `account-db-rw` in namespace `clinic`, `gitops/services/clinic/base/account-db.yaml`) |
| `OPENFGA_ENDPOINT` | `http://openfga.openfga.svc:8081` | Deployment env |
| `OPENFGA_STORE_ID` | shared | `secret/apps/autorizare/env` `OPENFGA_STORE_ID`, the same property Polaris reads |
| `OPENFGA_MODEL_ID` | shared | `secret/apps/account/openfga` `model_id`, written at Polaris's release of psi's model. **OWNER/SEB:** where the estate records its pin |
| `OPENFGA_TOKEN` | per site | one entry of `apps/openfga/env#OPENFGA_AUTHN_PRESHARED_KEYS`, copied to `secret/apps/<app>/env` `OPENFGA_TOKEN` |
| `OIDC_ALLOW_INSECURE_LOOPBACK` | dev only | refused when `NODE_ENV=production` |
| `BLOG_URL` (with `PSIZONE_URL`, `EQSYNC_URL`, `HEMISYNC_URL`) | all | Deployment env. **Was missing on every Deployment**, so the blog's own origin fell back to `http://localhost:4340` |

The prepared gitops changes (uncommitted, following the CMS pattern) are listed in §8.

## 7. Data storage

- **Cluster:** one CNPG cluster `account-db` in a new `account` namespace, shared by the four sites. They share one
  account and the erasure cascade must be one transaction. Backups go to the estate's object storage with barman, like
  `cms-db`. **OWNER:** one shared accounts database (the default), or one per site.
- **Local:** Postgres 17 in docker on `127.0.0.1:55451`.
- **Migrations:** idempotent `CREATE TABLE IF NOT EXISTS`, run by `@psi/account` at start under an advisory lock
  (`src/stores/postgres.ts`).

## 8. Deployment changes prepared (not pushed: a live change, the owner confirms first)

1. **`gitops/platform/authentik/blueprints-sites.yaml`** declares four providers and applications. Each has a confidential
   client, its redirect URI `https://<host>/auth/callback`, its back-channel `logout_uri`
   `https://<host>/auth/backchannel-logout`, and **no** policy binding. **OWNER:** who may sign in. The default lets any
   active Authentik user in, because visitors self-enrol. That needs Authentik's enrolment flow opened to the public,
   with consent text (**OWNER**). Today enrolment is invitation-only.
2. **`gitops/platform/authentik/sites-oidc-externalsecret.yaml`** carries the four client pairs into Authentik's env.
   It is also wired in `kustomization.yaml` and in `gitops/apps/overlays/dev/authentik.yaml` (`envFrom` plus
   `blueprints.configMaps`).
3. **`gitops/services/<app>-web/base/externalsecret.yaml`** gives each site its `<app>-env`, and its Deployment gets
   `envFrom` and the `OIDC_ISSUER`/`OPENFGA_*` env.
4. **`gitops/services/account/`** adds CNPG `account-db` (backup slot 04:50 Sunday) and its ExternalSecrets, plus
   `gitops/apps/overlays/dev/apps/account.yaml` listed in that directory's kustomization.
   **Push order.** Without any account values the sites run with accounts off ("coming soon"), so code ships first.
   The site ExternalSecret/assert changes go in only once the OpenBao keys, `account-db` and the Polaris pin exist: a
   partial set stops the boot by design. `ROLES.md` gets a row for the four sites (no groups: visitors
   hold no entitlement), as `gitops/platform/authentik/CLAUDE.md` §5 asks.
5. **Needed from SEB:** the OpenFGA NetworkPolicy must admit the four site namespaces on `:8081`. That is a platform
   change, so it goes to SEB. Until then, a Check from the cluster times out and the surfaces answer 503 (§5).
6. **Needed from Polaris:** psi's model released into the dev store, giving `OPENFGA_STORE_ID` and `OPENFGA_MODEL_ID`.
7. **Still owed (CMS pattern).** Each site needs an `apps/<app>/seb.app.yaml`, as `apps/cms/seb.app.yaml` has. Its
   `secrets:` block declares the keys for seeding and the doctor:
   - `apps/<app>/oidc`: `client_id` (generated, 40) and `client_secret` (generated, 96). Read by `<app>-env` and
     `authentik-sites-oidc`.
   - `apps/<app>/env`: `SESSION_SECRET` (generated, 64) and `OPENFGA_TOKEN`. The token is minted with the OpenFGA key
     list, and added to `apps/openfga/env#OPENFGA_AUTHN_PRESHARED_KEYS`.
   - `apps/account/db`: `username` (literal `account`) and `password` (generated, 40).
   - `apps/account/openfga`: `model_id`, written at Polaris's release. The store id is Polaris's own
     `apps/autorizare/env#OPENFGA_STORE_ID`.
   The sites have no `seb.app.yaml` today, so that is a new declaration per site, not an edit.

## 9. Staff surfaces

- **CMS:** signs in through Authentik (`auth.psizone.ro/application/o/cms/`). Its binding is `app-cms-editor` plus
  `authentik Admins` as break-glass. Its authorization still runs on the interim adapter until Polaris answers.
- **Mastra Studio** (`packages/engine`) and the **design gallery** are local-only and have no route, Ingress or image.
  If either is ever deployed, it sits behind Authentik forward-auth (`middleware-forwardauth.yaml`) with an
  `app-<tool>-<role>` binding, never public.

**Visible today, to fix:**
- `/cont` and `/en/cont` appear in the Psizone, EQ-SYNC and Hemi-Sync sitemaps. The blog's account page is `noindex`.
  The fix is a `noindex` prop on those three Layouts, or `@psi/ui`'s `servedEntries` skipping `private, no-store`
  pages.
- The CMS signs in at `auth.psizone.ro`; `sso.psizone.ro` in `apps/cms/src/env.ts`'s comment is stale wording.

**Proven only against the mock (verify on the first live sign-in):**
- `hashed_user_id` is equal across the four providers.
- Authentik's ID token carries `sid`, and it equals the logout token's `sid`.
- Authentik's end-session fans out back-channel logout to every provider the session used.
- Back-channel is fire-and-forget: a site down at that moment keeps its session until the 8 h idle limit (seen locally).

## 10. Local development and the local showcase

**Localhost is never registered in the estate's Authentik** (owner). Local sign-in is fully local: ONE identity
provider for the whole local estate, `pnpm dev:sso` → `http://localhost:4351`, Authentik's URL layout (issuer of app
`<slug>`: `http://localhost:4351/application/o/<slug>/`), code + PKCE S256, a page to choose a demo person, one browser
session (single sign-on) and back-channel logout (single logout). Loopback-only (127.0.0.1 and ::1), refuses
production, dev fixture only (`packages/account/dev/`). Always `localhost`, never 127.0.0.1, so cookies match.

| App | Client id | Callback | After sign-out |
|---|---|---|---|
| cms | `cms-local` | `http://localhost:4350/api/users/oauth/callback` | `http://localhost:4350/admin` |
| psizone-web, eqsync-web, hemisync-web, blog-web | `<slug>-local` | `http://localhost:43x0/auth/callback` | `http://localhost:43x0/` |

Demo people, all fake (`@psi.test`): Ada Admin (`app-cms-admin`), one editor per brand (`app-cms-editor`), Radu Clinical
Reviewer (`app-cms-reviewer`), Paula Publisher (`app-cms-publisher`), Vlad Visitor (no group).

- **Client secrets:** generated once into `packages/account/.env.sso` (gitignored, mode 600) and kept.
- **Sites:** `dev:sso` writes each site's `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` and
  `OIDC_ALLOW_INSECURE_LOOPBACK` into that site's `.env` block "local sso".
- **CMS:** its `.env` takes `OIDC_ISSUER=http://localhost:4351/application/o/cms/`, `OIDC_CLIENT_ID=cms-local` and
  `OIDC_CLIENT_SECRET` (the value of `CMS_CLIENT_SECRET` in `.env.sso`).
- **Recognition:** a site's account page recognises a person already signed in elsewhere with one silent
  `prompt=none` round trip (at most every 2 minutes).
- **CMS gaps:** the CMS signs in with its own button and keeps its own Payload session. It needs a back-channel logout
  route, and its logout should call the issuer's end-session, before single logout covers it.

```bash
pnpm dev:sso                               # the local identity provider (keep it running; secrets persist)
pnpm --filter @psi/account local:up       # OpenFGA v1.19.0 (pinned by digest) on 127.0.0.1:18080, Postgres 17 on 127.0.0.1:55451,
                                           # psi's model written (fga CLI); each site's "local dev" .env block (mode 600)
pnpm --filter @psi/blog-web dev            # (and the other three; CMS on :4350); restart after its .env block changes
pnpm --filter @psi/account test           # 16 unit tests: sign-in round trip on the mock, remembering guide (CI-safe)
pnpm --filter @psi/account test:live      # 23: OpenFGA, Postgres journey stores, every page allowed/denied (never skip)
pnpm --filter @psi/scheduling exec vitest run src/test/account.test.ts   # 4: own requests on the local Convex
pnpm --filter @psi/account local:down
```

## 11. Tasks

| # | Task | Blocked by |
|---|---|---|
| A1 | `@psi/account`: config, OIDC, sessions, back-channel logout, OpenFGA client, Hono middleware, account panel | — (done) |
| A2 | Blog saved articles end to end, checked through OpenFGA | — (done) |
| A3 | Account page on all four sites, ro/en, Compass link | — (done) |
| A4 | Journey: profile, consents, export, erasure, timeline (§3) | — (done; owner: retention, Authentik user) |
| A5 | Psizone previous reservations, link-with-proof, pre-fill | — (done; prod needs CONVEX_URL + key in gitops) |
| A6 | Guide memory under `guide_memory`, in the account DB (§3 deviation) | — (done; engine delete API optional) |
| A7 | EQ-SYNC programme progress + protocol licences | payments decision |
| A8 | Hemi-Sync session requests + free-exercise gate | — |
| A9 | Push §8: blueprints, ExternalSecrets, Deployments, `account-db` | owner confirms live change |
| A10 | OpenFGA NetworkPolicy for site namespaces | SEB |
| A11 | Polaris deployed; psi's model released; staff roles granted in its console | SEB / estate |
| A12 | Move to SEB's SDK once `.seb-bundle` installs | estate Harbor bundle |
