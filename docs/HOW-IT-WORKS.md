# How psi works with SEB (the shared infrastructure)

Two repos, two jobs:

| Repo | Owns | You change it when |
|------|------|--------------------|
| **SEB** — github.com/silviuiacobivfuture/seb (`~/Documents/projects/seb/platform`) | the platform: cluster provisioning (genesis), Argo, sign-in (Authentik + hub), Polaris, secrets (OpenBao), Harbor, observability, Headscale, the shared UI and i18n libraries | the platform itself must change (a fix or feature every estate gets) |
| **psi** — this repo | psi's apps, packages, tools, and psi's inputs to SEB (`estate/`) | you build or change psi's own things |

psi never copies SEB code. It pins a SEB release in `estate/platform.lock`; the release's
bundle supplies the platform pieces and libraries.

## Everyday: build an app

1. `apps/<name>/` — `package.json` (`@psi/<name>`), `tsconfig.json` extending
   `../../tsconfig.base.json`, `src/`, tests next to the code.
2. `pnpm install`, then `pnpm exec nx run @psi/<name>:build` / `:test`.
3. Before pushing: `pnpm affected` (lint, type-check, test, build for what changed).
4. To deploy it: add a `Dockerfile` and its Argo registration under `gitops/` — the estate's
   CI builds the image into psi's Harbor and Argo deploys it (wired once psi is provisioned).

## The estate itself (one-time, then rarely)

- `estate/identity.yaml` — psi's name, domain, registry, mail region… (no secrets).
- Keys live OUTSIDE git, in the credentials file (`~/Documents/projects/seb/credentials/.credentials`).
- Provision / re-converge: from the SEB checkout,
  `infrastructure/hetzner/scripts/genesis.sh dev --identity ~/Documents/projects/psi/estate/identity.yaml --env-file ~/Documents/projects/seb/credentials/.credentials --dry-run`
  then the same without `--dry-run` (it applies only after you type `apply`).
- Upgrade the platform: bump `estate/platform.lock` to a newer SEB release with SEB's
  `estate/seb-upgrade.sh <version> --from-release v<version>`.

## Rules of thumb

- Platform bug or missing feature → fix it in SEB, release, upgrade psi. Not here.
- psi-only behaviour → here.
- Existing DNS records in psizone.ro (apex, www, clinic, files, jelly, radarr, sonarr, mail, MX,
  mail TXT) are yours and are never touched by the estate.
