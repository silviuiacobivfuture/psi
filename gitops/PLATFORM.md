# NorthwindCo Platform — Internal Developer Platform (IDP) Plan

The target: a tech team ships services through a **golden path** — scaffold → push
→ preview env → staging → prod — without touching infra. Cluster state = git.

Status: dev k3s cluster live (2× cx53 @ hel1), Argo CD + continuous GitOps,
ingress + auto-TLS. This doc is the plan for the full platform on top.

## Everything as code (HARD PRINCIPLE)

The ONLY manual action allowed is the irreducible **L0 bootstrap** that has no
API: in the Hetzner Console, create the project, an API token, and Object Storage
S3 credentials (one-time, per project — dev + prod done 2026-06-15). Put them in
`.env`. **Nothing else is ever configured by hand** — not servers, networks,
firewalls, volumes, load balancers, floating IPs, DNS, secrets, or cluster
state. Tofu provisions cloud; Argo+Kustomize/Helm provision cluster; LBs come
from k8s Service annotations (via CCM); DNS from external-dns. The one tolerated
exception is a genuine chicken-and-egg (e.g. the dev `*.dev` wildcard exists
because the lean dev profile has no CCM to source a public IP — documented, and
goes away under the prod profile / CCM).

## Environment profiles / typologies (the "template" pattern)

Everything is driven by a **profile** (env typology), not hand-tuned per cluster:
- **Tofu**: `environments/<env>` + module flags (`enable_ccm`, `expose_web`,
  node sizes, backups). dev = lean profile; prod = full profile (CCM, LB, HA).
- **GitOps**: `gitops/apps/base` (shared) + `overlays/{dev,prod}` (Kustomize).
  Prod-only components (Hetzner CCM, …) live in the prod overlay. The cluster's
  root app-of-apps (`gitops/bootstrap/root-<profile>.yaml`) points at its
  overlay → only that profile's components deploy.
- Add a new prod-only capability = drop it in `overlays/prod`. New typology =
  add `overlays/<name>` + a node profile in tofu. No manual divergence.

## Decisions (locked 2026-06-16)

| Area | Decision |
|------|----------|
| Environments | **One cluster, namespace per env**: `dev`, `staging`, `prod`, `pr-<N>`; **separate clusters per typology** (dev cluster lean, prod cluster full) |
| Profiles | tofu module flags + Kustomize overlays drive dev vs prod; **Hetzner CCM = prod profile only** (free; node IPs + LoadBalancers) |
| Manifests (ours) | **Kustomize** — base + overlays per env |
| Manifests (3rd-party) | **Helm** — cert-manager, prometheus, harbor, ESO, ARC, CNPG, etc. |
| Secrets | **External Secrets Operator → secrets backend** (HTTP API) |
| CI runners | **ARC** (Actions Runner Controller) — runner pods on the cluster |
| Registry | **Harbor** self-hosted (`harbor.northwind.example`) — scanning + RBAC + cache |
| Observability | **Axiom** (logs/events) + Grafana for metric dashboards |
| Databases | **CloudNativePG** in-cluster OR external (Neon/Supabase) — per service. INSTALLED since the Nextcloud rollout (`pieces/cnpg/values.yaml`); first cluster is `nextcloud-db` (WAL-archived to Hetzner Object Storage + a 6-hourly logical dump). The older in-cluster DBs (authentik, harbor) remain chart-bundled Bitnami StatefulSets — migrating them to CNPG is a separate change. |
| CD | **Argo CD** + **ApplicationSet** (preview envs) |
| DNS | **external-dns** (Cloudflare) — auto records from Ingress |
| Admin access | **Tailscale** — IP-independent (kills the dynamic-IP firewall chase) |
| k8s UI | **Headlamp** (CNCF, modern, RBAC-aware, plugins) — full cluster mgmt UI; Rancher if we want heavyweight multi-cluster later |
| Admin UI exposure | All admin UIs (Headlamp, Harbor, Argo, Grafana) → **tailnet-only** via the Tailscale operator (Ingress class `tailscale` / Service annotation). ZERO public admin surface; only real apps face the internet. |
| Backups | **Velero** → Hetzner object storage bucket |
| Policy | **Kyverno** (resource limits, security) — later |

## Observability — logging (implemented, as code)

Chapter 1 (logs) is built: OTel Collector → **Axiom** (EU), per-typology datasets
`northwind-<env>-{node,k8s-events,containers,network}` (+ `audit` in prod). Datasets
are Tofu-managed (`infrastructure/hetzner/modules/axiom`); the collector is GitOps
(`pieces/otel-logging` + `traefik-accesslog`). Covers infra→node→pod→
container→process with k8s + journald metadata for filtering. See the infra RUNBOOK
(2026-06-17) for the go-live steps. Still to come: metrics/traces (OTLP into Axiom
+ Grafana dashboards), app/UI logs, and `axiom_monitor` alerts (hardening).

## The golden path (target dev experience)

```
write code → push branch / open PR
  → ARC runner: build + test + lint, build image → Harbor (:pr-N)
  → ApplicationSet spawns preview env in namespace pr-N → https://pr-N.dev.northwind.example
merge to main
  → image :main-<sha> → Argo syncs `dev` namespace
  → promote → `staging` (auto) → `prod` (approval gate)
auto per service: TLS, DNS, secrets-from-secrets-backend, logs→Axiom, dashboard
rollback = git revert
```

## Repo / GitOps structure (target)

```
gitops/
  applications/            # Argo Applications + ApplicationSets (app-of-apps)
  platform/                # cluster services (Helm values + Kustomize)
    cert-manager/  ingress/  external-secrets/  harbor/  arc/
    cloudnative-pg/  external-dns/  tailscale/  velero/
  services/<svc>/          # OUR services (Kustomize)
    base/                  # Deployment, Service, Ingress, ExternalSecret
    overlays/{dev,staging,prod}/
  env/{dev,staging,prod}/  # per-namespace ApplicationSets pointing at services/*
```

Naming: namespace per env; image `harbor.northwind.example/northwind/<svc>:<tag>`;
host `<svc>.dev.northwind.example` / `.staging` / production `<svc>.northwind.example`;
preview `pr-<N>.dev.northwind.example`.

## Phased rollout (one at a time)

- **P0 Foundations**: Tailscale (admin access) · external-dns (auto DNS).
- **P1 Secrets+Registry+CI operators**: External Secrets Operator (wire to the
  secrets backend) · Harbor · ARC + a runner scale-set.
- **P2 GitOps structure**: Kustomize base/overlays convention · env ApplicationSets
  · Argo image promotion (CI writes tag, or Argo Image Updater).
- **P3 Reference service**: a small `platform-reference` health API exercising the
  FULL path (ARC build → Harbor → Kustomize → GitOps → dev ns → TLS → secret
  → Axiom logs). Becomes the template for all services.
- **P4 Preview envs**: ApplicationSet PR-generator → ephemeral `pr-N` namespaces.
- **P5 Promotion + staging/prod**: staging auto-sync, prod approval gate.
- **P6 Self-service**: Nx generator `nx g service` emits Dockerfile + Kustomize +
  CI workflow from the reference template.
- **P7 Hardening**: CloudNativePG · Velero backups · Kyverno policies · resource
  quotas per namespace · Grafana dashboards/alerts.

## Open inputs needed (gathered per phase)
- Secrets backend: URL, auth method, secret API shape (for ESO provider config).
- Harbor: storage size (Hetzner volume), admin creds → secrets backend.
- ARC: scoped GitHub token/app for runner registration (have a PAT pattern).
- Tailscale: account + an auth key.

> Argo's own config (SSO/RBAC) stays SCRIPT-managed (argocd-sso.sh), NOT
> GitOps-synced — self-managing auth = lockout risk.

## Bootstrap ordering (OpenBao + ESO must come up early)

Day-2 secrets live in OpenBao (`secret/platform/*`) and reach the cluster as ESO
ExternalSecrets in `pieces/platform-secrets/` (Argo app `platform-secrets`):

| Secret (k8s)              | Namespace      | OpenBao path / keys                              | Consumer                         |
|---------------------------|----------------|--------------------------------------------------|----------------------------------|
| `cloudflare-api-token`    | cert-manager   | `platform/cloudflare/token` {api_token→token}    | ClusterIssuers DNS-01            |
| `cloudflare-api-token`    | external-dns   | `platform/cloudflare/token` {api_token→token}    | external-dns Helm                |
| `operator-oauth`          | tailscale      | `platform/tailscale/oauth` {client_id,client_secret} | tailscale-operator Helm      |
| `harbor-admin`            | harbor         | `platform/harbor/admin` {password→secret}        | harbor Helm (existingSecret…)    |
| `hcloud`                  | kube-system    | `platform/hcloud` {token}                        | hcloud-csi (block storage)       |
| (argocd-secret, script)   | argocd         | `platform/argocd/github-oauth` {client_id,secret}| argocd-sso.sh (NOT ESO/gitops)   |

**Ordering hazard on a FRESH cluster:** cert-manager, external-dns and the
tailscale-operator are P0/base-layer apps that come up before OpenBao + ESO
(dev-overlay apps). Until OpenBao is up *and unsealed* and the ESO
`ClusterSecretStore` exists, the platform ExternalSecrets sit in `SecretSyncError`
and the consumers cannot get their secrets. To minimise the window, OpenBao + ESO
+ the store carry early Argo sync-waves:

- `openbao` → `sync-wave: "-5"`, `external-secrets` → `"-5"`, `openbao-store` → `"-4"`
  (consumers/ExternalSecrets default to wave `0`).

> Sync-waves order *reconciliation*, not readiness — OpenBao still needs its
> **one-time manual init/unseal** (`scripts/openbao-init.sh`) before any secret can
> sync. Fresh-bootstrap sequence: bring up Argo → OpenBao reconciles (wave -5) →
> init + unseal it by hand → ESO + store reconcile → `bao kv put secret/platform/*`
> the day-2 secrets (see `infrastructure/hetzner/.env.example`) → `platform-secrets`
> ExternalSecrets self-heal and the base-layer consumers pick up their secrets.
