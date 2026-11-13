# psi's app secrets

> `eqsync-web` is retired (2026-11-12, owner's order) and not deployed: its rows below are kept for revival only, and its keys are not required anywhere. See `apps/eqsync-web/DEPRECATED.md`.

The estate's addendum to `gitops/services/APP-SECRETS.md` (same contract, same columns): the
keys psi's own services cannot start without, where they live in OpenBao, and how the
failure is made loud.

| App | OpenBao path | Required keys | Evidence |
|-----|--------------|---------------|----------|
| `chroma` | `secret/apps/chroma/env` | `CHROMA_SERVER_TOKEN` (64 lowercase hex) | Declared per-key in `gitops/services/chroma/base/externalsecret.yaml` (missing ⇒ `SecretSyncedError`). The `assert-secrets` initContainer refuses an empty, short or non-hex token (`MISSING REQUIRED SECRET: CHROMA_SERVER_TOKEN`), because an empty token would let a request with no token through the auth sidecar. Seeded once with `openssl rand -hex 32`; never echoed. |
| `psizone-web`, ~~`eqsync-web`~~ (retired 2026-11-12, not deployed), `hemisync-web`, `blog-web` | `secret/apps/chroma/env` | `CHROMA_SERVER_TOKEN`, read as `CHROMA_API_KEY` | Declared per-key in `gitops/services/<site>/base/externalsecret.yaml` (Secret `<site>-env`; missing ⇒ `SecretSyncedError`). The `assert-secrets` initContainer exits `MISSING REQUIRED SECRET: CHROMA_API_KEY` on an empty value. `CHROMA_URL=http://chroma.chroma.svc:8000` is plain env in the Deployment. The knowledge store (`packages/knowledge`) sends it as `Authorization: Bearer`. |
| `psizone-web`, ~~`eqsync-web`~~ (retired 2026-11-12, not deployed), `hemisync-web`, `blog-web` | `secret/apps/<site>/env` | `OPENROUTER_API_KEY` | psi's OpenRouter key (embeddings `openai/text-embedding-3-small`, answers `xiaomi/mimo-v2.6-flash`; the key's privacy setting is data_collection deny). Declared per-key in the site's `externalsecret.yaml`; the `assert-secrets` initContainer exits `MISSING REQUIRED SECRET: OPENROUTER_API_KEY` on an empty value. One value under each site's path, written by the operator. |
| `scheduling-backend` | `secret/apps/scheduling/env` | `INSTANCE_NAME`, `INSTANCE_SECRET` (64 lowercase hex) | The scheduling store, the self-hosted Convex backend (`gitops/services/scheduling-backend`, in-cluster only, no Ingress; `docs/plans/scheduling.md` S2). Declared per key in `scheduling-backend-env` (missing ⇒ `SecretSyncedError`); the `assert-secrets` initContainer exits `MISSING REQUIRED SECRET: <key>` and refuses a non-hex or short secret (a blank one would make the image generate its own on the volume). Seeded once with `openssl rand -hex 32`; never echoed. Do not rotate in place: the admin key derives from both. |
| `scheduling-deploy` | `secret/apps/scheduling/admin` + `secret/apps/scheduling/env` | `admin.CONVEX_SELF_HOSTED_ADMIN_KEY`, `env.PSI_SCHEDULING_KEY` (32+ chars; `openssl rand -hex 32`) | The Job that deploys the Convex functions (`gitops/services/scheduling-deploy`, PostSync). The admin key is DERIVED from `INSTANCE_NAME` + `INSTANCE_SECRET` by the running backend (`generate_admin_key.sh`), never chosen: written once with no echo (packages/scheduling/README.md, Deploying). Declared per key in `scheduling-deploy-env`; the `assert-secrets` initContainer exits `MISSING REQUIRED SECRET: <key>`. The Job sets `PSI_SCHEDULING_KEY` inside the Convex deployment from the same value. |
| `scheduling-backend` (database) | `secret/apps/scheduling/db` | `username` (`scheduling`), `password` (URL-safe, 24+; `openssl rand -hex 24`) | The scheduling store's Postgres owner (`gitops/services/scheduling-backend/base/db-externalsecret.yaml`, Secret `scheduling-db-app`, read by CNPG's initdb AND composed into Convex's `POSTGRES_URL`). Declared per key (missing ⇒ `SecretSyncedError`); the backend's `assert-secrets` exits `MISSING REQUIRED SECRET: PG_USER` / `PG_PASSWORD`, refuses non-URL-safe or short values and an `INSTANCE_NAME` other than `psi-scheduling`. In OpenBao (not CNPG-generated) so a restore rebuilds the same Secret. |
| `scheduling-backend` (WAL archive) | `secret/platform/object-storage/dev` | `access_key_id`, `secret_access_key` | CNPG's barman credentials, Secret `scheduling-backup-s3` (only the two keys, per key). |
| `scheduling-deploy` (nightly export) | `secret/apps/scheduling/export` + `secret/apps/scheduling/admin` + `secret/platform/object-storage/dev` | `export.AGE_RECIPIENT` (age PUBLIC key `age1…`), `admin.CONVEX_SELF_HOSTED_ADMIN_KEY`, `access_key_id`, `secret_access_key` | CronJob `scheduling-export` (`gitops/services/scheduling-deploy/base/export-cronjob.yaml`), Secret `scheduling-export-env`, per key. Its `assert-secrets` initContainer exits `MISSING REQUIRED SECRET: <key>` and refuses a recipient that is not `age1…`. The decryption identity is generated offline and never stored in the cluster, OpenBao or git. |
| `psizone-web` | `secret/apps/scheduling/env` | `PSI_SCHEDULING_KEY` (**optional**, declared) | The scheduling server key the site sends to the store. **Optional by design**: scheduling is off without `CONVEX_URL` and the key (`readSchedulingEnv`; the site keeps its callback form), so it is its own ExternalSecret `psizone-web-scheduling` read as an `optional: true` envFrom, NOT a `psizone-web-env` key and NOT in `assert-secrets`: a missing key shows as `SecretSyncedError` on that one object and never blocks a deploy. `CONVEX_URL=http://scheduling-backend.scheduling.svc:3210` is plain env in the Deployment. Roll the pod after the key first appears. The SAME property the deploy Job sets in the deployment, so one rotation reaches both. |
| `cms` (scheduling) | `secret/apps/scheduling/env` | `PSI_SCHEDULING_KEY` (**optional**, declared) | The scheduling server key the CMS staff page (`/admin/platform/scheduling`) sends to the store. **Optional by design**, like psizone-web's: its own ExternalSecret `cms-scheduling` read as an `optional: true` envFrom, NOT a `cms-env` key and NOT in `assert-secrets`; without it the page shows "not configured" and the CMS is unaffected. `CONVEX_URL=http://scheduling-backend.scheduling.svc:3210` is plain env; the store's NetworkPolicy admits namespace `cms`, pod `app: cms`. Roll the pod after the key first appears. |
| `cms` | `secret/apps/cms/{db,env,oidc}` + `secret/platform/object-storage/dev` | `db.{username,password}` (composed into `DATABASE_URI`), `env.{PAYLOAD_SECRET,BREAKGLASS_EMAIL,BREAKGLASS_PASSWORD}`, `oidc.{client_id,client_secret}` (as `OIDC_CLIENT_ID`/`OIDC_CLIENT_SECRET`), object storage `{access_key_id,secret_access_key}` (as `S3_ACCESS_KEY_ID`/`S3_SECRET_ACCESS_KEY`) | Every key declared per key in `gitops/services/cms/base/externalsecret.yaml` (`cms-env`, no `dataFrom.extract`; missing ⇒ `SecretSyncedError`) and in `apps/cms/seb.app.yaml`, whose `health.secretChecks` SEB's doctor runs. The `assert-secrets` initContainer exits `MISSING REQUIRED SECRET: <key>` on any of the eight empty, before `src/env.ts` would refuse it. `db` is also CNPG's bootstrap secret (`cms-db-app`), so the role survives a rebuild and matches a restored database; WAL archiving reads the object-storage key through its own `cms-backup-s3`. `oidc` is read by BOTH ends of the sign-in: cms and Authentik's cms provider (`authentik-cms-oidc`), from the same properties, so they cannot drift. |

## Using Chroma from an app

Chroma runs at **https://chroma.psizone.ro** (in the cluster: `http://chroma.chroma.svc:8000`).
Chroma's open-source server has no authentication of its own, so an nginx sidecar in front of
it refuses every request without the token (401). An app sends the token on every request, as
either header Chroma's clients send with token auth:

- `Authorization: Bearer <token>`, or
- `X-Chroma-Token: <token>`.

The app gets the token the same way Chroma does: its own ExternalSecret, in its own
namespace, reading the same OpenBao property. Nothing is copied, so a rotation in OpenBao
reaches every reader (Reloader restarts workloads that read it from the environment).

```yaml
apiVersion: external-secrets.io/v1
kind: ExternalSecret
metadata:
  name: chroma-token
spec:
  refreshInterval: 1m
  secretStoreRef: { name: openbao, kind: ClusterSecretStore }
  target: { name: chroma-token, creationPolicy: Owner }
  data:
    - secretKey: CHROMA_TOKEN
      remoteRef: { key: apps/chroma/env, property: CHROMA_SERVER_TOKEN }
```

With the JavaScript client (`chromadb`):

```ts
const client = new ChromaClient({
	host: "chroma.chroma.svc",
	port: 8000,
	ssl: false,
	headers: { "x-chroma-token": token }, // token: the CHROMA_TOKEN env, parsed at startup
});
```

Python: `chromadb.HttpClient(host="chroma.psizone.ro", port=443, ssl=True,
headers={"Authorization": f"Bearer {token}"})`.

Rotation: write a new 64-hex value to `secret/apps/chroma/env`; the sidecar and every reader
pick it up within the ExternalSecret refresh plus a Reloader restart.
