# docs/

How PSI is put together. Platform documentation lives in SEB; this folder holds what
is particular to this estate (its apps, its decisions).

- **The estate and SEB.** SEB is the platform: provisioning, the cluster and its Argo tree, sign-in,
  Polaris authorization, secrets, the shared design system and translations. This repository holds
  only what is this estate's: its identity (`estate/identity.yaml`), its apps, and the gitops tree
  Argo deploys from. SEB arrives as a versioned bundle (`estate/platform.lock`) built with this
  estate's identity and served from its own Harbor.
- **Who writes what.** Genesis (SEB's `infrastructure/hetzner/scripts/genesis.sh`) owns `gitops/`
  (the platform's render and the root overlay), `pieces/`, `components/` and `estate/openbao/`.
  This repository's own files (package.json, the workspace, Nx, Biome, CLAUDE.md, apps/,
  packages/, tools/) are the estate's. `pnpm new-app` adds an app's own `gitops/services/<app>/`
  and its registration under `gitops/apps/overlays/<env>/apps/`.
- **Branch = environment.** `dev` deploys to the dev cluster. A merge is a deploy.
