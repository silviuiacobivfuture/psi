# RBAC, Roles & Access Matrix — northwind platform

Single source of truth for **who can access what**. Identity + group membership
live in **Authentik** (one place); each app maps a group → its own role (**app
RBAC**). This doc is the contract; the groups are defined as-code in
`blueprints-groups.yaml`, the per-app bindings in each app's config.

> Golden rule: **Authentik knows the person + their groups. The app decides what a
> group can do.** Never duplicate identity; never invent ad-hoc per-app group names.

## 1. Group taxonomy (three prefixes, one purpose each)

| Prefix | Purpose | Bound to apps? | Example |
|--------|---------|----------------|---------|
| `dept-*` | Organisational reality (team membership) | No (org only) | `dept-dev` |
| `app-<app>-<role>` | **Entitlement** — the unit of access | **Yes — the only groups apps bind** | `app-harbor-push` |
| `pending` | Default on self-enrol; zero access | No | `pending` |
| `platform-admins` / `platform-members` | Authentik-admin + break-glass (legacy/superuser) | Yes (transitional) | — |

A person = **their `dept-*` group(s)** + **the `app-*-*` groups their job needs**.
Overlap is just additive membership — someone in `dept-business` *and* `dept-dev`
gets both bundles, no conflict.

## 2. Entitlement groups (defined in blueprints-groups.yaml)

| App | Groups | Maps to (app RBAC) |
|-----|--------|--------------------|
| Argo CD | `app-argocd-admin`, `app-argocd-developer`, `app-argocd-view`, `app-argocd-signin` | Argo `role:admin` / `role:developer` / `role:readonly` / `role:signin` = read applications only (rbac-cm.yaml) |
| Harbor | `app-harbor-admin`, `app-harbor-push`, `app-harbor-pull` | Harbor sysadmin group / project roles |
| OpenBao | `app-openbao-admin`, `app-openbao-developer`, `app-openbao-read`, `app-openbao-signin` | OpenBao policies `admin` / `developer`+`reader` / `reader` / `signin` (a login, NO secret path). Deny-by-default since 2026-10-29: an account in none of these groups (or `platform-*`) cannot log in at all (`gitops/platform/openbao/auth/declaration.json`, reconciled every 10 min) |
| Kubernetes | `app-k8s-admin`, `app-k8s-developer`, `app-k8s-view`, `app-k8s-signin` | ClusterRoleBinding → `cluster-admin` / `developer` (app namespaces) + `view` / `view` / `oidc-signin` = list namespaces only |
| Gate 9 tools robot | `e2e-tools` holds `app-argocd-signin`, `app-k8s-signin`, `app-openbao-signin`, `app-nextcloud-user` and NO Harbor group | The smallest role each tool offers; doctor.sh ("The tools robot holds only its sign-in grants", judges in `tools_robot_grants.py`) fails on any grant beyond these |
| Dashboards | `app-dashboards-view` | Outpost access to hub, netdata |
| lmn-sign | `app-signapp-admin`, `app-signapp-operator`, `app-signapp-hr`, `app-signapp-view` | app's own Convex/CASL roles |
| Plane | `app-plane-admin`, `app-plane-user`, `app-plane-guest`, `app-plane-instance-admin` (+ robots: `app-plane-e2e-member`, `app-plane-e2e-guest`) | Workspace role Admin 20 / Member 15 / Guest 5, highest wins, re-synced every login + 15 min (`apps/plane-sso/mapping.yaml`); `platform-admins` and `app-plane-instance-admin` → Plane instance admin, grant-only. All five are bound at the forward-auth gate; the library tile (application `plane`, no provider) is bound to the three human role groups + `platform-admins`, and the gate itself is hidden from the library |
| Novu | `app-novu-admin`, `app-novu-member` | Signs in at novu.northwind.example through Authentik, straight into the Novu dashboard as Novu `admin` / `member` in every declared organisation (`apps/novu-sso/mapping.json`; highest wins, re-synced each sign-in). Gated by its own forward_single provider `novu` (application = the library tile), + `platform-admins` (admin, break-glass). The tailnet dashboard needs no group (the tailnet is its gate; Novu's own login there) |
| n8n | `app-n8n-admin` | Passes the gate at the host in `pieces/n8n/base/host.env`, by roster, in no department bundle. n8n Community then asks for its own owner sign-in (`docs/n8n/00-plan.md` §5) |
| Clinic console (Programări) | `app-clinic-member` (dev), `app-clinic-prod-member` (production); clients: `app-clinic-customer` (dev), `app-clinic-prod-customer` (production) | The member groups are the only ones bound to the console applications `clinic` / `clinic-prod` (`blueprints-clinic.yaml`, `blueprints-clinic-prod.yaml`); what a member may do there is the scheduling service's own roles, in OpenFGA. The customer groups are bound to NO application: the service's invitation (`AUTHENTIK_CUSTOMERS_GROUP`) makes a client's account there, for the public sites' "Programările mele"; a client never reaches the console |
| Tailnet | `tailnet-users` | Signs a device in to Headscale. What the device then reaches is the estate's headscale component (`config/policy.hujson`), in git, naming people: OIDC groups cannot be used in policy rules |
| Headplane | `app-headplane-admin` | Opens https://headplane.northwind.example/ (the edge gate and the OIDC application both bind it) and is its `admin` role, through the `headplane_role` claim, re-read at each sign-in |
| Plunk | `app-plunk-admin`, `app-plunk-user` (+ robots: `app-plunk-e2e`) | Role per project ADMIN / MEMBER, highest wins, re-synced on every sign-in (`apps/plunk-sso/mapping.json`); `platform-admins` → ADMIN. OWNER is never a person (the service account owns every project). Gated by its own forward_single provider `plunk` (plunk.northwind.example; the API host is ungated), whose application binds all three groups + `platform-admins`. Passing the gate IS the sign-in: no Plunk password exists |

## 2b. One full admin; everyone else is a developer (2026-10-22)

**Full admin of the estate is the operator alone** (business applications: §2c): `silviuiacobivfuture` (silviu.iacob@ivfuture.ro)
holds `platform-admins` (Authentik superuser), the built-in `authentik Admins` group,
and every `app-*-admin` entitlement. `akadmin` (local break-glass) stays in
`authentik Admins`. Both superuser rosters are declared in `blueprints-groups.yaml`,
so a member added by hand is removed on the next reconcile.

The other three accounts are **developers** (`dept-dev`):

| Account | Email |
|---|---|
| `rares-hash` | rares@northwindco.ro |
| `burcustobias` | burcustobias@gmail.com |
| `Cosmin-Madalin` | minutmadalin@gmail.com |

A developer has, on top of every `*-view` / `*-read` entitlement:

| App | Entitlement | What it allows | What it does NOT |
|---|---|---|---|
| OpenBao | `app-openbao-developer` → policy `developer` | read, create, update, patch and delete app secrets under `secret/apps/*` | read or write ANY platform secret (Hetzner, Harbor admin, Cloudflare, GitHub token, object storage, Authentik — each one is a way back to full admin), destroy secret history, policies, auth methods |
| Kubernetes | `app-k8s-developer` → `developer-rbac.yaml` | view the whole cluster (no Secrets); in the app namespaces: logs, exec, port-forward, restart, scale, delete pods, run Jobs | anything beyond view in openbao, authentik, argocd, kube-system and the other platform namespaces |
| Argo CD | `app-argocd-developer` → `role:developer` | view, sync, restart, logs | create/edit/delete applications, exec, repos, clusters, projects |

Harbor, Nextcloud, Plane and lmn-sign entitlements are unchanged by this.

The basic OpenBao role every authenticated login receives (`reader`) is limited to app
secrets as well (2026-10-22); platform secrets are admin-only.

**Why all four admin paths moved together.** Each of Authentik superuser,
Kubernetes admin and Argo CD admin can reach every secret without OpenBao (re-grant
a group; read a Secret or exec into OpenBao; deploy a pod that does). Demoting one
and leaving the others is not a demotion.

**The bypass that is NOT closed here: pushing to `dev`.** Argo deploys whatever
lands in `gitops/` on `dev`, as cluster-admin. Anyone who can push to `dev` can
deploy a pod that reads any secret. Closing it needs branch protection on `dev`
with a required review from the operator for `gitops/` and `infrastructure/`
(CODEOWNERS), which is a GitHub setting, not a file here.

The enrolment whitelist (`blueprints-enrollment.yaml`) maps the developers' addresses
to `onboard-developer` and grants no domain anything; it can never grant a superuser
group (`NEVER_GRANTED`), and its tests prove it
(`infrastructure/hetzner/scripts/tests/enrollment-whitelist.test.sh`).

## 2c. Two business super admins (owner, 2026-11-05)

`rares-hash` and `burcustobias` hold the top role of every BUSINESS application, and
stay developers on the infrastructure. The owner's words: "full access to everything
in the northwindper.ro estate (all the apps on authentik, full super admin on all of
them, but not on k8s, and the others)".

| Top role in the directory | Group |
|---|---|
| Plane instance admin + workspace Admin | `app-plane-instance-admin`, `app-plane-admin` |
| Novu admin | `app-novu-admin` |
| Plunk ADMIN in every project | `app-plunk-admin` |
| n8n (member: the highest Community offers below the owner, who is `ops@northwind.example` and never a person) | `app-n8n-admin` |
| Nextcloud admin (`NC_ADMINS`, `occ-reconcile.yaml`) | `app-nextcloud-user` |
| Keel, Quill, Polaris entry | `app-invoice-admin`, `app-signapp-admin`, `app-autorizare-admin` |

What they may do in Orchid, Quill, Brook, Keel, Nova and Polaris is tuples, not
groups: `apps/autorizare-svc/scripts/apply/examples/<estate>.org.json` and the grants
it records. Keel's fiscal rights are one company at a time, on purpose.

**Not theirs, and `.github/scripts/estate-superadmins.py` refuses the tree otherwise:**
`platform-admins`, `authentik Admins`, `bundle-platform`, `app-argocd-admin`,
`app-k8s-admin`, `app-openbao-admin`, `app-headplane-admin`, `tailnet-users`. Each of
the first six is a way to full admin of the estate (§2b). `app-harbor-admin` is held
by every developer since before this section and is left as it was.

## 3. Access matrix (department → entitlements)

Onboarding = put the person in their `dept-*` group **and** the `app-*-*` groups in
their row.

| Department | Argo | Harbor | OpenBao | k8s | Dashboards | lmn-sign | Plane | PDFCraft | Novu | Plunk |
|------------|------|--------|---------|-----|-----------|----------|-------|----------|------|---|
| **dept-platform** | `app-argocd-admin` | `app-harbor-admin` | `app-openbao-admin` | `app-k8s-admin` | `app-dashboards-view` | `app-signapp-admin` | `app-plane-admin` | `app-pdfcraft-user` | `app-novu-admin` | `app-plunk-admin` |
| **dept-dev** | `app-argocd-developer` | `app-harbor-push` | `app-openbao-developer` | `app-k8s-developer` | `app-dashboards-view` | `app-signapp-operator` | `app-plane-user` | `app-pdfcraft-user` | — | — |
| **dept-business** | — | — | — | — | `app-dashboards-view` | `app-signapp-operator` | `app-plane-user` | `app-pdfcraft-user` | — | — |
| **dept-hr** | — | — | — | — | — | `app-signapp-hr` | — | — | — | — |
| **pending** | — | — | — | — | — | — | — | — | — | — |

Plane: since 2026-10-28 the Authentik groups decide the Plane ROLE too (apps/plane-sso).
A department grants `app-plane-user` (Member) by default — `app-plane-admin` for
dept-platform. The four people using Plane on day one are all in `app-plane-admin`
(they were all workspace Admins), declared by roster in `blueprints-groups.yaml`.
Leaving every Plane group deactivates the membership (never deletes anything).

PDFCraft (pdf.<apex>) has no accounts of its own: `app-pdfcraft-user` is checked at
the edge by its own forward_single proxy provider (`blueprints-providers.yaml`).

Novu (novu.northwind.example) is an administration tool: `app-novu-admin` (Novu admin) and
`app-novu-member` (Novu member) are declared by roster (the one full admin, the two
business super admins of §2c, and the `e2e-hub` robot that proves the sign-in), granted
by no department bundle. Passing
the gate IS the sign-in: `apps/novu-sso` creates the person's password-less Novu
account, seats them in every declared organisation with the highest mapped role
(`apps/novu-sso/mapping.json`, re-synced on every sign-in) and hands the dashboard
Novu's own session. Novu's own login, registration and reset are closed on that
host; they remain only on the tailnet dashboard, as break-glass, where
`novu-bootstrap.sh`'s account signs in with its password.

`dept-platform` members are additionally in `platform-admins` (Authentik admin +
break-glass). No lmn-sign business-layer subdivision yet (single operator/hr/admin/view).

## 4. Identity sources (the "doorbell")

All feed the same Authentik identity + groups:
- **Google Workspace** (primary, company `@domain`) — to be wired.
- **GitHub** (allowed) — current.
- **Native users** (collaborators without a company email) — created by admin.

**MFA**: enforced via the Authentik auth flow (TOTP/WebAuthn). Admin can make it
mandatory; users may also enrol a factor anytime.

**Self-enrolment**: a new user (any source) lands in `pending` (zero access) and is
asked "which team / why" (stored on the user). An admin reviews in Authentik
(Directory → Users, filter `pending`) and assigns the proper `dept-*` + `app-*-*`
groups per the matrix above — or a **role bundle** (below) for one click.

## Role bundles (one-click onboarding)

Instead of adding a person to 4–5 `app-*-*` groups, assign **one** `bundle-*` group.
The `northwind-groups-scope` expression (blueprints-providers.yaml) detects bundle
membership and **expands** it into the bundle's entitlement group names in the OIDC
`groups` claim — so apps grant the mapped roles without the person being in each
`app-*-*` group individually.

| Bundle | Expands to | Use for |
|--------|-----------|---------|
| `bundle-platform` | argocd-admin, harbor-admin, openbao-admin, k8s-admin, dashboards-view | ops / platform engineers |
| `bundle-developer` | argocd-view, harbor-push, openbao-read, k8s-view, dashboards-view | developers |
| `bundle-viewer` | dashboards-view | read-only / stakeholders |

Onboard = drop the person in their `dept-*` group + **one** `bundle-*`. Need a custom
mix? Add individual `app-*-*` groups instead (bundles and raw entitlements compose —
all are unioned in the claim). lmn-sign (`app-signapp-*`) is **excluded** from bundles
(not behind Authentik).

> ⚠ The bundle→entitlement map lives in TWO places that must stay in sync: the
> `bundle-*` group definitions in `blueprints-groups.yaml` AND the `BUNDLES` dict in
> the `northwind-groups-scope` expression in `blueprints-providers.yaml`.

## 5. Convention: adding a NEW app to the ecosystem

Every new app follows the SAME pattern — no freelancing:

1. **Define entitlement groups** `app-<name>-<role>` in `blueprints-groups.yaml`
   (e.g. `app-foo-admin`, `app-foo-view`).
2. **Wire the Authentik provider** for the app (OIDC `oauth2provider` if it speaks
   OIDC, else a `proxyprovider` bound to the embedded outpost) in
   `blueprints-providers.yaml` — copy an existing block; set `signing_key` +
   `grant_types` (the 2026.5 requirement) for OIDC.
3. **Bind groups → app roles in the APP's own config** (the app RBAC), referencing
   ONLY the `app-<name>-*` groups.
4. **Add a column + rows** to the matrix in §3 here.
5. If the app stores its auth config outside git (DB), add a declarative reconciler
   (ESO secret + CronJob), mirroring `pieces/platform-secrets/harbor-oidc*`.

That's it. The taxonomy + this checklist keep every app consistent and auditable.
