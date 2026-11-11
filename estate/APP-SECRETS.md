# psi's application secrets — the estate addendum

The same table as the platform's `gitops/services/APP-SECRETS.md`, for psi's own applications:
which keys each app cannot boot without, where they live in OpenBao, and how the fail-loud guard
is wired. SEB's `tools/secrets/required.mjs` reads both tables and checks each row against the
app's `seb.app.yaml`.

| App | OpenBao path | Required keys | Evidence |
|-----|--------------|---------------|----------|
| `psizone-web` | `secret/apps/psizone-web/env` | `OPENROUTER_API_KEY` | The guide (Mastra on OpenRouter) and the knowledge embeddings read it. Declared per-key in `gitops/services/psizone-web/base/externalsecret.yaml` (missing ⇒ `SecretSyncedError`; `dataFrom.extract` adds the optional `PSI_GUIDE_MODEL`, `PSI_EMBED_MODEL`) and asserted non-empty by the `assert-secrets` initContainer (`MISSING REQUIRED SECRET: OPENROUTER_API_KEY`). The pages themselves do not need it: without credits the site serves and the guide answers that it has no reviewed answer. |
| `eqsync-web` | `secret/apps/eqsync-web/env` | `OPENROUTER_API_KEY` | As `psizone-web`: `gitops/services/eqsync-web/base/externalsecret.yaml` per-key, `assert-secrets` initContainer. |
| `hemisync-web` | `secret/apps/hemisync-web/env` | `OPENROUTER_API_KEY` | As `psizone-web`: `gitops/services/hemisync-web/base/externalsecret.yaml` per-key, `assert-secrets` initContainer. |
| `blog-web` | `secret/apps/blog-web/env` | _(none)_ | Nothing is required yet. `OPENROUTER_API_KEY` is optional: read through `dataFrom.extract` into a Secret the Deployment mounts with `optional: true`; without it the guide answers "unavailable". Until the path exists the `blog-web-env` ExternalSecret reports `SecretSyncedError` and the pod starts regardless. |
