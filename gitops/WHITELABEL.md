# Whitelabel / Rebrand Guide — `gitops/`

The estate's brand and coordinates — apex domain, ops e-mail, buckets, object storage,
registry, Git host, tailnet, host prefixes, SES region — have ONE source: the estate
identity file, **`estate/identity.yaml`** (schema `schema/identity.schema.json`,
read only through `tools/identity/load.mjs`). `gitops/` never reads it directly: it
reads a GENERATED kustomize ConfigMap made from it. Literals not yet wired to it are the
**still manual** list in section 2.

> **Safety invariant.** Argo syncs this repo directly (it runs kustomize), so a change
> to the identity is a change to every overlay below at the next sync. Re-render and
> diff before pushing a rebrand.

---

## 1. Config-driven (the identity → the whitelabel ConfigMap → kustomize `replacements`)

### The source
`estate/identity.yaml` — flat `KEY: value` lines, validated against the schema on every
read. The loader refuses a missing or invalid value, an unknown key, and anything shaped
like a secret (`node tools/identity/load.mjs validate estate/identity.yaml`).

### The generated ConfigMap
`gitops/components/whitelabel/whitelabel-config.yaml` — a `local-config` ConfigMap
(`config.kubernetes.io/local-config: "true"`, so it is **never rendered into output**,
only used as a replacement source). It carries every identity key plus the values derived
from them (`GIT_SSH_URL`, `AUTHENTIK_HOST`). **Never edit it by hand**: the `seb-identity`
gate refuses a copy that differs from what the identity renders.

### To rebrand
1. Edit `estate/identity.yaml` (e.g. `BASE_DOMAIN`, `OPS_EMAIL`, `BUCKET_PREFIX`).
2. Regenerate the ConfigMap and check it:
   ```bash
   node tools/identity/load.mjs configmap estate/identity.yaml \
     > gitops/components/whitelabel/whitelabel-config.yaml
   node tools/identity/load.mjs check-configmap estate/identity.yaml \
     gitops/components/whitelabel/whitelabel-config.yaml
   ```
3. Re-render every overlay below and diff it (section 4), then run
   `.github/scripts/tests/seb-identity_test.sh` — it refuses a render that still carries a
   placeholder.
4. The lifecycle scripts read the same file (`infrastructure/hetzner/scripts/identity-tf.sh`
   for OpenTofu, `lib-estate-git.sh` for the Git host), so infrastructure follows the same edit.

### How an overlay is wired
Each consuming kustomization:
1. references the component — `components: [<relative path>/components/whitelabel]`;
2. writes a dot-free placeholder token where the value goes (`WLDOMAIN`, `WLMESH`,
   `WLTAILNET`, `WLOPSEMAIL`, `WLBUCKET`, e.g. `quill.WLDOMAIN`);
3. has a `replacements:` block that copies `data.<KEY>` of the ConfigMap into that token
   (`options: { delimiter: ".", index: … }` for a host part). A host inside a longer URL is
   composed in a local-config ConfigMap of the overlay first (e.g.
   `services/novu/overlays/dev/hosts.yaml`) and then put in whole.

### The overlays that read it (derived from `gitops/**/kustomization.yaml`, 2026-11-11)
Re-derive with `grep -rl components/whitelabel gitops --include=kustomization.yaml`.

| Kustomization | Keys it reads |
|---|---|
| `apps/base` | `DNS_ZONE` `ESTATE_SLUG` `GIT_SSH_URL` |
| `apps/overlays/dev` (through `apps/base`'s component) | `BASE_DOMAIN` `BUCKET_PREFIX` `ESTATE_SLUG` `GIT_HOST` `GIT_OWNER` `GIT_REPO` `REGISTRY_HOST` |
| `platform/argocd` | `GIT_SSH_URL` |
| `../pieces/cert-manager` (a SEB piece) | `ACME_EMAIL` |
| `pieces/db-backup` | `BUCKET_PREFIX` `OBJECT_STORAGE_ENDPOINT` `OBJECT_STORAGE_REGION` `OPS_EMAIL` |
| `pieces/health-digest` | `AUTHENTIK_HOST` `BASE_DOMAIN` `GIT_OWNER` `GIT_REPO` `OPS_EMAIL` |
| `platform/kyverno` | `OPS_EMAIL` `REGISTRY_HOST` |
| `pieces/platform-secrets` | `AUTHENTIK_HOST` `OPS_EMAIL` |
| `platform/system-upgrade-controller` | `AUTHENTIK_HOST` `BUCKET_PREFIX` `OBJECT_STORAGE_ENDPOINT` `OBJECT_STORAGE_REGION` |
| `services/autorizare/overlays/dev` | `BASE_DOMAIN` |
| `services/estate-front/overlays/dev` | `BASE_DOMAIN` |
| `../pieces/n8n` (a SEB piece) | `BASE_DOMAIN` `AUTHENTIK_HOST_PREFIX` `BRAND_TITLE` `BUCKET_PREFIX` `ESTATE_LABEL_DOMAIN` `OPS_EMAIL` `REGISTRY_HOST` |
| `../pieces/nextcloud-platform` (a SEB piece) | `BASE_DOMAIN` `BUCKET_PREFIX` `OPS_EMAIL` |
| `services/novu/overlays/dev` | `AUTHENTIK_HOST_PREFIX` `BASE_DOMAIN` `BUCKET_PREFIX` `MESH_BASE_DOMAIN` `OBJECT_STORAGE_ENDPOINT` `OBJECT_STORAGE_REGION` `OPS_EMAIL` `TAILNET_DOMAIN` |
| `pieces/pdfcraft` (SEB piece) | `BASE_DOMAIN` `OPS_EMAIL` `ESTATE_SLUG` `ESTATE_LABEL_DOMAIN` |
| `../pieces/plane` (a SEB piece) | `BASE_DOMAIN` `OPS_EMAIL` |
| `../pieces/plane-platform` (a SEB piece) | `BASE_DOMAIN` `BUCKET_PREFIX` `OPS_EMAIL` `REGISTRY_HOST` |
| `services/plunk/overlays/dev` | `BASE_DOMAIN` `BUCKET_PREFIX` `OBJECT_STORAGE_ENDPOINT` `OBJECT_STORAGE_REGION` `OPS_EMAIL` |
| `pieces/reference` (moved into SEB) | `BASE_DOMAIN` `REGISTRY_HOST` |
| `../pieces/reportportal-platform` (a SEB piece) | `BASE_DOMAIN` `BUCKET_PREFIX` `OPS_EMAIL` |
| `pieces/talk-hpb` (moved into SEB) | `BASE_DOMAIN` `OPS_EMAIL` `REGISTRY_HOST` |
| `../pieces/test-reports` (a SEB piece) | `BASE_DOMAIN` `OPS_EMAIL` |
| the business applications' overlays under `services/` and `services/convex/overlays/` (11 of them, the estate's own) | `BASE_DOMAIN` |

Authentik's platform manifests (`platform/authentik`, not its `apps/` part) read AUTHENTIK_HOST,
BASE_DOMAIN, BRAND_TITLE, ESTATE_SLUG, OPS_EMAIL and TAILNET_DOMAIN. Outside blueprint text the
placeholders are filled by `platform/authentik/identity/fields.yaml`. A blueprint is one multi-line
string, so each blueprint line carrying a placeholder is rebuilt whole and put back at its line
index by `identity/replacements.yaml`, GENERATED by `identity/lines.mjs` — regenerate after editing
any blueprint; `.github/scripts/tests/seb-authentik-identity_test.sh` refuses a stale copy, a
placeholder left in the render, and a render that moved.

---

## 2. Still manual (run these `sed`s to rebrand)

These literals were **deliberately left hardcoded** — parameterizing them via
kustomize replacements would either (a) change rendered bytes (breaking the no-op
invariant), or (b) break a kustomize matcher / Argo's own read of the manifest.
Reason per group is given. Run from the repo root.

> Set your new values first:
> ```bash
> OLD_DOMAIN=northwind.example     NEW_DOMAIN=acme.io
> OLD_ORG=NorthwindCo       NEW_ORG=AcmeCorp        # GitHub org (CamelCase, repo URLs/ARC)
> OLD_ORGSLUG=northwind       NEW_ORGSLUG=acme        # lowercase Harbor project slug
> OLD_TAILNET=tail0north    NEW_TAILNET=tailXXXXXX  # Tailscale tailnet id
> OLD_BUCKET=lmn            NEW_BUCKET=acme         # bucket prefix (lmn-tfstate, lmn-business)
> OLD_REGION=fsn1           NEW_REGION=hel1         # Hetzner S3 region (only if relocating)
> ```

### 2a. Harbor registry refs + ESO docker-auth — `harbor.${DOMAIN}/${ORGSLUG}/…`
**Config-driven on the SEB side (SEB 2.6).** SEB-side manifests write the registry as
`WLREGISTRY` (REGISTRY_HOST) and the apps project as `WLAPPS` (REGISTRY_PROJECT_APPS):
`image: WLREGISTRY/mirror/…`, `images: - name: WLREGISTRY/WLAPPS/<app>`, and the
`"auths":{"WLREGISTRY":…}` pull secret. Each kustomization that renders them lists
`replacements: [{path: whitelabel-replacements.yaml}]`, a file GENERATED from its render:
`python3 tools/whitelabel/replacements.py write <dir>` (re-run after adding a token;
`.github/scripts/tests/seb-registry_test.sh` refuses a render that still holds one).
The Argo Applications in `apps/overlays/dev` carry their estate values (registry, apex hosts,
TLS secret names, buckets, the GitHub owner) as Helm `parameters`, not inside the `values: |`
text, and the same generated `whitelabel-replacements.yaml` fills them; `seb-identity` compares
an Application by the values Helm is given (the identity gate's Helm-parameter comparison).
Still literal, and why: what is left inside those `values: |` texts — a host inside a longer
string (Nextcloud's PHP config, Collabora's alias URL, Headlamp's extra Ingress, Homepage's
allowed-hosts list), annotation KEYS (`alerts.<apex>/owner`) and Authentik's asset mount paths,
which must equal the literal paths in `platform/authentik`; files the
lifecycle scripts and tests read as text to find an image (n8n, headscale, plunk's
`plunk.yaml`/`sso.yaml`, harbor-route, the node `registries/`); strings in a
`configMapGenerator` (the hash suffix would move); the business apps (not SEB's); the CI
workflows' `docker login` lines and `.github/actions/setup-buildx` (held equal to the
identity by `buildkit-image_test.sh`).

**Why manual (the remaining literals):** the image host appears in the overlay `images:` *name matcher*
(must equal the deployment's image ref string), in base `image:` lines, in the ESO
`dockerconfigjson` JSON blob, and in `Dockerfile` `FROM`. A replacement on the
host would desync the `images:` matcher and rewrite a JSON string mid-template —
both change bytes / break matching.
```bash
grep -rl "harbor.$OLD_DOMAIN" gitops/ | xargs sed -i "s/harbor\.$OLD_DOMAIN/harbor.$NEW_DOMAIN/g"
# org slug inside image paths (harbor.<domain>/<slug>/<image>):
grep -rl "harbor.$NEW_DOMAIN/$OLD_ORGSLUG/" gitops/ | xargs sed -i "s#/$OLD_ORGSLUG/#/$NEW_ORGSLUG/#g"
```
(Files: lmn-sign, lmn-brs, browse-api, browseruse-webui, changelog
— each `base/deployment.yaml|daemonset.yaml`, `harbor-pull-externalsecret.yaml`,
the overlay `images:` block; plus
`apps/overlays/dev/harbor.yaml`, `homepage.yaml`, `platform/authentik/*`. The SEB piece
`pieces/otel-logging` needs none of this: its registry and its Axiom dataset names
(ESTATE_SLUG, token WLSLUG) come from the identity; its image takes `--build-arg REGISTRY_HOST`.)

### 2b. GitHub org — `NorthwindCo` (Argo `repoURL`, ARC, secrets)
**Why manual:** `repoURL: git@github.com:silviuiacobivfuture/psi.git` is read by
**Argo itself** (not just kustomize) to locate the source repo, and the
`platform.northwind.example/source` label is a kustomize `labelSelector` patch target —
rewriting it via replacement would break selector matching. Bootstrap root apps
and ARC org config are outside any overlay that could host a replacement.
```bash
grep -rl "$OLD_ORG" gitops/ | xargs sed -i "s/$OLD_ORG/$NEW_ORG/g"
```
(27 files: all `apps/overlays/*/*.yaml` Application specs, `apps/base/*`,
`bootstrap/root-*.yaml`, `BRANCHING.md`, `PLATFORM.md`.)

### 2c. Label/annotation domain — `platform.northwind.example`, `*.northwind.example` in platform/
**Why manual:** these live in `platform/` (no overlay/replacement layer — applied
as raw manifests) and in kustomize `labelSelector` patch *targets*. Covered by the
domain sed below (it is a strict superset of `platform.northwind.example`).
```bash
grep -rl "$OLD_DOMAIN" gitops/platform gitops/apps gitops/bootstrap | xargs sed -i "s/$OLD_DOMAIN/$NEW_DOMAIN/g"
```
> This also catches authentik blueprints, argocd sso-cm, rbac OIDC bindings,
> cert-manager issuers, external-dns, the openbao auth declaration, system-upgrade plan, and
> the platform ingress hosts — none of which are under a service overlay.

### 2d. Tailscale tailnet — `tail0north.ts.net`
**Why manual:** tailnet dashboard hosts are spread across `platform/` raw manifests
and two `apps/overlays/dev` Application inline values; no shared overlay to host a
replacement, and several are inside annotation strings.
```bash
grep -rl "$OLD_TAILNET" gitops/ | xargs sed -i "s/$OLD_TAILNET/$NEW_TAILNET/g"
```
(11 files: `apps/overlays/dev/headlamp.yaml`, `homepage.yaml`;
`platform/argocd/ingress.yaml`, `sso-cm.yaml`; `platform/authentik/*`;
`platform/openbao/ingress-tailscale.yaml`, `auth/declaration.json`;
`pieces/platform-secrets/authentik-github-oauth.yaml`; `services/changelog/base/ingress.yaml`.)

### 2e. S3 buckets — `lmn-tfstate`, `lmn-business`
**Why manual:** `lmn-tfstate` is in Velero/openbao-snapshot/etcd-backup specs in
`platform/`+`apps/overlays` (no overlay layer); `lmn-business-<env>` is in the
lmn-sign base deployment env + business-s3 ExternalSecret, where the value is
`lmn-business-dev`/`-prod` (env suffix differs per branch — a static replacement
can't reproduce both byte-identically without per-overlay wiring not worth the risk).
```bash
grep -rl "$OLD_BUCKET-tfstate"  gitops/ | xargs sed -i "s/$OLD_BUCKET-tfstate/$NEW_BUCKET-tfstate/g"
grep -rl "$OLD_BUCKET-business" gitops/ | xargs sed -i "s/$OLD_BUCKET-business/$NEW_BUCKET-business/g"
```
(tfstate: `apps/overlays/dev/velero.yaml`, `platform/openbao/snapshot-cronjob.yaml`,
`platform/system-upgrade-controller/etcd-s3-plan.yaml`. business: `services/lmn-sign/base/deployment.yaml`,
`business-s3-externalsecret.yaml`.)

### 2f. Hetzner S3 region/endpoint — `fsn1`, `your-objectstorage.com`
**Why manual:** these are env-*invariant* infra coordinates (region + endpoint
host), not brand strings. Only change them if you relocate object storage. The
endpoint host `your-objectstorage.com` is a Hetzner constant — usually leave it.
```bash
# Only if relocating region:
grep -rl "$OLD_REGION" gitops/ | xargs sed -i "s/$OLD_REGION/$NEW_REGION/g"
```
(4 files: `apps/overlays/dev/velero.yaml`, `platform/openbao/snapshot-cronjob.yaml`,
`platform/system-upgrade-controller/etcd-s3-plan.yaml`, `services/lmn-sign/base/deployment.yaml`.)

---

## 3. Coverage summary

| Literal | Files (HEAD) | Status | Mechanism |
|---|---:|---|---|
| identity keys (domain, ops e-mail, buckets, storage, registry, Git, tailnet, host prefixes) | 32 kustomizations | **config-driven** | `estate/identity.yaml` → generated `whitelabel` ConfigMap → `replacements` |
| `northwind.example` (platform/, apps/overlays, harbor host, labels, ingress) | ~57 remaining | manual | sed 2a / 2c |
| `NorthwindCo` (org) | 27 | manual | sed 2b — Argo reads `repoURL` directly |
| `tail0north` (tailnet) | 11 | manual | sed 2d |
| `harbor.northwind.example/northwind` (registry + slug) | 23 | manual | sed 2a — tied to `images:` matcher + ESO blob |
| `lmn-tfstate` / `lmn-business` (buckets) | 3 / 2 | manual | sed 2e |
| `fsn1` / `your-objectstorage` (region/endpoint) | 4 / 4 | manual (infra, optional) | sed 2f |

**Net:** the 32 kustomizations in section 1 follow `estate/identity.yaml`; everything
else is a documented one-shot sed. The split
is honest — anything that would break the byte-identical invariant or a kustomize/
Argo matcher was left manual on purpose.

## 4. After any rebrand — verify before push
```bash
for d in $(find gitops -name kustomization.yaml -exec dirname {} \;); do
  kubectl kustomize "$d" >/dev/null && echo "OK   $d" || echo "FAIL $d"
done
```
Then `git diff` the rendered output you care about and confirm only the intended
brand strings changed.
