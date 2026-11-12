# EQ-SYNC (eqsync-web) is retired

- **What:** the EQ-SYNC site is withdrawn from the estate. Its code in this folder is kept as it
  was and is not maintained, built, tested or deployed.
- **Since:** 2026-11-12.
- **Why / who:** the owner's order ("temporarily mark eqsync as deprecated in the repo, properly,
  so it is no longer touched or seen by AI agents in this repo; also undeploy it; remove it from
  the hub"). It is temporary.
- **Not changed on purpose:** the EQ-SYNC articles and knowledge in `@psi/content` /
  `@psi/knowledge`, the CMS data (the `eqsync` brand rows), the design tokens and logos, the
  authorization model (`estate/authz`, a model-pin procedure) and `gitops/services/eqsync-web/`.

The presence of this file keeps the app out of CI (`.github/workflows/apps.yml` skips any app
with a `DEPRECATED.md`) and out of the generators (`tools/images`, `tools/audio`,
`@psi/pwa icons`, the local SSO/account scripts).

## How to revive

One switch, then undo the removals:

1. `packages/content/src/retired.ts`: set `RETIRED_SITES = []`. That alone brings EQ-SYNC back
   into the estate footer and compass, the blog (listings, feeds, sitemap, filter chip, article
   URLs), the guides (routing, services, articles, handoffs), the CMS (brand pickers, tabs,
   settings, filters) and makes `EQSYNC_URL` required in production again (`estateInput`).
2. `pnpm-workspace.yaml`: remove the `!apps/eqsync-web` exclusion; run `pnpm install`.
3. Delete this file (CI builds the app again).
4. Gitops: re-add `gitops/apps/overlays/dev/apps/eqsync-web.yaml` (the manifest is in
   `gitops/services/eqsync-web/README.md`) and list it in that folder's `kustomization.yaml`;
   re-add `EQSYNC_URL` to the psizone/hemisync/blog deployments, `eqsync-web` to the CMS's
   `SITE_WEBHOOK_URLS` and its `EQSYNC_CONTROL_URL`; the hub tile in
   `gitops/apps/overlays/dev/seb-pieces/homepage.yaml`; the Nextcloud external site `"2"`
   (`estate/seb-components/nextcloud-platform/kustomization.yaml`, and its render).
5. Copy: the "Psizone, EQ-SYNC, Hemi-Sync" lists in the three sites' `messages/*.json`, the blog
   guide's lines (`packages/guide/src/profiles/{welcome,voices,concierge}.ts`), the blog demo
   knowledge, and the sentences on `/metode/eq-sync` that pointed to the EQ-SYNC site.
6. Agents: remove the "EQ-SYNC is retired" section from `CLAUDE.md`, the `permissions.deny`
   rules in `.claude/settings.json`, and the entries in the root `.ignore`.
