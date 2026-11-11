# Trusting Authentik OIDC at the k3s API server — design & implications

**Status:** design / proposal. **Nothing here is applied.** This document explains what it
means to configure the k3s **API server** to trust **Authentik** as an OIDC identity provider,
so that **Headlamp** *and* `kubectl` authenticate **humans** (by their Authentik identity +
groups) instead of sharing a static ServiceAccount token. It also gives the concrete
as-code plan and the rollback.

Audience: the platform owner — assumed comfortable with the platform but **not** a deep
Kubernetes expert. Read sections 1–3 for the "what and why"; sections 6–8 are the
implementation.

---

## 0. TL;DR (executive summary)

- **What:** add four flags to the k3s API server (`--oidc-issuer-url`, `--oidc-client-id`,
  `--oidc-username-claim`, `--oidc-groups-claim`). After that, the API server will accept
  Authentik-signed id_tokens as **cluster credentials** and map the token's `groups` claim
  to Kubernetes RBAC.
- **Why:** every human runs `kubectl` (and opens Headlamp) **as themselves**, with their
  group's permissions, fully through Authentik SSO — no shared admin kubeconfig, no static
  ServiceAccount token, no inner token-paste screen in Headlamp.
- **Cost of the trust:** the API server now **trusts Authentik to mint cluster identities**.
  Authentik's own security (MFA, admin accounts, JWT signing key) becomes **cluster-critical**.
- **Safety:** OIDC is **additive**. The k3s local admin kubeconfig on the node and existing
  ServiceAccount tokens **remain as break-glass** and are never removed.
- **Recommendation:** **yes, do it** — it's the industry-standard way to give a team
  `kubectl` SSO and a real audit trail. For this repo it composes cleanly with the Authentik
  setup that already exists (groups claim, headlamp provider, deny-by-default group→role
  RBAC). See §8.

---

## 1. The mental model (plain language)

Today the API server only knows two kinds of caller:

1. **ServiceAccounts** — tokens minted by the cluster for in-cluster workloads (this is what
   Headlamp uses today: it mounts a `cluster-admin` ServiceAccount token).
2. **The k3s local admin** — the `/etc/rancher/k3s/k3s.yaml` kubeconfig on the control-plane
   node, plus whatever copy of it you use for remote `kubectl` (gated by the tailnet + the
   `admin_cidr` firewall on port 6443). This is effectively a **shared root credential**.

There is **no concept of "a human"** in that picture. Everyone who can `kubectl` is, in
practice, the same omnipotent admin, and Headlamp is a single `cluster-admin` ServiceAccount
behind a network gate.

**OIDC adds a third kind of caller: a named human.** Authentik (already the platform IdP)
issues a signed token that says *"this is `alice@northwind.example`, in groups
`[platform-admins]`"*. We tell the API server: *"trust tokens signed by Authentik; the
`email` field is the username, the `groups` field is the groups."* The API server then runs
its normal RBAC: it looks for `ClusterRoleBinding`s that bind those groups to roles. No
binding → **denied** (deny-by-default — the same model already used for Argo CD in
`gitops/platform/argocd/rbac-cm.yaml`).

```
Human ─login→ AUTHENTIK ─signed id_token {email, groups[]}→ k3s API server
                (IdP)         (the cluster credential)         ├─ verifies signature against Authentik's JWKS
                                                               ├─ username = email claim
                                                               ├─ groups   = groups claim
                                                               └─ RBAC: groups → ClusterRole(s), else DENY
```

This is exactly the federation pattern the platform already documents in
`gitops/platform/authentik/IDENTITY.md` ("one identity, every app trusts it") — we are
extending that trust to the **Kubernetes API itself**, which is the one place it doesn't
reach yet.

---

## 2. What actually changes on the API server

k3s runs an embedded `kube-apiserver`. We add these flags (passed via
`--kube-apiserver-arg=` on the **server** install line — see §6 for the exact file):

| Flag | Value (this platform) | Meaning |
|------|-----------------------|---------|
| `--oidc-issuer-url` | `https://auth.northwind.example/application/o/headlamp/` | The Authentik provider's issuer. The API server fetches `…/.well-known/openid-configuration` + JWKS from here to verify token signatures. |
| `--oidc-client-id` | the headlamp provider's `client_id` (env `AUTHENTIK_OIDC__HEADLAMP__ID`) | The audience (`aud`) the token must be issued for. The API server rejects tokens minted for a different client. |
| `--oidc-username-claim` | `email` | Which claim becomes the k8s username. The headlamp provider uses `sub_mode: user_email`, and we request the `email` scope, so `email` is the stable human identifier. |
| `--oidc-groups-claim` | `groups` | Which claim becomes the k8s groups. Authentik emits this via the `northwind-groups-scope` scope mapping (`blueprints-providers.yaml`), which returns the user's Authentik group **names** (`platform-admins`, `platform-members`). |
| `--oidc-username-prefix` | *(recommended)* `oidc:` | Namespaces OIDC usernames so an OIDC `email` can never collide with a built-in/system username. If set, RBAC subjects become `oidc:alice@northwind.example`. Optional but good hygiene. |
| `--oidc-ca-file` | **not needed** | Only required when the issuer's TLS cert is privately signed. `auth.northwind.example` serves a **public Let's Encrypt** cert (per `IDENTITY.md` §8), so the API server's default trust store already validates it. **Omit this flag.** |

> **Single API server, single client_id.** A k3s server can be given **one** OIDC issuer +
> client. We reuse the **existing `headlamp` provider** as that single client (it already has
> the groups scope, a confidential client, refresh tokens, and the
> `…/oidc-callback` redirect registered). `kubectl`/kubelogin and Headlamp both authenticate
> against this one provider. (If you later want a dedicated `kubectl` provider you'd add a
> second Authentik application and point kubelogin at it, but the API server still trusts only
> the one `client_id` it was configured with — keep it simple and share `headlamp`.)

**Important nuance about the signing key.** Token **signature** verification uses the
provider's JWT **`signing_key`** — in the blueprint that's the
`"authentik Self-signed Certificate"` keypair (`blueprints-providers.yaml`, headlamp provider).
This is **separate** from the public TLS cert on `auth.northwind.example`. The API server pulls
that signing public key from Authentik's JWKS endpoint automatically; you do **not** put it in
a flag. The consequence: **whoever controls that Authentik signing key can forge cluster
identities** — see §3.

After these flags are live, the API server accepts an Authentik id_token presented as a
bearer token exactly like any other credential, then hands off to RBAC.

---

## 3. Security implications — spelled out

This is the part to read twice. OIDC is powerful and convenient, and the trade-off is real.

### 3.1 You are extending the cluster's trust boundary to Authentik

Before: to get cluster access you needed the node's admin kubeconfig (network-gated) or an
in-cluster ServiceAccount token. After: **anyone Authentik will mint a token for, with the
right group, gets cluster access.** Concretely, the cluster now trusts:

- **Authentik's user store and group memberships.** Adding a user to `platform-admins` in
  Authentik now grants cluster-admin (if you bind that group to cluster-admin — §5). Group
  membership is the keys to the kingdom; treat the "who can edit groups in Authentik"
  permission as a cluster-admin-equivalent power.
- **Authentik's JWT signing key** (the `signing_key` keypair). Anyone who can extract or
  re-issue with that key can forge a token claiming `groups: [platform-admins]` and become
  cluster-admin. Protect it like a cluster root key: it lives in Authentik's database/secret
  store; back it up; rotate it on suspicion of compromise (rotating it invalidates issued
  tokens — acceptable, they're short-lived).
- **Authentik's login flows / federation sources.** Today login can come via GitHub
  federation or password. The strength of cluster access is now **the strength of the weakest
  enabled login path**. If a GitHub account in the `platform-admins`-mapped path is phished
  and MFA isn't enforced, that's a path to cluster-admin.

### 3.2 Blast radius

- A leaked **id_token** is bad but **time-boxed**: id_tokens are short-lived (minutes). The
  refresh token (held by kubelogin in the user's keychain) is the longer-lived secret — it
  lets the holder mint new id_tokens until revoked. Revocation = remove the user / rotate
  client secret / disable the application in Authentik.
- A leaked **ServiceAccount token** (today's Headlamp model) is worse: it's long-lived and
  unattributed. Part of the *point* of this change is to **shrink** that exposure by removing
  the always-mounted `cluster-admin` SA from the human-facing path (§4).
- An **over-scoped group binding** is the classic footgun: if you bind `platform-members` to
  `cluster-admin` "for now", every member is root. Bindings are the real authorization — keep
  them least-privilege and deny-by-default (§5).

### 3.3 Why deny-by-default + least-privilege bindings matter

The API server grants **nothing** to an OIDC user until a `ClusterRoleBinding` (or
`RoleBinding`) names their group. So the security posture is entirely in the bindings you
write:

- Bind `platform-admins` → a powerful role (cluster-admin or a scoped admin).
- Bind `platform-members` → **read-only** (`view`).
- Everyone else (authenticated by Authentik but in no mapped group) → **denied** with no
  binding at all. This mirrors `policy.default: ""` in the Argo RBAC ConfigMap.

This is the single most important control: **the flags decide *who can present an identity*;
the bindings decide *what that identity can do*.** Get the bindings right.

### 3.4 Token lifetime, refresh, audit

- **Lifetime:** id_tokens are short — the API server re-checks expiry on every call.
  kubelogin transparently refreshes via the refresh token, so the human isn't re-prompted
  constantly but also isn't holding a forever-token.
- **Audit:** *this is a major upside.* Today the API audit log (when enabled) sees
  "system:serviceaccount:headlamp:headlamp" or the shared admin for **every** human action —
  useless for "who deleted that". With OIDC, the audit log records the real `email`. Note the
  dev profile currently sets `enable_audit = false` (`environments/dev/main.tf`, Axiom
  module); turning on the apiserver audit log is the natural companion to this change if you
  want per-human accountability in logs.

---

## 4. How this interacts with Headlamp

### 4.1 Today

Headlamp runs **in-cluster** (`config.inCluster: true`) with a chart-created ServiceAccount
bound to **`cluster-admin`** (`gitops/apps/overlays/dev/headlamp.yaml`). The UI talks to the
API as that SA. Human identity is enforced **only in front of the UI** by the Authentik
**embedded-outpost proxy** (`headlamp-proxy` proxy provider +
`ingress-proxied-apps.yaml`). After logout you see Headlamp's own token screen, because the
UI itself has no idea who you are — it just uses the SA.

So today there are effectively **two** things in front of Headlamp: the Authentik proxy gate
(identity, at the edge) and the SA `cluster-admin` (authorization, undifferentiated).

### 4.2 With API-server OIDC: native OIDC on Headlamp

Once the API server trusts Authentik, Headlamp can use its **native OIDC** mode instead of
the in-cluster SA. The Headlamp chart exposes `config.oidc.*`:

| Headlamp setting | Value |
|------------------|-------|
| `config.oidc.clientID` | the headlamp `client_id` |
| `config.oidc.clientSecret` | the headlamp `client_secret` (from OpenBao via ESO; **not** in git) |
| `config.oidc.issuerURL` | `https://auth.northwind.example/application/o/headlamp/` |
| `config.oidc.scopes` | `openid email profile groups` (the `groups` scope is what carries RBAC) |

In this mode the login/logout flow runs **fully through Authentik**, and **the user's own
OIDC token becomes the cluster token** Headlamp presents to the API server. Result:

- **No ServiceAccount** in the human path — drop `serviceAccount.create` / the
  `cluster-admin` `clusterRoleBinding` from the Headlamp values. (Headlamp itself may still
  need a tiny SA for its own pod, but **not** one bound to cluster-admin acting as every
  user.)
- **No inner token-paste screen** after logout — Headlamp re-initiates the OIDC dance.
- **Headlamp shows each user only what their groups' RBAC permits** — a `platform-members`
  user sees a read-only cluster, automatically, because the *API server* enforces it.

### 4.3 The recommended single, clean model

You now have a choice for the headlamp host. **Pick one** — running both the outpost proxy
*and* native OIDC is redundant and confusing:

> **Recommendation: native OIDC on Headlamp; drop the Authentik outpost proxy for Headlamp.**

Rationale: with API-server OIDC, **identity is enforced at the API server itself** (the
strongest possible place — Headlamp can't act beyond the logged-in user's RBAC even if the
UI is reached). The outpost proxy was a *necessary* gate precisely because the old SA model
had no per-user enforcement; that reason disappears. Keeping the proxy *and* native OIDC means
two logins / double redirect handling and two places to maintain the redirect URI. So:

- Switch Headlamp to native OIDC (§4.2).
- Remove the `headlamp-proxy` proxy provider + the `headlamp` entries in
  `ingress-proxied-apps.yaml`, and serve Headlamp via a plain tailnet ingress again (the
  tailnet network gate stays — it's defense-in-depth, orthogonal to identity).
- Keep the **`headlamp` OIDC application** (we're now using it for *real*, both for the UI and
  the API server). The already-registered redirect `https://headlamp.tail0north.ts.net/oidc-callback`
  is exactly what native-OIDC Headlamp needs — no Authentik change required for the UI.

Net: **one** login (Authentik), enforced at the API server, surfaced through Headlamp; the
tailnet remains a network pre-gate.

---

## 5. RBAC mapping (deny-by-default group → role)

The flags make the API server *recognize* groups; **bindings** grant power. Create a new,
Argo-synced manifest, e.g. `pieces/platform-rbac/oidc-clusterrolebindings.yaml`:

```yaml
# Authentik group -> k8s RBAC. Deny-by-default: a group with no binding gets nothing.
# Subjects are the Authentik group NAMES carried in the `groups` claim
# (northwind-groups-scope). If --oidc-username-prefix/--oidc-groups-prefix is set on the
# apiserver, prefix the subject names here to match (e.g. "oidc:platform-admins").
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: oidc-platform-admins
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: cluster-admin          # or a scoped admin role if you want less than root
subjects:
  - apiGroup: rbac.authorization.k8s.io
    kind: Group
    name: platform-admins      # Authentik group name from the `groups` claim
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: oidc-platform-members
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: view                   # built-in read-only ClusterRole, all namespaces
subjects:
  - apiGroup: rbac.authorization.k8s.io
    kind: Group
    name: platform-members
```

Notes:
- **No `platform-admins` → cluster-admin "for everyone" shortcuts beyond admins.** Members
  get `view` (read-only). This is the cluster analogue of the Argo `g, platform-members,
  role:readonly` line — same groups, same intent, applied at the cluster.
- If you set `--oidc-groups-prefix=oidc:` on the API server, the `name:` values here must be
  `oidc:platform-admins` etc. (Decide once; keep flags and bindings consistent.)
- Wire this manifest into the platform overlay so Argo syncs it like the rest of
  `gitops/platform/...`. It is pure RBAC — safe to apply independently and **before** the
  apiserver flags (bindings with no matching identity are inert).

---

## 6. Concrete as-code plan

### 6.1 Where the apiserver flags go (the exact mechanism in THIS repo)

k3s is installed by **cloud-init runcmd** generated in
**`infrastructure/hetzner/modules/k3s/main.tf`**. The control-plane install line is the
`server` entry in `local.server_runcmd` (around L54–56):

```hcl
server_runcmd = concat(local.ufw_k3s, local.detect_net, [
  "curl -sfL https://get.k3s.io | K3S_TOKEN=${var.k3s_token} INSTALL_K3S_EXEC=\"server --node-ip $PRIVATE_IP --advertise-address $PRIVATE_IP --flannel-iface $IFACE --tls-san $PUBLIC_IP --write-kubeconfig-mode 600${local.ccm_server_flags}\" sh -",
])
```

k3s passes flags through to the embedded apiserver with **`--kube-apiserver-arg=<flag>=<val>`**
on this `server` line. The change is to append the OIDC args. Following the existing pattern
(`ccm_server_flags` is a string concatenated into the exec line), add an analogous local and
splice it in:

```hcl
# In locals { } — keep the issuer/client_id out of the static string; thread them as vars.
oidc_server_flags = var.enable_oidc ? join(" ", [
  "--kube-apiserver-arg=oidc-issuer-url=${var.oidc_issuer_url}",
  "--kube-apiserver-arg=oidc-client-id=${var.oidc_client_id}",
  "--kube-apiserver-arg=oidc-username-claim=email",
  "--kube-apiserver-arg=oidc-groups-claim=groups",
  "--kube-apiserver-arg=oidc-username-prefix=oidc:",   # optional, recommended
]) : ""
# ...and add `${local.oidc_server_flags}` into the server INSTALL_K3S_EXEC string,
# right next to ${local.ccm_server_flags}, with a leading space.
```

Add the inputs the repo way — a `var.enable_oidc` (bool, default false), `var.oidc_issuer_url`,
`var.oidc_client_id` in **`modules/k3s/variables.tf`**, passed from
**`environments/dev/main.tf`** (the `module "cluster"` block), and fed from
`infrastructure/hetzner/.env` via `TF_VAR_*` per the infra "single config surface" rule (the
`client_id` is **not** secret — it's a public OIDC client id — but keep it in `.env` with the
other config, not hard-coded in `.tf`). The issuer URL is a public constant.

> **Why a string splice and not `config.yaml`:** this repo installs k3s entirely through the
> `INSTALL_K3S_EXEC` env in cloud-init (no `/etc/rancher/k3s/config.yaml` is written). Stay
> consistent with that — adding the flags to the exec string is the in-repo mechanism. (k3s
> would also accept the same flags in `config.yaml`, but introducing a second config surface
> would violate the "single surface" discipline in `infrastructure/hetzner/CLAUDE.md`.)

### 6.2 The RBAC manifest

Add `pieces/platform-rbac/oidc-clusterrolebindings.yaml` (§5) and wire it into the platform
overlay/kustomization so Argo CD syncs it.

### 6.3 Headlamp native OIDC

Edit `gitops/apps/overlays/dev/headlamp.yaml`: add `config.oidc.*` (§4.2), drop the
`cluster-admin` `clusterRoleBinding`/SA from the human path, and remove the `headlamp-proxy`
proxy entries from `gitops/platform/authentik/ingress-proxied-apps.yaml` (replacing with a
tailnet ingress). The `headlamp` Authentik application + its `…/oidc-callback` redirect are
**already** in `blueprints-providers.yaml` — no IdP change needed for the UI.

### 6.4 Order of operations (low-risk sequencing)

1. **RBAC bindings first** (Argo sync). Inert until identities exist — zero risk.
2. **Apply the apiserver flags on the LIVE node** — the node config.yaml +
   `systemctl restart k3s`, NOT tofu alone. The flags are baked into cloud-init
   `user_data`, but `modules/k3s` sets `lifecycle ignore_changes=[user_data]` on the
   control-plane server, so flipping `enable_oidc=true` and `tofu apply` does **NOT**
   reconfigure or restart the running node — it only changes what a from-scratch
   rebuild would bake in. The live path is the dated APPLY-ORDER runbook in
   `infrastructure/hetzner/RUNBOOK.md` (2026-06-18, step 2): pre-flight the issuer,
   back up `/etc/rancher/k3s/config.yaml`, write the `kube-apiserver-arg` OIDC block,
   `systemctl restart k3s`, verify `/healthz`+nodes, rollback on failure — then
   `tofu apply` `enable_oidc=true` so a rebuild reproduces it (see §7 / §9 risk).
3. **kubelogin / kubeconfig** for humans (§7) — verify a `platform-admins` user can
   `kubectl get nodes` as themselves and a `platform-members` user is read-only.
4. **Headlamp native OIDC** (§6.3) last, once the API server is verified to accept Authentik
   tokens.

---

## 7. `kubectl` SSO for humans (kubelogin)

Goal: a developer runs `kubectl` **as themselves**, getting their group's RBAC, instead of
copying the shared admin kubeconfig.

1. Install the plugin: `kubectl oidc-login` (a.k.a. **kubelogin**, `int128/kubelogin`) — e.g.
   `brew install int128/kubelogin/kubelogin` or `kubectl krew install oidc-login`.
2. A **per-user kubeconfig** (no embedded secret token) defines an `exec` credential plugin:

```yaml
# ~/.kube/config (user context) — no static token; kubelogin fetches an OIDC token on demand.
users:
  - name: oidc
    user:
      exec:
        apiVersion: client.authentication.k8s.io/v1beta1
        command: kubectl
        args:
          - oidc-login
          - get-token
          - --oidc-issuer-url=https://auth.northwind.example/application/o/headlamp/
          - --oidc-client-id=<headlamp client_id>
          - --oidc-client-secret=<headlamp client_secret>   # confidential client
          - --oidc-extra-scope=email
          - --oidc-extra-scope=groups
clusters:
  - name: northwind-dev
    cluster:
      server: https://<control-plane>:6443   # reachable over tailnet / admin_cidr
      # certificate-authority-data: <k3s server CA>   (copy from the admin kubeconfig)
contexts:
  - name: northwind-dev
    context: { cluster: northwind-dev, user: oidc }
```

3. First `kubectl` call opens the browser → Authentik login → token cached locally; kubelogin
   refreshes it silently afterwards. The user's `email` is their k8s username, their Authentik
   groups drive RBAC. **The shared admin kubeconfig is no longer needed for day-to-day work**
   — keep it only as break-glass (§9).

Network reminder: the API on `6443` is still firewalled to `admin_cidr` and reached over the
tailnet (`modules/k3s/main.tf` `hcloud_firewall.api`). OIDC is *identity*; the tailnet/firewall
remain the *network* gate. Both apply.

---

## 8. Recommendation

**For a small team, yes — wire API-server OIDC.** It is the industry-standard way to do
`kubectl` SSO and is precisely how enterprises give engineers cluster access without handing
out the root kubeconfig. For this platform specifically it's a small delta because the hard
parts already exist: an Authentik IdP with a public LE issuer, a `groups` claim
(`northwind-groups-scope`), a `headlamp` OIDC client, and a deny-by-default group→role pattern
proven on Argo CD. You are extending that exact pattern to the API server.

**The trade-off vs. keeping the SA-token + outpost-proxy Headlamp:** the status quo is simpler
to reason about (one network gate, one shared admin) and has fewer moving parts, but it gives
**zero per-human authorization or audit** — every human is effectively root and the audit log
can't tell them apart. The moment there's more than one person, or you want least-privilege
(read-only members) and "who did that" accountability, OIDC is the right call. The main new
responsibility you take on is **treating Authentik as cluster-critical** (MFA on admins,
protect the signing key, least-privilege bindings) — which you already should, since Authentik
already fronts Argo/Harbor/OpenBao.

**If you only ever have one admin and never need read-only or audit,** the cost/benefit is
thinner — keep the SA model and revisit when you add the second person.

---

## 9. Break-glass & availability (do not skip)

OIDC is **additive**, never a replacement. Two failure modes to plan for:

- **Authentik is down / misconfigured** → OIDC login fails → `kubectl` (and Headlamp native
  OIDC) can't authenticate. **Break-glass remains:**
  - The k3s **local admin kubeconfig** on the control-plane node:
    `/etc/rancher/k3s/k3s.yaml` (mode `600`, per the install's `--write-kubeconfig-mode 600`).
    SSH to the node (tailnet + `admin_cidr`) and use it directly. This does **not** depend on
    Authentik at all.
  - Existing **ServiceAccount tokens** continue to work for in-cluster workloads.
- **Bad RBAC binding locks people out** → fix the binding via the local admin kubeconfig (it's
  cluster-admin by definition) and let Argo reconcile.

**Hard rule:** never remove the local admin kubeconfig path or assume Authentik is always
reachable. The OIDC flags only *add* an accepted credential type; they don't disable the
existing ones.

### Rollback

1. **Remove the apiserver OIDC flags on the LIVE node:** restore the
   `/etc/rancher/k3s/config.yaml.bak` backup (or remove the `kube-apiserver-arg`
   OIDC block from `/etc/rancher/k3s/config.yaml`, or delete the file if it only
   held these) → `sudo systemctl restart k3s`. The API server stops trusting
   Authentik tokens immediately. ServiceAccount + local admin auth are unaffected.
   Also set `enable_oidc = false` in `modules/k3s` → `tofu plan` → human `apply` so
   a rebuild reproduces the OIDC-off state — but note `tofu apply` does **not**
   touch the running node (`lifecycle ignore_changes=[user_data]`); the live revert
   is the config.yaml + restart above. (Full runbook: `RUNBOOK.md` 2026-06-18.)
2. **Revert Headlamp** to in-cluster SA (`git revert` the `headlamp.yaml` change; restore the
   `headlamp-proxy` entries if you want the outpost gate back).
3. **Remove the RBAC bindings** (`pieces/platform-rbac/oidc-clusterrolebindings.yaml`) — Argo
   prunes them.

> **Risk callout — the live change is a node restart, NOT `tofu apply`.** The k3s
> install args are baked into cloud-init `user_data`, but `modules/k3s` sets
> `lifecycle ignore_changes=[user_data]` on the control-plane server — so flipping
> `enable_oidc=true` and `tofu apply` does **NOT** re-run the install, restart k3s,
> or replace the node. It only changes what a from-scratch rebuild would bake in.
> To take effect on the EXISTING node you must apply the flags live: write
> `/etc/rancher/k3s/config.yaml` (k3s merges it into the apiserver args) and
> `sudo systemctl restart k3s` — the sanctioned "stopgap manual change" pattern,
> with the durable form already codified in tofu. That restart is a **brief
> control-plane / API-server blip**; **workloads keep running** (kubelets cache
> state). Do it in a **maintenance window** with the break-glass node kubeconfig in
> hand **before** you start (full step-by-step incl. issuer pre-flight, config
> backup, post-restart verify, and rollback: `infrastructure/hetzner/RUNBOOK.md`
> 2026-06-18, step 2). Agents do not run `apply` or the restart — a human does
> (`infrastructure/hetzner/CLAUDE.md`).

---

## 10. File-change checklist (summary)

| File | Change |
|------|--------|
| `infrastructure/hetzner/modules/k3s/main.tf` | Add `local.oidc_server_flags`; splice into the `server` `INSTALL_K3S_EXEC`. |
| `infrastructure/hetzner/modules/k3s/variables.tf` | Add `enable_oidc` (bool), `oidc_issuer_url`, `oidc_client_id`. |
| `infrastructure/hetzner/environments/dev/main.tf` | Pass the new inputs into `module "cluster"`. |
| `infrastructure/hetzner/.env(.example)` | Add `TF_VAR_oidc_*` keys (config-as-code; client_id is public, not a secret). |
| `pieces/platform-rbac/oidc-clusterrolebindings.yaml` *(new)* | `platform-admins`→cluster-admin, `platform-members`→`view`, deny-by-default. |
| `gitops/apps/overlays/dev/headlamp.yaml` | Switch to `config.oidc.*`; drop the human-path `cluster-admin` SA binding. |
| `gitops/platform/authentik/ingress-proxied-apps.yaml` | Remove `headlamp-proxy` entries; serve Headlamp via tailnet ingress. |
| *(no change)* `gitops/platform/authentik/blueprints-providers.yaml` | The `headlamp` provider + `…/oidc-callback` redirect already exist and are reused. |
