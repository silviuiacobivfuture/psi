# Authentik / RBAC — agent rules (read before touching identity or access)

Authoritative design: **`ROLES.md`** (taxonomy + access matrix) in this directory.
This file is the enforcement layer — follow it exactly; do not freelance.

## Hard rules

1. **One identity source of truth = Authentik.** Apps never store their own user
   lists. They map an Authentik **group → role** in their OWN config (app RBAC).
2. **Group naming is fixed (see ROLES.md §1):**
   - `dept-*` — org membership, NOT bound to apps.
   - `app-<app>-<role>` — entitlements; the **only** groups apps may bind.
   - `pending` — default on self-enrol, zero access.
   - `platform-admins` / `platform-members` — Authentik-admin + break-glass; keep.
   NEVER invent a new ad-hoc group name. New app → add `app-<name>-<role>` groups
   to `blueprints-groups.yaml`, nothing else.
3. **Every OIDC provider MUST set `signing_key` + `grant_types`** (Authentik 2026.5
   ships them empty → authorize fails `invalid_request: malformed`). See
   `blueprints-providers.yaml`.
4. **Break-glass is sacred.** Never remove local admin / root / SA-token fallbacks
   (Argo local admin, Harbor admin, OpenBao root/kubernetes/approle, k3s node
   kubeconfig). OIDC/SSO is always ADDITIVE.
5. **Don't lock yourself out.** Before switching an app's binding from
   `platform-admins` to `app-*-*` groups, first ensure the operator is a member of
   the new group. Migrate additively, verify access, then tighten.
6. **As-code only.** Live changes are mirrored into blueprints/gitops. DB/runtime
   config that can't be declarative (Harbor, OpenBao) gets a reconciler
   (ESO + CronJob) or a committed idempotent script.

## Adding a new app (the only sanctioned flow) — full steps in ROLES.md §5
groups → provider (signing_key+grant_types / proxy) → bind groups in app RBAC →
update the ROLES.md matrix → reconciler if config is DB-stored.
A `forward_single` proxy provider also needs its host's callback Ingress
(`/outpost.goauthentik.io/callback`, Exact, chain
`authentik-sso-restart@kubernetescrd,authentik-authentik-forwardauth@kubernetescrd`)
so a refused sign-in restarts instead of a blank 400 — `sso-restart.yaml`;
`.github/scripts/sso-restart.sh` refuses the tree without it.

## Apps & where their group→role mapping lives
- Argo CD → `gitops/platform/argocd/rbac-cm.yaml`
- Harbor → Harbor DB (reconciled by `pieces/platform-secrets/harbor-oidc-reconcile.yaml`)
- OpenBao → external groups → policies (`gitops/platform/openbao/auth/declaration.json`, reconciled by the `openbao-auth-reconcile` CronJob)
- Kubernetes → ClusterRoleBindings (see `HEADLAMP_K8S_OIDC.md`)
- Plunk → `apps/plunk-sso/mapping.json` (applied on every sign-in by plunk-sso)
- Novu → `apps/novu-sso/mapping.json` (applied on every sign-in by novu-sso)
- n8n → `apps/n8n-sso/mapping.json` (passing the gate is the only mapping: one group, `app-n8n-admin`; n8n-sso keeps the accounts equal to it). One group per further instance: `gitops/services/n8n-instances/instances.json`
- Tailnet dashboards (hub/netdata/…) → embedded-outpost proxy providers + per-app policy bindings
