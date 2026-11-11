# App Secrets Schema — required keys, fail-loud contract

Single source of truth for which secret keys each cluster app **cannot boot
without**, where they live in OpenBao, and how the "never silently die" guard is
wired. See the HARD RULE in `infrastructure/hetzner/CLAUDE.md`
("New apps: secret schema is MANDATORY").

## Why this exists

Every app ExternalSecret uses `dataFrom.extract` to pull *all* keys from its
OpenBao path. `extract` does **not** error on a missing key — so a key absent in
OpenBao yields an empty/partial k8s Secret, the Deployment's `envFrom` injects a
blank env, and the app crashes at runtime with no clue. Two additive guards make
that failure LOUD and named instead:

1. **ExternalSecret `data[]`** — each hard-required key is declared explicitly via
   `data[].remoteRef.property`. Unlike `extract`, a per-key `data` ref whose
   property is **absent** in OpenBao makes the ExternalSecret report
   `SecretSyncedError` (visible in `kubectl get externalsecret -A`). `data` takes
   precedence and `dataFrom.extract` fills every other key, so the change is
   **purely additive** — no key is ever dropped.
2. **`assert-secrets` initContainer** — a busybox (restricted securityContext)
   first initContainer asserts each required env is set + non-empty; on a miss the
   pod CrashLoops with `MISSING REQUIRED SECRET: <key>` instead of dying
   cryptically. Defense-in-depth: catches a key that is present-but-empty (which a
   `data` ref would still sync).

`doctor.sh` (`infrastructure/hetzner/scripts`) closes the loop with a read-only
check: each app's ExternalSecret is `SecretSynced` **and** the rendered k8s Secret
contains every required key below.

## ESO `data` + `dataFrom` semantics (verified against this repo)

`data` and `dataFrom` coexist: `data` entries are applied first (highest
precedence), then `dataFrom.extract` fills any remaining keys. A `data` entry that
references a **missing** `remoteRef.property` fails the sync → `SecretSyncedError`
(this is the loud signal we want). `dataFrom.extract` alone silently omits missing
keys — which is exactly the silent-death failure mode. This matches the long-
standing note in `gitops/services/lmn-sign/base/externalsecret.yaml`.

## Schema

OpenBao backend is KV v2 mounted at `secret/` by the `openbao` ClusterSecretStore,
so an ExternalSecret `key: apps/<app>/env` resolves to OpenBao path
`secret/apps/<app>/env`. Keys are seeded by
`infrastructure/hetzner/scripts/seed-secrets.sh`.

The platform's own applications are listed here. The estate's business
applications are listed in the estate's own addendum, `estate/APP-SECRETS.md`, with
the same columns; `tools/secrets/required.mjs` reads both tables.

| App | OpenBao path | Required keys | Evidence |
|-----|--------------|---------------|----------|
| `changelog` | `secret/apps/changelog/db` (`username`, `password`) — the URLs are COMPOSED by the `changelog-db` ExternalSecret, not stored | `DATABASE_URL`, `DATABASE_DIRECT_URL` | `apps/changelog/src/env.ts` zod `.min(1)` on both → `process.exit(1)`; `prisma/schema.prisma` uses `url`+`directUrl`; the `migrate` initContainer needs `DATABASE_DIRECT_URL`. Both point at the in-cluster CNPG `changelog-db-rw` (since 2026-10-22; Neon before). The same credential bootstraps the Cluster via `changelog-db-app`. |
| `nextcloud` | `secret/apps/nextcloud/{admin,db,redis,collabora}` + `secret/platform/authentik/nextcloud-oidc` | `admin.{username,password}`, `db.{username,password}`, `redis.password`, `collabora.{username,password}`, `nextcloud-oidc.{client_id,client_secret}` | Every one is declared per-key in `pieces/nextcloud-platform/base/externalsecrets.yaml` (no bare `extract`), and the `assert-secrets` initContainer in the chart values asserts the DB/S3/admin values are non-empty. `db` is consumed by CNPG itself (`bootstrap.initdb.secret`) so the role's password survives a rebuild and still matches a restored database. `nextcloud-oidc` is read by BOTH ends of the SSO handshake — Authentik via `authentik-oidc-clients`, Nextcloud via the occ reconcile CronJob. |
| `talk-hpb` | `secret/apps/talk-hpb/secrets` | `signaling_secret`, `turn_secret`, `internal_secret` | The `nextcloud/aio-talk` entrypoint hard-exits with `You need to provide the <NAME>` when any is unset (`Containers/talk/start.sh`), so the image is already fail-loud and no assert initContainer is added. `signaling_secret`/`turn_secret` are ALSO mirrored into the `nextcloud` namespace (`talk-secrets`) and written into Talk's config by the occ reconcile CronJob — the two ends must hold identical values or every call fails the signaling handshake. |
| `browseruse-webui` | `secret/apps/browseruse-webui/env` | _(none)_ | All keys read via `os.getenv(name, default)` with graceful fallbacks (unset GRADIO auth → UI simply has no login; see `infrastructure/browseruse/webui.py`). The app boots and runs on a partial/empty secret, so any required-key assertion would be a FALSE failure. Add keys here only once the app hard-fails on their absence. |
| `plane` | `secret/apps/plane/{app,db,redis,rabbitmq}` (+ `secret/platform/object-storage/dev`) | rendered into `plane-app-secrets`: `SECRET_KEY`, `LIVE_SERVER_SECRET_KEY`, `DATABASE_URL`, `REDIS_URL`, `AMQP_URL`; rendered into `plane-doc-store`: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_S3_BUCKET_NAME` | The plane-ce chart offers no way to inject an external DSN except through a Helm VALUE (`env.pgdb_password`, `rabbitmq.external_rabbitmq_url`, `env.aws_secret_access_key`) — i.e. plaintext in git. So `external_secrets.{app_env,doc_store,live_env}_existingSecret` point the chart's `envFrom` at Secrets **we** compose in `gitops/services/plane/base/externalsecrets.yaml`: each OpenBao property is a per-key `data[]` entry (missing ⇒ `SecretSyncedError`) and an ESO `template` assembles the DSNs. `SECRET_KEY` — Django session/CSRF/password-reset signing; the chart default is a publicly-known string Plane itself flags (GHSA-cmwv-pjmw-8483). `LIVE_SERVER_SECRET_KEY` — ONE property, TWO consumers (`plane-app-secrets` + `plane-live-secrets`); `apps/live/src/lib/auth-middleware.ts:38` 401s every editing session on a mismatch. The RabbitMQ user/password feed BOTH `AMQP_URL` and the broker's own `RABBITMQ_DEFAULT_USER/PASS`, from the same properties, so the ends cannot drift. `db` is consumed by CNPG itself (`bootstrap.initdb.secret`) so the role survives a rebuild and still matches a restored database. **No `assert-secrets` initContainer**: chart 1.6.2 exposes no `extraInitContainers`/`extraEnv`/podSpec seam on any of its eight workload templates, so the present-but-empty guard runs as the `plane-assert-secrets` CronJob (`*/15`) on the exact same two Secrets — see `gitops/services/plane/base/assert-secrets.yaml`. |
| `test-reports` | `secret/platform/test-reports/ingest` (PLATFORM path, not `apps/`) | `token` → env `INGEST_TOKEN` | `pieces/test-reports/base/app/app.py` reads `os.environ["INGEST_TOKEN"]` at import (KeyError → the process exits before it binds a port), and `hmac.compare_digest` gates every `POST /ingest/<app>`. Declared per-key in `pieces/test-reports/base/externalsecret.yaml` (no `dataFrom.extract` at all — there is exactly one key) and asserted non-empty by the `assert-secrets` initContainer, because a present-but-EMPTY token would let the service boot and 401 every CI report while looking perfectly healthy. **A PLATFORM path, deliberately**: like `platform/talk/webhook` it is a SHARED credential between two planes — CI presents it, the service verifies it — not config belonging to one app. `github-ci` is granted read on this one path in `openbao-bootstrap.sh`. |
| `test-reports-weekly-digest` | `secret/platform/talk/webhook` (SHARED, mirrored into ns `test-reports`) | `token` → env `NOTIFY_TOKEN` | The Monday `#tests` summary CronJob (`pieces/test-reports/base/weekly-digest.yaml`, phase 4 of `TEST-VISIBILITY-PLAN.md`). ESO cannot copy a Secret across namespaces, so this is a THIRD `talk-webhook-token` ExternalSecret reading the SAME OpenBao path as the copies in `nextcloud` and `observability` — one rotation reaches all of them, and `seed-secrets.sh` needs no change (the path is already seeded by `seed_generated "secret/platform/talk/webhook" token:48`). Declared per-key (missing ⇒ `SecretSyncedError`) and asserted non-empty by an `assert-secrets` initContainer, because ESO can sync a present-but-EMPTY field and the job would then compute a perfect digest and post it into a 401 every Monday while every object looked Ready. **SEND-ONLY**: the translator holds the Talk signing key, so this credential can post a message and nothing else. No Reloader annotation — a CronJob starts a fresh pod per run and always reads the current value. `doctor.sh` asserts both the sync status and the CronJob's `lastSuccessfulTime`. |
| `reportportal` | `secret/apps/reportportal/{db,rabbitmq,superadmin,ci}` (+ the SHARED `secret/platform/object-storage/dev`) | `db.{username,password}`, `rabbitmq.{username,password}`, `superadmin.password`; S3 `access_key_id`/`secret_access_key` | Chart 26.8.12 reads EVERY credential through its own `secretKeyRef` (`database.secretName`+`passwordKeyName`, `msgbroker.secretName`, `storage.secretName`+`accesskeyName`/`secretkeyName`, `uat.superadminInitPasswd.secretName`+`passwordKeyName`), so — unlike Plane — no DSN is composed and no password can end up in a Helm value. All declared per-key (missing ⇒ `SecretSyncedError`) in `pieces/reportportal-platform/base/externalsecrets.yaml`, and asserted NON-EMPTY by `assert-secrets` initContainers injected through the chart's real `serviceapi.extraInitContainers` / `uat.extraInitContainers` seams. ⚠️ **The RabbitMQ key name is HARD-CODED to `rabbitmq-password`** in four chart templates (there is no `msgbroker.passwordKeyName`); the ESO template emits it alongside `RABBITMQ_DEFAULT_USER`/`_PASS` from ONE OpenBao property, so the broker and its clients cannot drift. `db` is consumed by CNPG itself (`bootstrap.initdb.secret`) AND by the chart, so a rebuild cannot desync the role from a restored database. ⚠️ **`superadmin.password` is an INITIAL password, not a reconciled one** — uat applies it only when the superadmin row is created (the chart's own docs: it "can't change the password on redeployments"), so rotating the OpenBao path afterwards changes NOTHING in the running app. It is seeded generate-if-missing and a real rotation is a UI change written back here. It matters because ReportPortal ships a PUBLICLY DOCUMENTED default superadmin credential and `reports.northwind.example` is deliberately internet-reachable so agents can POST to its API. `ci.api_token` is a **SLOT**, seeded EMPTY, and since 2026-08-20 it is FILLED AUTOMATICALLY: the `reportportal-config-reconcile` CronJob (`pieces/reportportal-platform/base/config-reconcile.yaml`) validates the stored key with `GET /api/v1/rmx/launch?page.size=1`, and on an empty slot or a 401/403 mints a replacement and writes it back here through the `reportportal-config` OpenBao role (`read,create,update` on this ONE path — see `openbao-bootstrap.sh`). That write-back exists because RP stores API keys HASHED: a database restored from backup hands back a key nobody can ever read, and the CI import step is `continue-on-error`, so the test history would just silently stop. Anything other than 401/403 is treated as transient and does NOT trigger a mint; old keys are never revoked, and a name collision gets a dated suffix. A ReportPortal API key can only be minted inside ReportPortal, and an empty field (rather than an absent one) is what lets `vault-action` succeed in CI and lets `doctor.sh` report "not captured yet" instead of "unknown" — the same pattern as the Convex `admin_key`. |
| `reportportal-users` | `secret/apps/reportportal/users` | ONE FIELD PER LOGIN, value = that person's INITIAL ReportPortal password | **The only ExternalSecret in `pieces/reportportal-platform/base/externalsecrets.yaml` that uses `dataFrom.extract` instead of an explicit `data[]`, deliberately.** The key set is DYNAMIC by design — one field per person on the roster in `pieces/reportportal-platform/base/config-reconcile-data.yaml` — and the entire point of that roster is that adding a teammate is ONE LINE. Declaring the logins here as well would put the list of people in two files and guarantee they drift, which is the exact failure the declare-every-key rule exists to prevent, one level up. So the loudness moves INTO the consumer, where it is strictly better: the `reportportal-config-reconcile` CronJob mounts the Secret as a DIRECTORY and, for each roster login it must create, exits `MISSING REQUIRED SECRET: reportportal-users/<login>` — a named error that says WHICH person is missing, which a `SecretSyncedError` on a whole path could not. The mount is `optional: true` for the same reason: a non-optional mount of a Secret that does not exist yet wedges the pod in `ContainerCreating`, i.e. the reconcile would silently never run — the very silent death this file's contract forbids. ⚠️ **These are INITIAL passwords and this path is NOT rotatable.** `seed-secrets.sh` seeds it generate-if-missing by PARSING the roster block out of the ConfigMap (so the people list stays in one file) and `--rotate` deliberately does not touch it: ReportPortal owns a password once the account exists — the reconcile has NO update call and can never reset one — so rewriting the stored value would replace a correct record with a plausible-looking wrong one. Hand one over with `bao kv get -field=<login> secret/apps/reportportal/users`, or let RP mail a reset link (the mail server is configured as code by `email-reconcile.yaml`). VOLUME-mounted, so no Reloader annotation is needed — and the consumer is a CronJob, which starts a fresh pod per run anyway. |
| `plunk-inbound` (plunk — GENERATED, `pieces/plunk/base/inbound.generated.yaml`) | each receiving sender's `inbound.token` path | `token` → `INBOUND_TOKEN_<KEY>` | envFrom (optional) on `plunk-sso` and `plunk-reconcile`; the reconcile refuses BY NAME (`MISSING REQUIRED SECRET: INBOUND_TOKEN_<KEY>`) when a declared receiver's token is absent. doctor: the `plunk-inbound` row. |
| `email-sender` (reportportal — GENERATED, `pieces/reportportal-platform/base/email.generated.yaml`) | `secret/apps/reportportal/plunk` (the `reports` sender's Plunk key, captured by `plunk-bootstrap.sh`) | `secret_key` → `EMAIL_API_KEY`; `EMAIL_FROM` from the declaration `gitops/services/plunk/senders/reports.json` (`noreply@reports.<apex>`) | **ReportPortal's own sender through Plunk's relay** (the e-mail migration plan (first estate's history, not shipped) step 3; it replaced `reportportal-email`, the former provider's shared path). ReportPortal cannot send an invitation or a password reset until an email server is configured, and chart 26.8.12 exposes **no smtp/mail value at all** — ReportPortal keeps the mail server as a row in its OWN Postgres, a global `email` integration. So it is reconciled as code by `pieces/reportportal-platform/base/email-reconcile.yaml` (`plunk-smtp.<apex>:587`, STARTTLS, user `plunk`, password = the key, From = `EMAIL_FROM`), the same pattern as `harbor-oidc-reconcile.yaml`. The reconcile asserts both values non-empty at start, exiting `MISSING REQUIRED SECRET: email-sender/<key>`. **No Reloader annotation** needed: the only consumer is a CronJob, a fresh pod per run. ⚠️ **Rotation is NOT instant, by design.** ReportPortal never returns the stored password, and it **sends a real test email on every write**, which is why the job must never blind-PUT; it runs `GET /v1/integration/{id}/connection/test` (SMTP connect + AUTH, no mail), re-pushes the credential once on failure, and exits non-zero if it still fails. `doctor.sh` checks the row exists, is enabled, points at the relay, the reconcile reads its sender Secret (lib-email-relay.sh), and the last Job did not fail. |
| `email-sender` (plane — GENERATED, `gitops/services/plane/base/email.generated.yaml`) | `secret/apps/plane/plunk` (the `plane` sender's Plunk key, captured by `plunk-bootstrap.sh`) | `secret_key` → `EMAIL_API_KEY`; `EMAIL_FROM`/`EMAIL_FROM_NAME` from the declaration `gitops/services/plunk/senders/plane.json` (`noreply@plane.<apex>`, "Plane") | **Plane's own sender, through Plunk's relay** (the e-mail migration plan (first estate's history, not shipped) step 2; it replaced `plane-smtp`, the former provider's shared path). The reconcile writes `plunk-smtp.<apex>:587`, STARTTLS, user `plunk`, password = the key. Plane keeps SMTP in its OWN database (`instance_configuration`), not in Helm values and not in env: `plane/license/utils/instance_value.py` reads the environment only when `settings.SKIP_ENV_VAR` is false, and `plane/settings/common.py:369` defaults it to `"1"`; the per-key env fallback applies only to a key with **no row**, and `configure_instance.py` has already created every row with `get_or_create` (value filled only on `created`). Verified on dev: `EMAIL_HOST`/`EMAIL_PORT`/`EMAIL_FROM`/`EMAIL_HOST_USER`/`EMAIL_HOST_PASSWORD` all present and all `""` — a row that exists but is empty can never be refilled from env. So it is reconciled as code by `gitops/services/plane/base/smtp-reconcile.yaml`, which execs into the running api pod and drives Plane's **own Django ORM** through `manage.py shell` (same models, same `encrypt_data`, same `SECRET_KEY`, same code path as the API's `PATCH /api/instances/configurations/`) — not raw SQL. **Why not the HTTP API:** that endpoint is gated by `InstanceAdminPermission`, i.e. a session-cookie login as an instance-admin *user* whose password the cluster does not hold. Both keys are declared per-key (missing ⇒ `SecretSyncedError`) in `gitops/services/plane/base/externalsecrets.yaml`, and the CronJob refuses a present-but-empty value with `FATAL PLANE_SMTP_EMPTY_PASSWORD` / `FATAL PLANE_SMTP_EMPTY_FROM`. It also **authenticates against the relay before writing** (STARTTLS with the certificate verified as Django verifies it, + AUTH, no message sent) and exits `FATAL PLANE_SMTP_AUTH_FAILED` rather than storing a credential that would make `is_smtp_configured` read true while every mail is dropped. **No Reloader annotation** and none required: the only consumer is a CronJob, which starts a fresh pod per run (the Kyverno guard matches Deployment/StatefulSet/DaemonSet only). ⚠️ The reconcile must also invalidate Plane's own cache — `/api/instances/` and `/api/instances/configurations/` are cached for **two hours** (`plane.utils.cache.cache_response`, `user=False` ⇒ the cache key is the bare path); the API's PATCH handler drops them via a decorator, an ORM write does not. `doctor.sh` checks `is_smtp_configured: true` on `/api/instances/` (read through the API-server service proxy, which bypasses the Authentik gate) and that the last reconcile Job did not fail. |
| `novu-sso-directory` (PLATFORM) | `secret/platform/authentik/novu-sso-api-token` | `token` → env `AUTHENTIK_API_TOKEN` of `novu-sso` | Read-only directory token (`view_user`, `view_group`), minted by `authentik-novu-sso-token-reconcile`. Novu's SSO reads one person's groups at sign-in with it, because the outpost's are from sign-in (`apps/novu-sso/lib/directory.mjs`). Until the first run fills it, a new pod stops at `assert-secrets` by name and the running one keeps serving. |
| `plunk-sso-directory` (PLATFORM) | `secret/platform/authentik/plunk-sso-api-token` | `token` → env `AUTHENTIK_API_TOKEN` of `plunk-sso` | Read-only directory token (`view_user`, `view_group`), minted by `authentik-plunk-sso-token-reconcile`. Plunk's SSO reads one person's groups at sign-in with it, because the outpost's are from sign-in (`apps/plunk-sso/lib/directory.mjs`). Until the first run fills it, a new pod stops at `assert-secrets` by name and the running one keeps serving. |
| `plane-sso-directory` (PLATFORM) | `secret/platform/authentik/plane-sso-api-token` | `token` → env `AUTHENTIK_API_TOKEN` of the `plane-sso-reconcile` CronJob ONLY | The Plane SSO reconcile (apps/plane-sso, `gitops/services/plane/base/sso-reconcile.yaml`) reads who is in which Authentik group with this token. A **SLOT, never seeded**: only Authentik can mint a token it accepts, so the `authentik-plane-sso-token-reconcile` CronJob (`gitops/platform/authentik/plane-sso-token-reconcile.yaml`, the shared credential-token script) creates service account `svc-plane-sso`, a role holding exactly `authentik_core.view_user` + `authentik_core.view_group`, mints the token and writes it here through its own OpenBao role (`authentik-plane-sso-token`, read+write on this one path — `openbao-bootstrap.sh`). Verified 2026-10-28: lists users with groups, `PATCH` on a group → 403. The api pods never hold it — least privilege; the CronJob passes it to `manage.py` over STDIN. Declared per key (empty slot ⇒ `SecretSyncedError`) and the CronJob refuses a present-but-empty value with `MISSING REQUIRED SECRET: AUTHENTIK_API_TOKEN`. No Reloader annotation needed (a CronJob reads the Secret fresh each run). The SSO's NON-secret settings (`PLANE_SSO_VERIFY_URL`, `PLANE_SSO_SIGNOUT_URL`) ride in `plane-app-secrets`' template beside `WEB_URL`; unset, every SSO login refuses with `sso-misconfigured`. |
| `n8n-sso-directory` (PLATFORM) | `secret/platform/authentik/n8n-sso-api-token` | `token` → env `AUTHENTIK_API_TOKEN` of `n8n-sso`, in every n8n namespace | The read-only directory token (`view_user`, `view_group`), minted by the `authentik-n8n-sso-token-reconcile` CronJob. |
| `n8n-sso` | `secret/apps/n8n/sso` (`secret/apps/n8n-<id>/sso` per instance) + `secret/platform/authentik/n8n-scim` (`n8n-<id>-scim`) | `sso.{api_key,transfer_project_id,scim_token_sha256}`; `secret/platform/n8n/sso-password` `keys` (space-separated, current first; automatic passwords derive from it, so a holder can sign in as anybody but the owner; under `platform/` so developer, reader and github-ci cannot read it; never in a blanket `--rotate`, RUNBOOK 2026-11-04); `n8n-scim.token` → `AUTHENTIK_SCIM__N8N__TOKEN` of Authentik (`authentik-n8n-scim`, optional at the chart) | The sidecar in front of n8n (`apps/n8n-sso`). `scim_token_sha256` and the Authentik token are seeded by `seed-secrets.sh`, the hash only on the sidecar's side. `api_key` CANNOT be seeded: n8n has no env-managed key, so `n8n-sso-bootstrap.sh <env> [<id>]` signs in as the owner once and mints it, scoped to `user:list,read,create,delete`, `project:manageMembers`, `nodeTypePolicy:manage`. Until then the pod stops at `assert-secrets` naming it. |
| `plane` harbor-pull (PLATFORM) | `secret/platform/harbor/pull` | `username`, `password` → `harbor-pull` (`kubernetes.io/dockerconfigjson`) | Plane's api/worker/beat-worker/migrator run OUR image (`harbor.northwind.example/northwind/plane-backend-sso/…`, private). The chart attaches a pull secret only via `dockerRegistry.enabled`, which renders it from PLAINTEXT values — so the same ESO-composed `harbor-pull` every service carries is attached to those pods by the Kyverno policy `pieces/kyverno-policies/mutate-plane-harbor-pull.yaml` (pods only, so no Argo drift). Verified 2026-10-28 on a canary pod that named no pull secret itself. |
| `email-sender` (nextcloud — GENERATED, `pieces/nextcloud-platform/base/email.generated.yaml`) | `secret/apps/nextcloud/plunk` (the `cloud` sender's Plunk key, captured by `plunk-bootstrap.sh`) | `secret_key` → `EMAIL_API_KEY` (read as `SMTP_PASSWORD`) | **Nextcloud's own sender through Plunk's relay** (the e-mail migration plan (first estate's history, not shipped) step 3; it replaced `nextcloud-smtp`, the former provider's shared path). Nextcloud needs **no reconcile job**: mail is `mail_*` **system** config (config.php), and the official image ships `/var/www/html/config/smtp.config.php`, which assembles the whole block from `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` / `SMTP_NAME` / `SMTP_PASSWORD` / `MAIL_FROM_ADDRESS` / `MAIL_DOMAIN` at request time and is merged over config.php — so the env-driven fragment beats anything typed into the admin UI, and the key stays out of config.php on the Velero-backed PVC. Only the password is a secret; the rest are plain values in `nextcloud.extraEnv` (`gitops/apps/overlays/dev/nextcloud.yaml`: `plunk-smtp.<apex>`, 587, `tls`, user `plunk`), injected into **both** the server and the background-cron container. The `assert-secrets` initContainer exits `MISSING REQUIRED SECRET: SMTP_PASSWORD` on an empty key; the Deployment carries `reloader.stakater.com/auto`. ⚠️ `SMTP_SECURE` **must be `tls`, never `ssl`** (Symfony Mailer: `ssl` means implicit TLS, port 465 only). `MAIL_FROM_ADDRESS@MAIL_DOMAIN` must equal the `cloud` declaration (`noreply@cloud.<apex>`) — `doctor.sh` compares occ's merged config with it, plus `mail_smtphost`, `mail_smtpmode` and the `ssl`-on-587 trap; `scripts/tests/email-relay.test.sh` compares git with it. |
| `authentik-email` (PLATFORM) | `secret/platform/plunk/platform` (the apex `platform` sender's Plunk key, captured by `plunk-bootstrap.sh`) | `secret_key` | **The surviving directory's outgoing mail** (set-password and recovery links, `docs/autorizare/18-sso-authentik-unic.md` step 2) — identity mail, so the APEX sender (`gitops/services/plunk/senders/platform.json`), through Plunk's relay (the e-mail migration plan (first estate's history, not shipped) step 1). Rendered as `AUTHENTIK_EMAIL__PASSWORD` (the key) and `AUTHENTIK_EMAIL__FROM` (`NorthwindCo <noreply@<apex>>`, the declaration's, written out; `scripts/tests/email-relay.test.sh` fails when they disagree) by `pieces/platform-secrets/authentik-email.yaml` (per key, missing ⇒ `SecretSyncedError`); host `plunk-smtp.<apex>` (resolved in-cluster to the relay Service by `gitops/services/cluster-dns`, so the certificate is verified by its own name), port 587, STARTTLS and the username `plunk` are plain chart values in `gitops/apps/overlays/dev/authentik.yaml` (`authentik.email`), which the chart renders only when non-empty, so the two never set the same variable. NOT `optional` in `global.envFrom`, and the `assert-mail` initContainer on server and worker exits `MISSING REQUIRED SECRET: AUTHENTIK_EMAIL__PASSWORD` / `__FROM` — a directory that cannot send set-password links must not start. Server and worker already carry `reloader.stakater.com/auto`. `doctor.sh` layer "e-mail consumers (Plunk relay)" opens and authenticates an SMTP session with the directory's own settings from inside the worker, certificate verified, and sends nothing; it also fails when the host is not the relay, the key is not the platform sender's (compared by hash) or the From is not the declaration's. |

| `novu` | `secret/apps/novu/{app,mongodb,redis,admin}` (+ the SHARED `secret/platform/object-storage/dev`) | rendered into `novu-app`: `JWT_SECRET`, `STORE_ENCRYPTION_KEY`, `NOVU_SECRET_KEY`, `MONGO_URL`, `REDIS_PASSWORD`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`; into `novu-mongodb`: `MONGO_INITDB_ROOT_USERNAME`, `MONGO_INITDB_ROOT_PASSWORD`; into `novu-redis`: `redis-password`; into `novu-backup-s3`: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | Self-hosted Novu v3.19.0 (`gitops/services/novu`, 2026-10-22). Every property is a per-key `data[]` entry in `pieces/novu/base/externalsecrets.yaml` (no bare `extract`), and `assert-secrets` initContainers on api/worker/ws/mongodb exit `MISSING REQUIRED SECRET: <key>`. **`STORE_ENCRYPTION_KEY` must be EXACTLY 32 characters** — Novu's own requirement (`docker/community/.env.example`: "Must be exactly 32 characters"; it is the aes-256 key in `libs/application-generic/src/encryption/cipher.ts`) — so the api/worker initContainers assert the LENGTH too, exiting `INVALID SECRET: STORE_ENCRYPTION_KEY must be exactly 32 characters`; a wrong length otherwise boots and fails only at the first credential encrypt/decrypt. ⚠️ **Three values are NOT rotatable and `seed-secrets.sh --rotate` warns and preserves them** (`seed_novu`): `store_encryption_key` seals every stored provider credential AND every environment API key, so rotating it leaves a running Novu that rejects every app; `mongodb.password` — MongoDB applies `MONGO_INITDB_ROOT_*` only to an EMPTY data dir, so a new value never reaches the existing user (unlike CNPG, nothing reconciles it); `admin.password` is an INITIAL password (the dashboard account `novu-bootstrap.sh` registers; Novu owns it afterwards). The stored admin password carries a fixed `#Rx9` suffix because Novu's registration DTO demands upper/lower/digit/special and `bao_gen`'s alphabet has no special character. `JWT_SECRET` has THREE readers from ONE property: api (verifies dashboard sessions), ws (verifies sockets) and `novu-sso` (`pieces/novu/base/sso.yaml`, `apps/novu-sso`: SIGNS the dashboard session after an Authentik sign-in; it also reads `MONGO_URL` — both taken key by key with their own `assert-secrets`; `harbor-pull` pulls its image). `MONGO_URL` is COMPOSED by the ESO template — `bao_gen`'s `[A-Za-z0-9]` alphabet keeps it URL-safe. The S3 keys are the shared platform credential; the bucket `lmn-novu-<env>` is Novu's own (tofu `novu_storage`) because Novu writes keys at the bucket root with no prefix setting. **The apps' Novu credentials are NOT here** — they are minted INSIDE the running Novu and captured by `infrastructure/hetzner/scripts/novu-bootstrap.sh` into the consuming apps' paths (see "Novu consumer keys" below). |
| `n8n` | `secret/apps/n8n/{encryption,app,db,plunk}`, and all of `apps/n8n*`, DENIED to `reader`, `developer` and `github-ci` (RUNBOOK 2026-11-05; `tests/openbao-n8n-policy.test.sh`) (`plunk` through the GENERATED `email-sender`, read only while pieces/n8n/mail/ is on: `EMAIL_API_KEY` is the relay password, `EMAIL_FROM` the sender) | `encryption.key` (64 chars, seals every stored credential: `--rotate` warns and preserves it, and its only copies are OpenBao and its snapshots, `docs/n8n/00-plan.md` §6), rendered into `n8n-app`: `N8N_ENCRYPTION_KEY`, `N8N_USER_MANAGEMENT_JWT_SECRET`, `N8N_RUNNERS_AUTH_TOKEN`, `N8N_INSTANCE_OWNER_PASSWORD_HASH`, `DB_POSTGRESDB_USER`, `DB_POSTGRESDB_PASSWORD`; `n8n-runner` holds the broker token alone. The owner's sign-in is `secret/platform/n8n/owner` `password` (`secret/platform/n8n-<id>/owner` per instance), under `platform/` so developer, reader and github-ci cannot read it; `admin`, `eso` and root can, and no ExternalSecret may name it (gate). Read by a person, by `n8n-sso-bootstrap.sh` and by `n8n-password-repair.sh`. It is in no pod's env or volume, only its bcrypt hash, `app.owner_password_hash`: the repair hands it to one process in the n8n-sso pod, on stdin, for that one run. Rotate the pair with `--rotate-path=secret/platform/n8n/owner`, back with `n8n-owner-move.sh dev --rotate-undo`; the old copy at `app.owner_password` is retired by `n8n-owner-move.sh` (RUNBOOK 2026-11-05) | Declared per key, asserted by `assert-secrets` on both Deployments, `seed_n8n`, doctor layer "n8n", `.github/scripts/n8n-gate.sh` |
| `plunk` | `secret/apps/plunk/{app,db,redis}` + `secret/platform/ses/admin` (the owner's AWS credential: SES + the SNS topic + the receiving bucket) | rendered into `plunk-app`: `JWT_SECRET`, `DATABASE_URL`, `DIRECT_DATABASE_URL`, `REDIS_URL`, `AWS_SES_ACCESS_KEY_ID`, `AWS_SES_SECRET_ACCESS_KEY`, `AWS_SES_REGION`, `PLUNK_SES_CONFIGURED`; into `plunk-db-app`: `username`, `password`; into `plunk-redis`: `redis-password`; into `plunk-backup-s3`: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | Plunk 0.17.0 (`gitops/services/plunk`, 2026-10-29). Every property a per-key `data[]` entry in `pieces/plunk/base/externalsecrets.yaml`; `assert-secrets` initContainers on plunk and plunk-sso exit `MISSING REQUIRED SECRET: <key>`. **THE SES SLOT is the one deliberate exception to "empty = crash"**: Plunk's `validateEnv` refuses to START with an empty `AWS_SES_*`, and the credential is the OWNER's to create, so `secret/platform/ses/admin` is seeded as EMPTY slots (`seed_plunk`) and an empty slot renders the NAMED sentinel `ses-not-configured` with `PLUNK_SES_CONFIGURED=false` — the reconcile then holds every Plunk project disabled (a send is refused 403 `PROJECT_DISABLED` by Plunk itself) and `doctor.sh` WARNs naming the fix (docs/email/01-ses.md). Nothing can be sent with the sentinel: AWS rejects it. A PLATFORM path because OpenTofu (`infrastructure/hetzner/environments/ses`) reads the same credential. `jwt_secret` rotates freely (signs everybody out); the db password follows the CNPG rule (consumed by `bootstrap.initdb.secret`). |
| sender keys (one per declared sender) | `secret/platform/plunk/<key>` (apex) or `secret/apps/<app>/plunk`, as each declaration in `gitops/services/plunk/senders/` names it | `secret_key`, `public_key`, `project` → for a WIRED sender, the generated ExternalSecret `email-sender` renders `EMAIL_API_URL`, `EMAIL_API_KEY`, `EMAIL_FROM`, `EMAIL_FROM_NAME` | **Minted by Plunk, never seeded** (like the Novu keys): `infrastructure/hetzner/scripts/plunk-bootstrap.sh` runs the reconcile and writes only fields that differ. The four `EMAIL_*` names are provider-neutral on purpose — apps send through `@rmx/email` / `rmx.eu/platform/email` and never learn the provider (docs/email/02-onboarding.md). Until captured, a wired app's `email-sender` is SecretSyncedError and doctor WARNs naming the bootstrap; Plunk's own notices read the apex key `optional: true` because Plunk must run before its first project exists. |
| `plunk` harbor-pull (PLATFORM) | `secret/platform/harbor/pull` | `username`, `password` → `harbor-pull` | plunk-sso and plunk-reconcile run OUR image (`harbor.northwind.example/northwind/plunk-sso`), attached by `imagePullSecrets` in the manifests themselves (no Kyverno mutation needed — we own the pod specs). |
| `headscale` | `secret/apps/headscale/env` + `secret/platform/authentik/headscale-oidc` | `env.noise_private_key`, `env.derp_private_key`, `oidc.client_id`, `oidc.client_secret` | The tailnet's control plane (`pieces/headscale`). The two keys are `privkey:` + 64 hex, seeded once and left alone by `--rotate`: a new noise key makes every device and router register again. Mounted as files and asserted by shape as well as presence, because a malformed key dies with a parse error nobody connects to the secret. The OIDC pair is the Authentik loop's, read by both ends |
| `headplane` | `secret/apps/headscale/headplane` + `secret/platform/authentik/headplane-oidc` | `cookie_secret` (exactly 32 characters, asserted), `api_key`→`headscale_api_key`, `oidc.client_id`, `oidc.client_secret` | The mesh's console. `api_key` is an EMPTY SLOT only Headscale can fill: `headscale-bootstrap.sh <env>` mints it (365 days, full-admin: Headscale keys have no scope) and renews it within 30 days of expiry. Until then the console crash-loops naming it, and only the console: Headscale needs no key of its own. Read as a file by the server process, never sent to a browser (`.github/scripts/tests/headscale_test.sh` H14) |
| `tailnet-router` | `secret/apps/headscale/router` | `preauth_key` | The two routers. An EMPTY SLOT only Headscale can fill: `headscale-bootstrap.sh <env>` mints a reusable key tagged `tag:k8s`. Used at a router's first registration; afterwards its identity is on its volume and tagged nodes do not expire |
| `headscale-db-copy` | `secret/platform/object-storage/dev` (SHARED) | `access_key_id`, `secret_access_key` → `AWS_*` | The database copy's CronJob, like `k3s-datastore-copy` |
| `openfga` | `secret/apps/openfga/{env,db}` | `env.OPENFGA_AUTHN_PRESHARED_KEYS`; `db.{username,password}` | The authorization DATA plane. **An empty preshared key does not fail** — OpenFGA reads an empty list and then answers EVERY caller, unauthenticated, while `/healthz` returns SERVING and the pod is Ready. That is why the ExternalSecret uses `data[]` with **no `dataFrom.extract` at all** (`pieces/openfga/base/externalsecret.yaml`) and why the `assert-secrets` initContainer asserts it non-empty. The key is **NOT the access control** — the port split and the NetworkPolicy are (@rule OPS-2) — but it is attribution and a closed door on an accident. `db` is the CNPG owner, consumed by `bootstrap.initdb.secret` AND composed into the `uri` the migrate initContainer and the server read; the username must equal `initdb.owner` (`openfga`) or the cluster never bootstraps. |
| `autorizare-hub` | `secret/apps/autorizare/{app,env,hub}` + `secret/apps/openfga/env` + `secret/platform/authentik/autorizare-hub-oidc` | `app.DATABASE_URL`, `env.OPENFGA_STORE_ID`, `hub.{HUB_SIGNING_KEK_ID,HUB_SIGNING_KEK,HUB_PERSON_LOOKUP_TOKEN}` (the last: the bearer of the internal person lookup on :8081, also read by `authentik-tiles`), `openfga/env.OPENFGA_AUTHN_PRESHARED_KEYS` (as `OPENFGA_TOKEN`), `autorizare-hub-oidc.{client_id,client_secret}` (as `HUB_UPSTREAM_CLIENT_*`) | The sign-in hub (D23). `internal/hubconfig/config.go` requires eleven settings; four non-secret ones are in `hub.yaml`'s ConfigMap. The KEK seals the ES256 signing keys in Postgres and is generated ONCE (losing it makes every stored key unreadable and the hub refuses to start). The broker pair is read by BOTH the hub and Authentik's blueprint from one path. **Each application's own hub client secret** lives at `secret/apps/<app>/hub` (`HUB_CLIENT_ID`, `HUB_CLIENT_SECRET`) — its own path because `seed-secrets.sh` rewrites `.../env` whole from `.env.local` — minted by the hub via `seed-hub-clients.sh`; `doctor.sh` layer "sign-in hub (cont)" probes each against the token endpoint. |
| `authentik-tiles` (the directory's estate tile policy, decision 2026-10-29; namespace `authentik`, mounted by the Authentik server and worker) | `secret/apps/authentik-tiles/autorizare` + `secret/apps/openfga/env` (`OPENFGA_AUTHN_PRESHARED_KEYS` as `OPENFGA_TOKEN`) + `secret/apps/autorizare/hub` (`HUB_PERSON_LOOKUP_TOKEN`, the hub's own field) | `authentik-estate-tiles`: `autorizare.{OPENFGA_URL,OPENFGA_STORE_ID,OPENFGA_MODEL_ID,HUB_PERSON_LOOKUP_URL}`, `OPENFGA_TOKEN`, `HUB_PERSON_LOOKUP_TOKEN` | Declared per key in `pieces/platform-secrets/authentik-estate-tiles.yaml`. **Mounted OPTIONAL, on purpose, and asserted by no initContainer**: a tile must never hold the directory (every sign-in on the estate) down. Without it the policy shows no star tile and logs `MISSING REQUIRED SECRET: <key>`, and it is LOUD in `doctor.sh` three ways: the `authentik-tiles` row (ExternalSecret synced, every key present), the "Authentik star tiles" layer (the server pod's settings, the hub lookup and the engine answering under the pin), and the pin graded with the other pins. **`OPENFGA_MODEL_ID` is a PIN** (`CXE_SECRET_PINNED`), filled once by `seed_authentik_tiles` from the current release when its commit defines `app_autorizare_access`, moved afterwards only by `repin-model.sh`. **`HUB_PERSON_LOOKUP_TOKEN` is ONE value, TWO readers** (the hub and this Secret): 32 random bytes, hex, generated once and preserved through `--rotate`. |
| `autorizare` | `secret/apps/autorizare/{app,db,env,webhook,changelog}` + `secret/platform/authentik/autorizare-api-token` (`token` → `AUTHENTIK_API_TOKEN`, the MERGED instance, minted by CronJob `authentik-autorizare-token-reconcile`) + `secret/apps/openfga/env` + `secret/apps/autorizare/console-hub` (the console's client AT THE SIGN-IN HUB, minted by `seed-hub-clients.sh`; the console signs in through the hub, D23/D31) + the GENERATED `email-sender` (`secret/apps/autorizare/plunk` — Polaris's own sender, for organisation invitations, LMN-68) | `app.{DATABASE_URL,DB_APP_PASSWORD}`, `db.{username,password}`, `env.OPENFGA_STORE_ID`, `platform/authentik/autorizare-api-token.token` (as `AUTHENTIK_API_TOKEN`), `webhook.{WEBHOOK_SEALING_KEY_ID,WEBHOOK_SEALING_KEY}`, `scim.{SCIM_TOKEN_SHA256,SCIM_TOKEN_PREVIOUS_SHA256,SCIM_TOKEN_PREVIOUS_UNTIL}`, `openfga/env.OPENFGA_AUTHN_PRESHARED_KEYS` (as `OPENFGA_TOKEN`), `console-hub.{HUB_CLIENT_ID,HUB_CLIENT_SECRET}` (as `OIDC_CLIENT_ID`/`OIDC_CLIENT_SECRET`), `changelog.CHANGELOG_API_KEY`, `email-sender.{EMAIL_API_URL,EMAIL_API_KEY,EMAIL_FROM,EMAIL_FROM_NAME}`, `platform/talk/webhook.token` (as `NOTIFY_TOKEN`) | The authorization CONTROL plane. `internal/config/config.go` requires TWENTY-ONE settings and refuses to start without any one of them, by name — a partially configured authorization service is worse than one that will not start, because it answers and the answers are wrong. **Nine of the nineteen are NOT secrets** and live in `base/configmap.yaml` (ENVIRONMENT, DIRECTORY_TENANT, ESTATE_DOMAIN, CHANGELOG_URL, OPENFGA_ADMIN_URL, OIDC_ISSUER_URL, OIDC_REDIRECT_URL, AUTHENTIK_API_URL, APP_URL), pinned in git so a change to an issuer is visible in review; the initContainer asserts all twenty-one regardless, reading the ConfigMap and the Secret through the same `envFrom`. **SIX OpenBao paths, not one**, because a path is the unit of rotation and of policy: `AUTHENTIK_API_TOKEN` can MINT credentials (@rule MACH-1 / D12) and must not rotate on the schedule of an ordinary env key. **TWO of the keys are SLOTS no script can generate** — see below. The webhook sealing key is the one value here the service stores and reads BACK (@rule WHK-11); it is generated, and on its own path because `bao kv put` replaces a whole path and sharing `.../env` would blank the store id on a re-seed. **The SCIM credential (B4)** is ONE static bearer token for the whole directory sync, held by the service as its SHA-256 only (`scim.SCIM_TOKEN_SHA256`); the plaintext lives at `secret/platform/authentik/autorizare-scim` (`token`) for the directory. The two PREVIOUS fields are always present, EMPTY outside a roll; `seed-secrets.sh --rotate` rolls with a one-day overlap and `doctor.sh` checks the hash shape and a stale roll. **The estate changelog key** (`changelog.CHANGELOG_API_KEY`) is the changelog service's ONE global, non-admin key, named `estate-hub`: every bar's bell reads through Polaris, so no browser ever holds it. Only the changelog service can mint it, so `seed-changelog-hub.sh` (called by `seed-secrets.sh`) runs the service's own `estate` command inside its pod — creating the five application tenants idempotently and issuing the key only when the path is empty, or on `--rotate`, which revokes the previous key in the same transaction. `CHANGELOG_URL` is in-cluster `http`, the one non-https address `config.go` admits besides loopback. **The pager (2026-10-27, owner decision D1, audit PA3):** `NOTIFY_TOKEN` is the SEND-ONLY bearer of the estate Talk translator (`talk-webhook`), the same path every in-cluster notifier reads; `NOTIFY_URL` (in-cluster, `http://talk-webhook.nextcloud.svc`) is plain ConfigMap env. Both required: break-glass pages #security the moment a window opens, and an elevation nobody is told about is the backdoor AUTZ-6 forbids. Declared per key, asserted by `assert-secrets`, listed in `doctor.sh`'s row. No new seed. **The mail sender (LMN-68; the e-mail migration plan (first estate's history, not shipped) step 4):** organisation invitations are EMAILED with a single-use, expiring link, from Polaris's OWN declared sender (`gitops/services/plunk/senders/polaris.json`, `noreply@polaris.<apex>`) through `rmx.eu/platform/email`; the four `EMAIL_*` keys come from the GENERATED `email-sender` (envFrom on all three containers), asserted by `assert-secrets`, listed in `doctor.sh`'s row `autorizare-mail`, and `internal/architecture/secrets_test.go` accepts a required key from it only when the pod mounts it; an email the provider refuses leaves the invitation standing and is recorded as `invitation.email` with outcome `failed`. |

**`k3s-datastore-copy`** (not an app, one row because it follows the same schema): `secret/platform/object-storage/<env>` → `k3s-datastore-s3` in `system-upgrade`, keys `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`. Declared per key, asserted by the `assert-secrets` initContainer, and `doctor.sh` fails when the Secret or the newest copy is absent or stale. No new seed: `seed-secrets.sh` already writes this path. A CronJob, so no Reloader annotation: each run reads the current value.

## Novu consumer keys — minted by Novu, captured by `novu-bootstrap.sh`

An API key and an application identifier do not exist until an organization exists
inside the running Novu, so no seeder can generate them. The estate has ONE Novu
organisation, "NorthwindCo", and one Development environment (decision D1,
2026-10-29, `docs/notificari/01-design.md`): every application's workflows (ids
prefixed `<app>-`) are served by ONE in-cluster bridge, `novu-bridge`
(`pieces/novu/base/bridge.yaml`) — an environment holds one bridge URL and
a sync deletes every workflow its bridge does not list.
`infrastructure/hetzner/scripts/novu-bootstrap.sh <env>` reconciles that
organisation (`novu-estate.sh` renamed the former "NorthwindCo BRS" in place and
retires any fixture-only other), reads its `Development` environment, and writes
the SAME estate key and application id into every consumer, ONLY these fields,
with `bao kv patch` (unchanged fields are not rewritten, so no needless
secret-watcher rebuild). `doctor.sh` checks every consumer holds exactly the
estate pair:

| Consumer | OpenBao path | Fields | Read by |
|-----|--------------|--------|---------|
| `novu-bridge` | `secret/apps/novu/estate` | `secret_key` (→ `NOVU_SECRET_KEY`, declared per key in the `novu-bridge` ExternalSecret, asserted by its `assert-secrets`), `application_id` (the record doctor compares the others with) | the estate's bridge: verifies Novu's HMAC on every call; the critical guard and the policy reader read Novu with it |
| `lmn-brs` | `secret/apps/lmn-brs/convex-env` | `NOVU_API_URL` (`https://novu-api.<apex>/v1`), `NOVU_SECRET_KEY` | `convex-lib/notificari` (triggers + subscriber and topic sync) |
| `lmn-brs` | `secret/apps/lmn-brs/env` | `NOVU_SECRET_KEY` | the pod: `app/api/novu/hmac` (the Inbox subscriber hash) and `app/api/novu/politica` (Orchid's organisation policy, `politica-orchid:<org>`) |
| `lmn-brs` | `secret/apps/lmn-brs/build` | `NEXT_PUBLIC_NOVU_APPLICATION_ID`, `NEXT_PUBLIC_NOVU_BACKEND_URL`, `NEXT_PUBLIC_NOVU_SOCKET_URL` | baked into the image (Inbox + Preferences) |
| `lmn-sign` | `secret/apps/lmn-sign/env` + `secret/apps/lmn-sign/convex-env` | `NOVU_API_URL`, `NOVU_SECRET_KEY` (and `NOVU_APP_ID` on the pod) | Quill notifies through `@rmx/notificari` (P4): the Convex functions trigger, the pod opens each person's Novu session and writes the organisation's policy. Required on both planes: declared per key in `lmn-sign-secrets` and asserted by `assert-secrets`; CI refuses a deploy without them. Written by `novu-bootstrap.sh`; the estate pair since 2026-10-29 |
| `lmn-invoice-svc` | `secret/apps/novu/estate` | `secret_key` (→ `NOVU_SECRET_KEY`, declared per key in its ExternalSecret and asserted by its `assert-secrets`; read from the estate's path, not copied) | the outbox's notification worker (`@rule NOTIF-1`) and the bell's session; `NOVU_API_URL` is plain env, in-cluster |
| `autorizare` | `secret/apps/novu/estate` | `secret_key` (→ `NOVU_SECRET_KEY`), `application_id` (→ `NOVU_APPLICATION_ID`), both declared per key in its ExternalSecret and asserted by its `assert-secrets`; read from the estate's path, not copied | the trail's notification worker (`@rule NOTIF-1`) and `NotificationService`, which serves the bell and the policy of Polaris, Nova and Brook; the Novu addresses are plain values in its ConfigMap |
| `nova` | `secret/apps/novu/estate` | `secret_key` (→ `NOVU_SECRET_KEY`), declared per key in its ExternalSecret and asserted by the worker's `assert-secrets`; read from the estate's path, not copied | the worker's notification sweep (`@rule NOTIF-1`); `NOVU_API_URL` is plain env in the worker's Deployment |
| `flow-engine` | `secret/apps/flow-engine/convex-env` | `CRON_WATCH_KEY`, `NOVU_API_URL`, `NOVU_SECRET_KEY` (written by `novu-bootstrap.sh`; the deploy refuses without them) | `convex/notificari.ts`; the bell and the policy go through Polaris's `NotificationService` |
| `lmn-invoice-svc` | `secret/apps/novu/estate` | `secret_key` (→ `NOVU_SECRET_KEY`), `application_id` (→ `NOVU_APPLICATION_ID`), both declared per key in its ExternalSecret and asserted by its `assert-secrets`; read from the estate's path, not copied | the outbox's notification worker (`@rule NOTIF-1`) and the bell's session; `NOVU_API_URL` is plain env, in-cluster |

The same values are written into each app's `.env.local` (the operator's source of
truth: `seed-secrets.sh` reconciles `/env` and `/build` from it, so leaving it stale
would revert OpenBao on the next seed). Both `/build` and `/convex-env` are already
in the secret-watcher CI map, so a changed key rebuilds `lmn-brs.yml` by itself;
`secret/apps/novu/estate` is read through ESO (a k8s consumer), so it needs no CI
map entry, and `novu-bootstrap.sh` forces that ExternalSecret to refresh when it
writes a new key.

## The two slots: `OPENFGA_STORE_ID` and `AUTHENTIK_API_TOKEN`

Every other required key in this document is either copied from a `.env` or
generated by `seed-secrets.sh`. These two are neither, and generating them would be
worse than leaving them absent: a random string syncs cleanly, passes the
ExternalSecret, passes the initContainer, and then fails at the first write against
a store that does not exist or with a 403 that reads like a permissions bug.

They are therefore seeded as **EMPTY SLOTS** — the field exists, with no value — by
`seed_slot` in `seed-secrets.sh`, which WARNS on every run until the slot is filled
and prints the command that fills it. An empty field rather than an absent one is
deliberate and matches the Convex `admin_key` and ReportPortal `ci.api_token`
precedents: the path's full shape is visible in `bao kv get`, and `doctor.sh` can
report "minted but not captured yet" rather than "unknown".

| Slot | Filled by | Command |
|------|-----------|---------|
| `secret/apps/autorizare/env` → `OPENFGA_STORE_ID` | creating the environment's ONE store against OpenFGA's admin port (@rule D11) | `infrastructure/hetzner/scripts/autorizare-bootstrap.sh <env>` — idempotent: it reuses a store already named `autorizare-<env>` rather than creating a second one, verifies a recorded id still resolves, and writes back with `kv patch` |
| `secret/platform/authentik/autorizare-api-token` → `token` | minting a service-account token in the one Authentik — **only Authentik can**; the `authentik-autorizare-token-reconcile` CronJob does it as code | `kubectl -n authentik create job --from=cronjob/authentik-autorizare-token-reconcile autorizare-token-now` |

`doctor.sh` checks both twice over: once in the generic app-secrets table (which
would tell you to run `seed-secrets.sh`, and for these two that is the WRONG remedy
— it creates the empty slot and warns), and once in the "authorization planes"
layer, which prints the command that actually fills each one.

## Three places, ONE list — and the check that keeps them agreeing

The fail-loud contract for `autorizare` is stated in three languages: the
ExternalSecret's `data[]` plus the ConfigMap, the `assert-secrets` initContainer's
assertions, and `config.go`'s `required` slice. Nothing at RUNTIME can see them
disagree — a key dropped from the initContainer still syncs, still starts, and
simply stops being asserted. The guard goes QUIET instead of going off.

The list could not be made a single source: a manifest cannot read a Go slice, and
these services are Kustomize rather than Helm precisely so there is no templating
layer to generate one from the other. So it is a **comparison** instead:

```bash
infrastructure/hetzner/scripts/check-secret-schema.sh
```

It fails naming the key AND the place it is missing from, refuses to run if any of
its four extractions comes back empty (a parser that reads nothing turns the whole
check into a tautology), and is run by `doctor.sh` on every sweep. Its own
behaviour is proven by `scripts/tests/schema-drift.test.sh`, which breaks each of
the three sources in turn — a comparison nobody has watched fail is indistinguishable
from one that always returns true.

## The webhook signing secret is ONE secret with TWO names (now: per consumer)

`browse-api` signs every outgoing webhook with `WEBHOOK_SIGNING_SECRET`;
`lmn-sign` verifies it with `BROWSERUSE_WEBHOOK_SECRET`. **They must hold the same
value.** Unlike the other required keys, presence is not sufficient — a mismatch is
just as broken as an absence.

**This pairing hazard now generalizes per consumer.** The runner signs each task's
webhook with the `webhook_secret` of the consumer that CREATED that task (default
consumer → `WEBHOOK_SIGNING_SECRET`, unchanged; an extra consumer → its own
`webhook_secret` from `BROWSERUSE_EXTRA_CONSUMERS`, see above) — so every consumer
app must hold the matching value for ITS OWN pairing check to mean anything. The
lmn-sign ⟷ runner check below covers ONLY the default consumer's pair; it is
UNCHANGED by this work and still the one enforced by `doctor.sh`/`seed-secrets.sh`
today. Each future consumer must add its OWN equivalent doctor/seed pairing check
when its app lands (deliberately not written here — that app doesn't exist yet and
is owned by a separate change), following this same pattern: compare the runner's
per-consumer secret against that app's verifier secret, fail loud on absence
*or* mismatch, never just presence.

Failure is quiet rather than loud, which is why it needs its own check:

| State | What lmn-sign does | What you see |
|---|---|---|
| lmn-sign key absent | 500 on every callback (deliberate: no credential to judge with) | orders advance only via the 5-min watchdog |
| runner key absent | sends UNSIGNED; lmn-sign 401s | same |
| values differ | signature check fails; 401 | same |

In all three cases automation still *works* — it is simply up to 5 minutes late on
every status change, which reads as "slow" rather than "broken". `doctor.sh` compares
the two rendered Secrets (never printing either) and `seed-secrets.sh` compares the two
OpenBao fields after seeding.

Both paths are seeded wholesale from their app's `.env.local` via `seed_envfile`, and
`seed_from_env` **replaces an entire path** — so the value is set in the two
`.env.local` files, not written field-wise by the seeder. Keep them identical.

> Historical note: an earlier comment in `gitops/services/lmn-sign/base/externalsecret.yaml`
> instructed operators NOT to seed `BROWSERUSE_WEBHOOK_SECRET`, because the self-hosted
> runner did not sign at the time. The runner signs now, so that advice inverted — an
> operator following it disables webhook delivery entirely.

## Seeding completeness

`seed-secrets.sh` seeds the changelog database OWNER (`seed_user_pass
secret/apps/changelog/db changelog`); the `changelog-db` ExternalSecret composes
BOTH `DATABASE_URL` and `DATABASE_DIRECT_URL` from it, so neither can be missing
while the other is present — the 2026-06-19 `P1012` Init CrashLoop (only one URL
seeded) can no longer happen. `secret/apps/changelog/env` is read by nothing since
2026-10-22; it keeps the legacy Neon URLs for the pending import. When adding a new
required key, follow the checklist below so the seed never falls behind the
ExternalSecret `data[]`.

## Build-time variables — `secret/apps/<app>/build`

Runtime env is only half the chain: Next.js apps also inline `NEXT_PUBLIC_*` at
**build** time (`docker build --build-arg`). Those values are as-code too:

- **`secret/apps/<app>/env`** — RUNTIME keys, synced to the pod by ESO (above).
- **`secret/apps/<app>/build`** — BUILD-time keys, pulled by the app's CI
  workflow (`.github/workflows/<app>.yml`) via GitHub OIDC → OpenBao
  (`hashicorp/vault-action`) right before `docker build`.
- **GitHub repo UI variables (`${{ vars.* }}`) are BANNED for app config** — a UI
  variable is invisible to git, unreproducible on rebuild, and diverges silently.
  The only GitHub-side values allowed in workflows are GitHub-infra ones
  (`GITHUB_TOKEN`, event context).

Fail-loud contract (mirrors the runtime guards): `vault-action` FAILS the job if
the path/field is absent in OpenBao, and a preflight step right after the pull
asserts every key is non-empty — `MISSING BUILD VAR: <key>` — before any build
minutes are spent. Keys are seeded by `seed-secrets.sh`; `doctor.sh` checks the
paths read-only.

| App | OpenBao path | Build keys |
|-----|--------------|-----------|
| `lmn-sign` | `secret/apps/lmn-sign/build` | `NEXT_PUBLIC_CONVEX_URL`, `NEXT_PUBLIC_REGISTRATION_OFFICER_EMAIL`, `NEXT_PUBLIC_NOVU_APPLICATION_ID`, `NEXT_PUBLIC_NOVU_BACKEND_URL`, `NEXT_PUBLIC_NOVU_SOCKET_URL` |
| `lmn-brs` | `secret/apps/lmn-brs/build` | `NEXT_PUBLIC_CONVEX_URL`, `NEXT_PUBLIC_NOVU_APPLICATION_ID` |

(Env-derived build values — `NEXT_PUBLIC_APP_URL`/`NEXT_PUBLIC_URL` — stay
committed workflow literals: they are derived from the branch/PR, not config.)

Adding a build key: add it to the workflow's `vault-action` `secrets:` list AND
its preflight loop, seed it in `seed-secrets.sh` (`secret/apps/<app>/build`), and
add it to the `BUILD_VAR_SPECS` table in `doctor.sh`.

## Adding a new required key

1. Add it to the app's ExternalSecret `data[]` (`base/externalsecret.yaml`).
2. Add it to the `assert-secrets` initContainer key list (`base/deployment.yaml`).
3. Add the row here and ensure it is seeded by `seed-secrets.sh`.
4. `doctor.sh` picks it up automatically from the per-app required-key table.
5. For `autorizare`, also add it to `config.go`'s `required` slice and to that
   app's `doctor.sh` row — then run
   `infrastructure/hetzner/scripts/check-secret-schema.sh`, which compares all
   three statements of the list and fails naming whichever one you missed.

## Secret rotation — the Reloader annotation (`reloader.stakater.com/auto`)

The fail-loud contract above covers a secret that is **missing**. This section covers a
secret that **changed** — the other half of the chain, and the quieter failure.

Rotation is `OpenBao → ESO (polls, rewrites the k8s Secret) → Stakater Reloader
(restarts the annotated workloads) → new value live`. See
`gitops/apps/overlays/dev/reloader.yaml` for the controller. The hinge is the annotation:
Reloader only touches workloads that opt in.

### Why env vs. volume is the whole distinction

| How the Secret reaches the process | Refreshed on rotation? | Needs the annotation? |
|---|---|---|
| `envFrom[].secretRef` / `env[].valueFrom.secretKeyRef` | **No** — env is read once at process start | **YES** |
| `volumes[].secret` + `volumeMounts` | Yes — the kubelet rewrites the mounted files in place | No |
| Read via the k8s API at use time | Yes — the read happens after the change | No |
| Reconciled into the app's own database | Yes — by its reconciler, not by a restart | No |

An **env** consumer without the annotation is the silent half-rotation: the k8s Secret
updates, ESO reports `SecretSynced`, `kubectl get secret` shows the NEW value — and the
pod keeps serving the OLD one indefinitely, with no error anywhere. Nothing in the
ExternalSecret/initContainer guards above catches it, because nothing is missing.

### The rule

Any `Deployment`/`StatefulSet`/`DaemonSet` injecting a Secret as env MUST set:

```yaml
metadata:                       # the WORKLOAD's own metadata — NOT spec.template.metadata
  annotations:
    reloader.stakater.com/auto: "true"
```

Reloader reads the annotation from the **parent object**, so a pod-template annotation is
silently ignored. For Helm components that means the chart's **`deploymentAnnotations`**
key (component-scoped on umbrella charts, e.g. `server.deploymentAnnotations`) — **not
`podAnnotations`**. Verify against the chart's real values schema; the two keys look
interchangeable and are not.

**Escape hatch:** `reloader.stakater.com/auto: "false"` is an explicit opt-out that
Reloader honours and the policy accepts (it requires only a non-empty value). A workload
that genuinely must not auto-restart declares `"false"` **with a comment explaining why**
— the exception then lives in git, reviewable, instead of the guard being weakened.

### Exemptions (they fall out of the mechanism, they are not a maintained list)

Because both guards key on the **env reference**, these never match and need no entry
anywhere: `authentik-postgresql`, the `tailscale` operator, `velero` + `node-agent`
(volume mounts); `cert-manager` (reads the Cloudflare token via the k8s API at
certificate-issuance time). `harbor` is namespace-excluded for a different reason — its
OIDC config is stored in Harbor's own Postgres and reconciled by
`pieces/platform-secrets/harbor-oidc-reconcile.yaml`, so a pod restart is not the update
mechanism; `argocd` and the `kube-*` namespaces are excluded as components whose
templates this repo does not own.

### Enforcement

- **Admission:** Kyverno ClusterPolicy `require-reloader-annotation`
  (`pieces/kyverno-policies/require-reloader-annotation.yaml`). A **validate** rule, not a
  mutate one — Kyverno adding the annotation itself would create live cluster state
  present nowhere in git, violating the No-drift HARD RULE. Ships in **Audit**; flip to
  **Enforce** once PolicyReports are clean.
- **Runtime:** `doctor.sh` layer *"secret rotation (Reloader annotation)"* cross-references
  every ExternalSecret's target Secret against the workloads consuming it via env and
  fails on any that lack the annotation. Its exempt-namespace list mirrors the policy's —
  **keep the two in sync**.

Adding a new app: put the annotation in `base/deployment.yaml` from day one, next to the
`alerts.northwind.example/owner` one (see `gitops/services/changelog/base/deployment.yaml`).

## Change detection — the `secret-watcher` (OpenBao change → the right action)

Rotation only ever worked automatically on ONE of the three planes a secret can land
on. The other two were inert until a human remembered:

| Where the value ends up | Reaches the running system by | Automatic before? |
|---|---|---|
| k8s Secret → pod env / volume | ESO rewrites the Secret (30s app / 1h platform refresh), Reloader restarts annotated workloads | **Yes** |
| Image layer (`secret/apps/<app>/build`, `docker build --build-arg`) | a CI **rebuild** — the value is baked in | **No** |
| Convex deployment env (`secret/apps/<app>/convex-env`, `convex env set`) | a CI **run** after `convex deploy` | **No** |

A `workflow_dispatch` fired only when `seed-secrets.sh` itself performed the write
(`dispatch_ci()`). A direct `bao kv put`/`kv patch`, or an edit in the OpenBao UI,
changed the value and **nothing happened** (verified 2026-08-18: direct patches to
both CI-consumed paths triggered zero Actions runs).

`gitops/platform/openbao/secret-watcher.yaml` (CronJob, `*/5`, ns `openbao`) closes
that gap.

### Detection is polling — there is no alternative

OpenBao has **no event system**: Vault's `sys/events/subscribe` was never carried
into the fork (upstream issue #553, closed unimplemented; a code search of v2.5.4
returns 0 hits for `events/subscribe` and 0 for `EventBus`). The primitive is
`secret/metadata/<path>` → `current_version`, which increments on **every** write and
is **write-source-agnostic** — a UI edit is caught exactly like a script run — and
returns **no secret material**. The watcher never reads a secret VALUE: its OpenBao
grants are `read`+`list` on `secret/metadata/*`, its own state path, and the GitHub
PAT (policy `secret-watcher` in `openbao-bootstrap.sh`); its k8s RBAC has no access
to `secrets` at all.

### Consumers are DISCOVERED, not registered

There is no hand-kept path→consumer registry, because the cluster already declares it:

- every ExternalSecret names its source in `.spec.data[].remoteRef.key` and
  `.spec.dataFrom[].extract.key` → OpenBao path → k8s Secret;
- every workload names the Secrets it consumes via `envFrom[].secretRef`,
  `env[].valueFrom.secretKeyRef` and `volumes[].secret` → k8s Secret → workload.

So each tick the watcher recursively LISTs `secret/metadata/{apps,platform}` (a new
secret is picked up automatically, nothing to add anywhere), diffs each leaf's
`current_version` against `secret/platform/automation/watcher-state`, and for every
CHANGED path:

1. **Referenced by an ExternalSecret** → stamps `force-sync=<ts>` on it (the
   documented pattern, RUNBOOK 2026-06-19) so ESO re-syncs **now** instead of at the
   end of its refresh interval, then logs which workloads consume the target Secret
   and whether they will actually restart (env + Reloader-annotated) or refresh in
   place (volume mount).
2. **In the CI map** → one `workflow_dispatch` on this env's branch (branch ==
   environment, 1:1).
3. **Neither** → a loud `WARN no-consumer <path>` line. That is a real finding, not
   noise (see below).

### The CI map — the ONE thing that must be declared by hand

Nothing in the cluster records that a value is baked into an image or pushed to the
Convex plane, so this mapping cannot be discovered:

| OpenBao path | Workflow dispatched |
|---|---|
| `secret/apps/lmn-brs/build` | `.github/workflows/lmn-brs.yml` |
| `secret/apps/lmn-brs/convex-env` | `.github/workflows/lmn-brs.yml` |
| `secret/apps/lmn-brs/flow-engine` | `.github/workflows/lmn-brs.yml` |
| `secret/apps/lmn-brs/facturare` | `.github/workflows/lmn-brs.yml` |
| `secret/apps/lmn-brs/autorizare` | `.github/workflows/lmn-brs.yml` |
| `secret/apps/lmn-sign/flow-engine` | `.github/workflows/lmn-sign.yml` |
| `secret/apps/lmn-sign/autorizare` | `.github/workflows/lmn-sign.yml` |
| `secret/apps/lmn-sign/build` | `.github/workflows/lmn-sign.yml` |
| `secret/apps/lmn-sign/convex-env` | `.github/workflows/lmn-sign.yml` |
| `secret/apps/flow-engine/convex-env` | `.github/workflows/flow-engine.yml` |
| `secret/apps/flow-engine/autorizare` | `.github/workflows/flow-engine.yml` |
| `secret/apps/flow-engine/env` | `.github/workflows/flow-engine.yml` |

It lives in **three** places that must stay in sync — the `ci-map` in
`estate/openbao/secret-watcher-config.yaml` (the estate's table; the platform's
watcher ships the mechanism with an empty one), `WATCHER_CI_SPECS` in `doctor.sh`, and
this table. `infrastructure/hetzner/scripts/tests/model-pin.test.sh` DERIVES the set
from the workflows (every path whose value is `convex env set` or passed as a
`--build-arg`) and fails when any of the three misses one. It was written after
2026-10-27, when `flow-engine/autorizare` was absent from all three: the model
pins were moved in OpenBao, Orchid and Quill were rebuilt, and Brook's deployment
kept the old pin until a person applied it (RUNBOOK). Move a pin with
`scripts/repin-model.sh`, never with a bare `bao kv patch`. **A new CI-consumed secret path MUST be added to the map in the same
change** (HARD RULE in `infrastructure/hetzner/CLAUDE.md`) — otherwise its value
changes and the deployed image keeps the old one, silently.

### `no-consumer` is a finding, not noise

A changed secret that no ExternalSecret references and that is not in the CI map
reaches nothing automatically. Today's known members of that class — all legitimate,
all reported by `doctor.sh` as **WARN**, never FAIL:

- `platform/test-reports/ingest` — **deliberately NOT in the CI map.** It is a
  use-time OIDC read (the lmn-brs CI job pulls it per run, right before it POSTs the
  report), not a value baked into an image or pushed to the Convex plane, so a
  changed value is picked up by the very next run with nothing to dispatch. It IS
  referenced by an ExternalSecret on the cluster side, so branch 1 above handles the
  service end; adding it to the CI map would fire a pointless rebuild.
- `platform/harbor/ci-robot`, `platform/github/token` (where not ESO-synced),
  `platform/neon/api` — read by CI **at use time** through OIDC→OpenBao, so every run
  already gets the current value: nothing to do.
- `apps/<app>/convex` (the Convex deploy key) — same, read by the workflow at deploy
  time.
- `apps/reportportal/ci` (the ReportPortal API key CI imports launches with) — same
  class: a use-time OIDC read, pulled per run right before the JUnit import, so a
  changed value is live on the very next run. It has no ExternalSecret because
  nothing in the cluster consumes it — only CI does — so `no-consumer` is the
  CORRECT report here, not a defect. Adding it to the CI map would fire a
  pointless rebuild. ⚠️ Since 2026-08-20 this path also has an in-cluster WRITER
  (the `reportportal-config-reconcile` CronJob mints and stores a replacement key
  when the slot is empty or the stored one stops authenticating), so a
  `current_version` bump here can originate inside the cluster rather than from a
  human `bao kv patch`. It still has no in-cluster READER, so the report is
  unchanged.
- `apps/novu/admin` — the Novu dashboard's first account (email + INITIAL password).
  Read only by `infrastructure/hetzner/scripts/novu-bootstrap.sh` (to log in and
  re-capture the app keys) and by a human logging into the tailnet dashboard. Nothing
  in the cluster consumes it and nothing is baked from it, so `no-consumer` is the
  CORRECT report. Changing it changes nothing in Novu either: Novu owns the password
  once the account exists (see the `novu` row above).
- `apps/_permtest` — a leftover permission-test path; a genuine candidate for deletion.

Anything else appearing here means an **undiscovered consumer** (a hardcoded literal,
a laptop `.env.local`, a manual script) or a dead secret. Investigate with
`grep -rn '<path>' gitops/ .github/`, then either wire the consumer, add it to the CI
map, declare its reader below, or list it for retirement below.

### Declared readers

Every OpenBao path with no ExternalSecret and no CI-map entry, and who reads it.
`doctor.sh` reads THIS table (`scripts/lib-secret-readers.sh`): a declared path is
printed as `[--]` with its reader, a `retire` row is ONE warning naming every path
awaiting the owner, and only a path in none of these is an unexplained warning.
Added 2026-10-29, when doctor named 56 such paths (RUNBOOK). Kinds: `use-time` (a
script, workflow or test reads it when it runs — the reader column names a file
that contains the path, and `tests/secret-readers.test.sh` fails when it does not),
`manual` (a person reads it), `outside` (consumed outside this cluster — the Fern
estate; Fern is out of this estate's scope, listed, not judged), `retire` (nothing
reads it; **deleting it is the owner's call** — data destruction — evidence in the
row). Plunk senders declared with `"wire": false` in `gitops/services/plunk/senders/`
are derived, not listed: their keys are provisioned ahead of a consumer that is
declared and not wired yet.

| Path | Kind | Reader | Why / evidence |
|---|---|---|---|
| `secret/apps/autorizare/e2e` | use-time | `.github/actions/autorizare-journeys/action.yml` | the console journeys' person, pulled per run |
| `secret/apps/autorizare/e2e-signin` | use-time | `.github/actions/autorizare-journeys/action.yml` | sign-in journeys robot, an ordinary member of the journeys tenant (`lib-journeys-tenant.sh`) |
| `secret/apps/autorizare/e2e-revocabil` | use-time | `.github/actions/autorizare-journeys/action.yml` | sign-in journeys robot whose listing UI-SIGNIN-06 removes and restores |
| `secret/apps/autorizare/e2e-strain` | use-time | `.github/actions/autorizare-journeys/action.yml` | sign-in journeys robot listed nowhere, the person the console refuses |
| `secret/apps/autorizare/e2e-o-firma` | use-time | `infrastructure/hetzner/scripts/lib-authentik.sh` | organisation robot, a right in one company of several |
| `secret/apps/autorizare/e2e-admin-org` | use-time | `infrastructure/hetzner/scripts/lib-authentik.sh` | organisation robot, administers with no right in a company |
| `secret/apps/autorizare/e2e-inregistrare` | use-time | `infrastructure/hetzner/scripts/lib-authentik.sh` | organisation robot, registers its own company on an invitation |
| `secret/apps/autorizare/e2e-auditor` | use-time | `.github/actions/autorizare-journeys/action.yml` | the auditor journeys' person, pulled per run |
| `secret/platform/kubernetes/admin-kubeconfig` | use-time | `infrastructure/hetzner/scripts/lib-headscale.sh` | the certificate-based admin kubeconfig, `route` and `public` forms (base64). Written and read by `headscale-kubeconfig.sh`, judged by doctor: ladder paths 2b and 4 in BREAK-GLASS.md |
| `secret/apps/novu/admin` | use-time | `infrastructure/hetzner/scripts/novu-bootstrap.sh` | the dashboard's first account, to re-capture the app keys |
| `secret/apps/reportportal/ci` | use-time | `infrastructure/hetzner/scripts/doctor.sh` | an estate's CI launch import reads it at use time; written in-cluster by reportportal-config-reconcile, judged by doctor |
| `secret/platform/authentik/breakglass` | use-time | `infrastructure/hetzner/scripts/lib-authentik.sh` | the break-glass account's TOTP key, doctor/repair |
| `secret/platform/authentik/e2e-cititor` | use-time | `infrastructure/hetzner/scripts/lib-authentik.sh` | an e2e robot (AK_ROBOTS), the read-only person |
| `secret/platform/authentik/e2e-coleg` | use-time | `infrastructure/hetzner/scripts/lib-authentik.sh` | an e2e robot (AK_ROBOTS), the second person |
| `secret/platform/authentik/e2e-hub` | use-time | `infrastructure/hetzner/scripts/lib-authentik.sh` | an e2e robot (AK_ROBOTS), the hub's sign-in proof |
| `secret/platform/authentik/e2e-tools` | use-time | `infrastructure/hetzner/scripts/lib-authentik.sh` | an e2e robot (AK_ROBOTS), identitate gate 9 |
| `secret/platform/authentik/tiles-cache-api-token` | use-time | `infrastructure/hetzner/scripts/lib-retired-credentials.sh` | a retired credential's slot; doctor proves it stays blank |
| `secret/platform/harbor/ci-robot` | use-time | `.github/workflows/autorizare.yml` | every image build logs in to Harbor with it |
| `secret/platform/n8n/owner` | use-time | `infrastructure/hetzner/scripts/n8n-password-repair.sh` | n8n's owner's plain password; `n8n-sso-bootstrap.sh` and a person read it too. No pod holds it, so no ExternalSecret names it |
| `secret/platform/talk/channels` | use-time | `infrastructure/hetzner/scripts/talk-notify.sh` | room tokens for callers outside the cluster; occ-reconcile writes it |
| `secret/apps/qa/tobi-qa` | manual | a person | Tobi's QA sign-in (the account is migrated as a person, `gitops/platform/authentik/blueprints-people.yaml`) |
| `secret/apps/_permtest` | retire | — | permission/audit smoke leftovers (fields AUDIT_PROBE, probe, t, watcher_test); called dead since 2026-08-20 |
| `secret/apps/autorizare/scim` | retire | — | the hash of SCIM's bearer token; SCIM retired 2026-11-02 (audit PA15), no ExternalSecret reads it |
| `secret/platform/authentik/autorizare-scim` | retire | — | SCIM's bearer token, for a provider that never existed in the directory; SCIM retired 2026-11-02 |
| `secret/apps/autorizare/authentik` | retire | — | blanked (no fields); the retired business directory's token, "read by nothing since 2026-10-24" (seed-secrets.sh) |
| `secret/apps/autorizare/authentik-legacy` | retire | — | api_token + api_url of the retired directory, written 2026-10-22; nothing reads it — revoke the token, then delete |
| `secret/apps/autorizare/e2e-playwright-enrolled` | retire | — | superseded (the authorization work ledger (first estate's history, not shipped)); nothing reads it |
| `secret/apps/autorizare/e2e-playwright-revocable` | retire | — | nothing reads it; the address survives only as a literal in a Go test's arguments |
| `secret/apps/changelog/env` | retire | — | superseded 2026-10-22: the URLs are composed from apps/changelog/db (gitops/services/changelog/base/externalsecret.yaml) |
| `secret/platform/authentik/invoice-oidc` | retire | — | RUNBOOK: "no reader and no writer" once the invoice blueprint is green — soft-delete then |
| `secret/platform/authentik-business/autorizare-oidc` | retire | — | blanked; the business instance went on 2026-10-25 (seed-secrets.sh) |
| `secret/platform/authentik-business/bootstrap` | retire | — | blanked; the business instance went on 2026-10-25 |
| `secret/platform/authentik-business/brs-oidc` | retire | — | blanked; the business instance went on 2026-10-25 |
| `secret/platform/authentik-business/google-oauth` | retire | — | blanked; the business instance went on 2026-10-25 |
| `secret/platform/authentik-business/invoice-api-token` | retire | — | blanked; the business instance went on 2026-10-25 |
| `secret/platform/authentik-business/invoice-oidc` | retire | — | blanked; the business instance went on 2026-10-25 |
| `secret/platform/authentik-business/postgresql` | retire | — | blanked; the business instance went on 2026-10-25 |
| `secret/platform/authentik-business/redis` | retire | — | blanked; the business instance went on 2026-10-25 |
| `secret/platform/authentik-business/secret-key` | retire | — | blanked; the business instance went on 2026-10-25 |
| `secret/platform/authentik-business/sign-oidc` | retire | — | blanked; the business instance went on 2026-10-25 |

### Correctness properties (they exist for a reason)

- **State is a MERGE patch, never a put** — every tracked path is a field of the one
  `watcher-state` secret; a `kv put` would replace the whole path and wipe every
  other path's version.
- **First-run guard, per path** — a path with no recorded version is recorded WITHOUT
  acting, so the first tick (and every newly-added secret) never triggers a rebuild.
- **Dedupe + cap** — two changed paths of one app dispatch its workflow ONCE; at most
  5 dispatches per tick, and a truncation is logged loudly, never silent.
- **A failed action does not advance the state** — the next tick retries. A duplicate
  action beats a silently missed one.
- **A failed discovery is INCONCLUSIVE, never "no consumer"** — if the ExternalSecret
  list cannot be read, the watcher says so and keeps the old state.

### Verifying it

`doctor.sh` layer *"secret-watcher (OpenBao change -> rebuild/restart)"*: the CronJob
is scheduled and not suspended, every CI-consumed path's `current_version` still
matches the recorded one (a lag younger than 15 min is *pending*, older is a FAIL —
the rebuild never ran), and every secret with no discoverable consumer is named.

## Notification channels — `secret/platform/talk/{bot,channels}`

Platform notifications are posted into **Nextcloud Talk conversations** — one
conversation per channel: `infra`, `devops`, `gitops`, `security`, `tasks`, `tests`,
`secrets`.

`#security` and `#secrets` are deliberately different things. `#security` is a
**warning** channel: the `secret-watcher` posts there only when a tick finds a problem
or an unconsumed secret, and a clean tick is silent. `#secrets` is a **ledger**: one
message per write to OpenBao, naming the actor, the key NAMES and every destination
the value reaches. See "Who changed which key" below.

Two OpenBao paths, with deliberately different owners:

| Path | Field(s) | Written by | Read by |
|---|---|---|---|
| `platform/talk/bot` | `secret` (64 chars, generated) | `seed-secrets.sh` (`seed_generated`) | the occ reconcile CronJob (creates the bot with EXACTLY this value), `scripts/talk-notify.sh`, GitHub Actions via the `github-ci` OIDC role |
| `platform/talk/channels` | one field per channel, value = room token | the occ reconcile CronJob (`nextcloud-occ` OpenBao role) | anything that needs to resolve a channel NAME to a room token |

**Why two.** Talk's bot API keys its HMAC by BOT, not by room, so one bot covers
every channel and a per-channel secret would buy nothing while multiplying the
rotation surface. Room tokens, by contrast, are RANDOM and assigned by Nextcloud at
room-creation time — nothing can hardcode them, so the reconcile job republishes the
name→token map from Nextcloud's own database on every run. In-cluster callers can
read the same map from the `talk-channels` ConfigMap in the `nextcloud` namespace;
external callers (CI) read the OpenBao path.

**How a message is signed** (verified against Talk 24.0.4 on dev, 2026-08-19):

```
POST https://cloud.northwind.example/ocs/v2.php/apps/spreed/api/v1/bot/<ROOM_TOKEN>/message
  OCS-APIRequest: true
  X-Nextcloud-Talk-Bot-Random:    <>=32 chars of hex>
  X-Nextcloud-Talk-Bot-Signature: HMAC-SHA256(random ++ message, bot_secret) in hex
  {"message": "..."}
→ 201 Created
```

`scripts/talk-notify.sh` wraps exactly this so no caller hand-rolls the HMAC.

**Adding another channel:** add its name to `TALK_CHANNELS` on the occ reconcile
CronJob (plus a `DESC` case in the same script, and the matching entry in
`TALK_CHANNELS_EXPECTED` in `doctor.sh`). The job creates the room, adds the bot, and
republishes the token map — no new secret and no new OpenBao path.

## Who changed which key — the audit reporter (`#secrets`)

The `secret-watcher` above answers *"a path changed — what must happen?"*. It cannot
answer **who** or **which key**, and it must not: KV metadata carries only version and
timestamps (`bao kv metadata get` returns no author and no key names), so the only
place that information exists is the **audit device**, and reaching for the value
plane to get it would be the privilege regression the watcher's own rules forbid.

`gitops/platform/openbao/audit-notify.yaml` (+ `-app.yaml`, `-rbac.yaml`) closes that.
A single-replica Deployment in `openbao` follows `openbao-0`'s audit stream through
the k8s API (`pods/log?follow=true`, pinned by `resourceNames` to that one pod) and
posts one message per WRITE into `#secrets`:

```
[silviuiacobivfuture (oidc-3f9a1c22)] changed secret with keys [CLERK_SECRET_KEY, INTERNAL_API_KEY] at [apps/lmn-brs/env] (now v12)
→ RUNTIME · namespace [lmn-brs] · service [Deployment lmn-brs] — via ExternalSecret lmn-brs/lmn-brs-secrets (Secret lmn-brs-secrets)
```

- **Key NAMES only, never values.** OpenBao HMACs every value before it writes the
  entry (`"CLERK_SECRET_KEY":"hmac-sha256:3d8b…"`), so the plaintext is not on the
  stream at all. The reporter posts neither the value nor the HMAC.
- **Writes only.** `type == "response"` (each operation emits a `request` twin too —
  keying off one is what stops double-posting), `operation` in
  `create`/`update`/`patch`/`delete`, path under `secret/data/` or `secret/metadata/`.
  ESO's ~70k reads/day and the watcher's ~18k metadata reads/day are never reported.
  `platform/automation/*` is muted — machine bookkeeping, same exclusion the watcher
  applies to its own state.
- **A `secret/metadata/` delete IS reported**, as `warn`: it destroys every version.
  It carries no `request.data`, so the message says so rather than showing no keys.
- **Destinations are a UNION, never a pick.** Three sources: the plane implied by the
  path leaf (`/env` → RUNTIME, `/build` → BUILD, `/convex-env` → CONVEX, `/convex` →
  the deploy key), every ExternalSecret that references the path, and the CI map. A
  path routinely hits several — `platform/talk/webhook` feeds **four** ExternalSecrets
  in `argocd`, `nextcloud`, `observability` and `openbao`, and one write to it lands
  in all four. Reporting a single destination there would be actively misleading.
- **It has no `secrets` RBAC at all**, in any namespace, with any verb — same rule as
  the watcher. Read-only on `externalsecrets` (no `patch`; it reports, it never
  force-syncs) and on Deployments/StatefulSets/DaemonSets, plus `pods/log` on
  `openbao-0`.
- **It requires the audit device**, which is declared in
  `gitops/apps/overlays/dev/openbao.yaml` (OpenBao 2.5.4 refuses `bao audit enable`
  over the API). Enabling it needs a one-time `openbao-0` restart, and a failing audit
  device stops OpenBao serving — read the RUNBOOK 2026-08-20 entry before touching it.

## Alert-owner annotation (`alerts.northwind.example/owner`)

Every long-running (`Deployment`/`StatefulSet`) and scheduled (`CronJob`) workload
MUST carry a `alerts.northwind.example/owner` annotation declaring its alert route (an email
or team handle). This pairs the **external** Axiom failure monitors
(`infrastructure/hetzner/modules/axiom/monitors.tf`: workload crashloop/OOM,
CronJob/backup failed, CI build failed) with a named owner — a crash or a dead backup
has a recipient, not just a fired monitor.

- Enforced by the Kyverno `require-alert-annotation` ClusterPolicy
  (`pieces/kyverno-policies/require-alert-annotation.yaml`). It ships in **Audit** mode
  (PolicyReports list un-annotated workloads); flip to **Enforce** once every app
  workload carries it.
- Set it on the workload's pod-owner metadata, e.g.:
  ```yaml
  metadata:
    annotations:
      alerts.northwind.example/owner: ops@northwind.example
  ```
- Excluded namespaces match the other baseline policies (system/platform Helm components
  we do not own the templates for).
