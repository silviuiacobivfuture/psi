# Branching & Environment Model

The repository uses a **branch-as-environment** model. Each long-lived branch is
bound to one Hetzner project / k3s cluster; the cluster's Argo CD watches *only*
that branch. Everything that deploys is a function of the branch it lives on.

## The cycle

```
main ──▶ dev ──▶ [feature branch] ──▶ prod ──▶ main ──▶ … (repeat)
 │        │             │                 │         │
 no env   dev cluster   preview in the    prod      back to the
 (trunk)  (auto-sync)   PR's base env     cluster   stable trunk
```

| Branch          | Environment            | Long-lived | Argo reconciles? |
|-----------------|------------------------|:----------:|:----------------:|
| `main`          | **none** (stable trunk)| yes        | **never**        |
| `dev`           | dev cluster            | yes        | yes — push to `dev`  |
| `prod`          | prod cluster           | yes        | yes — push to `prod` |
| any feature br. | the env it **targets** | no         | preview only     |

- **`main`** is pure version control: the canonical, stable history. No cluster
  watches it, so a push to `main` deploys nothing. It is the start of a cycle
  (you branch `dev` from it) and the end (prod folds back into it).
- **`dev` / `prod`** are the only environment branches. Separate clusters in
  separate Hetzner projects → a `dev` push *cannot* reach prod. Isolation is
  structural, not a rule.
- **Feature branches** (any name) get an **ephemeral preview** in the environment
  of the branch they **open a PR against** — base `dev` → dev preview, base `prod`
  → prod preview. The environment is the **PR base branch**, not a name prefix.

> A feature branch can NOT be named `dev/*` or `prod/*`: git stores `refs/heads/dev`
> as a file, so it cannot also be a directory `refs/heads/dev/...`. The long-lived
> env branches occupy those ref paths. Name feature branches anything else
> (`add-x`, `fix/y`, `feat-z`); the env comes from the PR target, never the name.

## How "env = branch" is wired

Each cluster's root app-of-apps (`gitops/bootstrap/root-<env>.yaml`) is applied
by hand once and pins `targetRevision` to its branch (`dev` / `prod`). Every
child Application we own carries the label `platform.northwind.example/source: git` and
**omits** `targetRevision`; the overlay (`gitops/apps/overlays/<env>`) stamps the
branch onto all labelled apps with a single kustomize patch:

```yaml
patches:
  - target: { kind: Application, labelSelector: platform.northwind.example/source=git }
    patch: |
      - op: add
        path: /spec/source/targetRevision
        value: dev          # prod overlay → prod
```

The branch pointer therefore lives in **one line per overlay**. Promotion merges
carry only real changes (image tags, manifests) and **never conflict** on the
branch pointer. Helm-sourced apps (whose `targetRevision` is a *chart version* —
harbor, ARC, OpenBao, external-secrets, hetzner-ccm) are deliberately untouched.

## Preview environments

`gitops/apps/overlays/<env>/previews.yaml` holds an Argo `ApplicationSet` with a
GitHub **PullRequest generator** filtered on the PR's **base branch**:

- base `dev`  → preview on the **dev** cluster
- base `prod` → preview on the **prod** cluster

Each open PR gets its own `preview-pr-<n>` namespace and host
(`changelog-pr-<n>.dev.northwind.example`), built from the PR's head commit, and is
destroyed when the PR closes. A token (`github-pr-creds`) is synced from OpenBao
(`secret/github` key `token`) by an ExternalSecret — no token in git. Store it:

```bash
bao kv put secret/github token=<github-PAT-with-repo-read>
```

> A service is preview-enabled by being referenced in `previews.yaml`. Prod
> previews need the service to have an `overlays/prod` (created when it is first
> promoted to prod).

## Promotion (how code moves)

| Step              | Action                                  | Effect                    |
|-------------------|-----------------------------------------|---------------------------|
| start work        | branch `<topic>` off `dev`              | —                         |
| land to dev       | PR `<topic>` → `dev`                     | preview env, then deploys to dev cluster |
| promote to prod   | PR `dev` (or a feature) → `prod`        | deploys to prod cluster   |
| fold back         | PR `prod` → `main`                      | trunk = released state    |
| hotfix            | branch `<fix>` off `prod`, PR → `prod`  | preview, then prod        |

Promotion is a normal PR — review + approval gate + audit trail.

## Enforcement

- **`.github/workflows/branch-policy.yml`** (runs on every PR):
  1. cycle-legal merges into long-lived branches, enforced on the PR **base**
     branch: `main ← prod`, `dev ← anything-but-prod`, `prod ← anything-but-main`;
  2. no Argo manifest may set `targetRevision: main`.
- **`infrastructure/hetzner/scripts/branch-protection.sh`** — PR-required, no
  force-push, no deletion, `policy` check required, on `main`/`dev`/`prod`.

## Infrastructure (OpenTofu) follows the same branches

Cluster *substrate* is still provisioned with OpenTofu (run locally — no CI yet),
and aligns to the branch you are on: `git checkout dev` → `tofu apply` against
`infrastructure/hetzner/environments/dev`; `git checkout prod` →
`environments/prod`. GitOps (Argo) covers everything *inside* the cluster.

## Activation checklist (one-time)

1. Land this strategy on `main`.
2. Create the env branches: `git branch dev main && git branch prod main && git push origin dev prod`.
3. `bao kv put secret/github token=<PAT>` (preview generator token).
4. Re-apply each cluster's root app (`gitops/bootstrap/root-dev.yaml` now tracks
   `dev`); the dev cluster begins reconciling from `dev`.
5. `REPO=silviuiacobivfuture/psi infrastructure/hetzner/scripts/branch-protection.sh`.
6. prod: provision its cluster (`tofu apply environments/prod`), apply
   `root-prod.yaml`. Until then the prod wiring is dormant.
