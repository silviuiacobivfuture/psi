# psi — estate monorepo

The psi estate's own code: its apps, packages and tools. The PLATFORM (cluster, sign-in,
Polaris authorization, secrets, Argo, observability) comes from SEB
(github.com/silviuiacobivfuture/seb) as a versioned bundle, pinned in `estate/platform.lock`.
The bundle's built libraries are listed in SEB's `tools/bundle/libs.json`; SEB's design system
and translations are not among them yet. Platform code is never copied here; platform changes go to SEB.

## Layout

| Path | What lives there |
|------|------------------|
| `apps/<name>/` | one folder per app (landing pages, services, consoles) |
| `packages/<name>/` | psi's own shared code |
| `tools/<name>/` | psi's own CLIs and scripts |
| `estate/` | psi's identity, permissions inputs, SEB lock, components — the estate's inputs to SEB |
| `docs/` | how psi works with SEB; `docs/brands/` holds the brands' business context and decisions |
| `gitops/` | what Argo deploys for psi (generated platform Applications + psi's app registrations) |

## Hard rules (every agent)

- **Ask through the interactive question tool**, never as prose at the end of a reply. Verify
  before asking; every option carries pros and cons; recommend the complete option.
- **Worktrees install their own dependencies**: `pnpm install --frozen-lockfile` in the worktree;
  never link into the main checkout.
- **Tests are scoped and capped**: one project at a time, `--maxWorkers=4` or lower. Never the
  whole suite at once on a workstation.
- **Green before commit**: build, lint, type-check and tests green for everything the change
  affects (`pnpm affected`). Report failures honestly, with output.
- **Type safety**: no `any`, no `@ts-ignore`, no unchecked casts, no `!`; parse at every boundary
  (zod); explicit types on exported functions.
- **Files ≤ 500 lines, one responsibility each**; no `utils.ts` dumping grounds.
- **i18n-first**: every user-facing string goes through the i18n library; no bare strings in JSX.
- **One design language: psi's.** Every psi app (the three brand landings, the blog, consoles)
  speaks the psi design language: tokens, eight themes, brand books and component guides in
  `packages/design/` (`@psi/design`). A component two apps need is never written into an app.
  What the component library is built from (the kit's own components, or SEB's design system as
  the starting point) is still to be decided.
- **No `rmx` naming in this repository.** Package names, imports, paths and identifiers are
  `@psi/…`/psi's own. Any `rmx` left here is a leftover to remove, never a pattern to copy.
- **Authorization goes through Polaris**: no hand-rolled roles/permissions; an app declares
  `apps/<name>/authz.manifest.json`.
- **Secrets**: never in git; `.env*` are gitignored; secrets live in the estate's OpenBao.
- **No live change without saying so**: anything that changes the running estate is stated
  before it is pushed. The branch is the environment (`dev` → psi dev).
- **Commits**: conventional commits (`feat|fix|docs|refactor|test|build|ci|chore`); no WIP.
- **Every reply ends with Progress and Next steps.**

## Reference checkouts (read-only)

- **SEB** at `../seb` (beside this repo): what the estate's platform looks like. Read it, never
  modify it. Refresh it before relying on it: `git -C ../seb pull --ff-only`.
- **rmx** (the first estate): available from the owner on request, for inspiration only; never
  modified.

## Adding an app

1. `apps/<name>/` with its own `package.json` (name `@psi/<name>`) and `project.json`
   (Nx targets: build, test, type-check, lint).
2. A `Dockerfile` if it is deployed.
3. Register it in `gitops/` (its Argo Application) — the estate's CI builds the image into the
   estate's Harbor and bumps the tag.
