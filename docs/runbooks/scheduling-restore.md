# Scheduling store: backup, restore and the drill

The store is self-hosted Convex (`gitops/services/scheduling-backend`) on Postgres (`scheduling-db`,
CloudNativePG, namespace `scheduling`). Two independent copies exist:

| Copy | What | Where | Kept | Use it when |
|------|------|-------|------|-------------|
| WAL archive + weekly base backup | the whole database, continuous | `s3://psi-tfstate-dev/cnpg/scheduling-db` | 30 days | the database is lost or damaged; you want a point in time |
| Nightly logical export (age-encrypted) | every table + stored files | `s3://psi-tfstate-dev/scheduling-exports/scheduling-<UTC stamp>.zip.age` | 90 days | the archive is unusable, or you must go back further than 30 days, or into a fresh deployment |

Not in the database: function modules (redeployed by the `scheduling-deploy` Job) and, until S3 storage
is configured, the stored files on the `/convex/data` volume (Velero, 6-hourly, and the nightly export
with `--include-file-storage`).

## Is it healthy? (check weekly, and after every change to the database)

```sh
kubectl -n scheduling get cluster scheduling-db
kubectl -n scheduling get cluster scheduling-db -o jsonpath='{.status.conditions[?(@.type=="ContinuousArchiving")].status}{"\n"}{.status.lastSuccessfulBackup}{"\n"}'
kubectl -n scheduling get backup,scheduledbackup
kubectl -n scheduling get cronjob scheduling-export; kubectl -n scheduling get jobs -l app=scheduling-export
```

Expect `True`, a `lastSuccessfulBackup` within 8 days, and the last export job `Complete` within 25 hours.
`ContinuousArchiving` not `True` is an incident: nothing is silently protected. The usual causes are the
NetworkPolicy `scheduling-db` (egress 443 to the object storage), `scheduling-backup-s3`, or the bucket.

## The drill (before go-live, then monthly)

```sh
tools/scheduling/restore-drill.sh        # needs kubectl access to the cluster (the dev kubeconfig), jq
```

It restores the latest backup + WAL into a scratch namespace `scheduling-drill-<stamp>`, starts a scratch
Convex backend on it, counts the rows of every table on both sides (read-only snapshot exports through the
admin API; no document content is printed) and prints `PASS` or `FAIL` with a per-table table, then
deletes the namespace (`--keep` keeps it). Exit 0 = pass. Record the date and result in the clinic
go-live checklist (the console's "last drill" will read it once built). A FAIL blocks go-live with real data.

## Restore after a loss

1. Stop writers: scale `scheduling-backend` to 0 (`kubectl -n scheduling scale statefulset scheduling-backend --replicas=0`).
   Argo's self-heal restores replicas: pause it first (`argocd app set scheduling-backend --sync-policy none`).
2. Rebuild the database from the archive. Replace the live Cluster only after the old one is gone or renamed:
   a Cluster `scheduling-db` with the SAME spec as `base/cnpg-cluster.yaml` but, instead of `initdb`,
   `bootstrap.recovery` (source `scheduling-db`, database `psi_scheduling`, owner `scheduling`, secret
   `scheduling-db-app`) and `externalClusters` naming the same `destinationPath` with `serverName: scheduling-db`.
   To stop at a moment (PITR) add `recoveryTarget.targetTime: "2026-11-13 09:30:00+00"` to the recovery stanza.
   `tools/scheduling/restore-drill.sh` renders exactly this for the scratch cluster; copy it.
   A restored Cluster that keeps the name and the archive prefix must start a NEW archive timeline:
   give it a new `backup.barmanObjectStore.destinationPath` suffix (e.g. `.../scheduling-db-r2`) or CNPG
   refuses to archive onto the old one (it says so in the Cluster status).
3. Wait for the Cluster to be Ready, scale `scheduling-backend` back to 1, re-enable Argo, run
   `argocd app sync scheduling-deploy` (functions), and check a booking page loads.

## Restore from the nightly export (fresh deployment, or the archive is lost)

```sh
# 1. fetch and decrypt (the age identity is held offline by the owner)
aws s3 cp s3://psi-tfstate-dev/scheduling-exports/scheduling-<stamp>.zip.age . --endpoint-url https://nbg1.your-objectstorage.com
age -d -i scheduling.key -o scheduling.zip scheduling-<stamp>.zip.age
# 2. into a deployment whose functions are already deployed (schema in place)
CONVEX_SELF_HOSTED_URL=<url> CONVEX_SELF_HOSTED_ADMIN_KEY=<key> npx convex import --replace-all scheduling.zip
```

`--replace-all` replaces every table's contents; use `npx convex import --table <name> <file>` to bring back one
table (the zip holds `<table>/documents.jsonl`). Stored files come from `_storage/` in the same zip.

## Prerequisites in OpenBao

`secret/apps/scheduling/db` (`username`, `password`) and `secret/apps/scheduling/export` (`AGE_RECIPIENT`):
`packages/scheduling/README.md` (Deploying) and `estate/APP-SECRETS.md`.
