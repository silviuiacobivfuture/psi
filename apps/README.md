# apps/

One folder per application of psi: a landing page, a service, a console. The same places as
every estate on SEB (RMX's `apps/` is the other):

| Path | What |
|------|------|
| `apps/<name>/package.json` | the workspace member `@psi/<name>`; its scripts `build`, `type-check`, `test` are its Nx targets (`pnpm nx run @psi/<name>:build`) — no `project.json` unless a target needs more than a script |
| `apps/<name>/src/` | the code, tests beside it (`*.test.ts`) |
| `apps/<name>/messages/`, `project.inlang/` | its translations (Paraglide); no bare user-facing strings |
| `apps/<name>/Dockerfile` | the image, built from the repository root; base images from the estate's Harbor mirror (`--build-arg REGISTRY_HOST`, `REGISTRY_PROJECT_MIRROR`, no default). `.github/workflows/apps.yml` builds only apps that have one |
| `apps/<name>/seb.app.yaml` | the app's declaration to the platform (SEB `schema/app.schema.json`): workloads, secrets and their readers, hosts, health checks. SEB's doctor derives the app's checks from it |
| `apps/<name>/authz.manifest.json` | only when the app has permissions: its roles and features, from which Polaris generates the model and catalog (`estate/authz.json` reads `apps/*/authz.manifest.json`) |
| `gitops/services/<name>/` | its manifests: `base/` + `overlays/dev/`, whose image tag CI moves |
| `gitops/apps/overlays/dev/apps/<name>.yaml` | its Argo Application, listed in that folder's `kustomization.yaml` |

An app that needs secrets also has: its ExternalSecret declaring every required key per key, an
`assert-secrets` initContainer (`MISSING REQUIRED SECRET: <key>`), and its row in
`estate/APP-SECRETS.md`.

`pnpm new-app <name> --service` writes all of the above for a TypeScript service. Its web
template is SEB's Vite + React; psi's sites are Hono + Datastar (CLAUDE.md, "The stack"), so a
new site starts from an existing one.

Deploying is a merge: `apps.yml` builds every changed app that has a Dockerfile, pushes
`registry.psizone.ro/psi/<name>:<sha7>` and writes the tag into its overlay; Argo does the rest.
