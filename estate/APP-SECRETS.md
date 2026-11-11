# psi's app secrets

The estate's addendum to `gitops/services/APP-SECRETS.md` (same contract, same columns): the
keys psi's own services cannot start without, where they live in OpenBao, and how the
failure is made loud.

| App | OpenBao path | Required keys | Evidence |
|-----|--------------|---------------|----------|
| `chroma` | `secret/apps/chroma/env` | `CHROMA_SERVER_TOKEN` (64 lowercase hex) | Declared per-key in `gitops/services/chroma/base/externalsecret.yaml` (missing ⇒ `SecretSyncedError`). The `assert-secrets` initContainer refuses an empty, short or non-hex token (`MISSING REQUIRED SECRET: CHROMA_SERVER_TOKEN`), because an empty token would let a request with no token through the auth sidecar. Seeded once with `openssl rand -hex 32`; never echoed. |
| `psizone-web`, `eqsync-web`, `hemisync-web`, `blog-web` | `secret/apps/chroma/env` | `CHROMA_SERVER_TOKEN`, read as `CHROMA_API_KEY` | Declared per-key in `gitops/services/<site>/base/externalsecret.yaml` (Secret `<site>-env`; missing ⇒ `SecretSyncedError`). The `assert-secrets` initContainer exits `MISSING REQUIRED SECRET: CHROMA_API_KEY` on an empty value. `CHROMA_URL=http://chroma.chroma.svc:8000` is plain env in the Deployment. The knowledge store (`packages/knowledge`) sends it as `Authorization: Bearer`. |
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
