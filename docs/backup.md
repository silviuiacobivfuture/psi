# Backups and restore: the appointments system

What is backed up, where, for how long, how a failure is noticed, and how each piece comes back. Everything here is
code in this repository; the only material outside it is the key escrow on the estate workstation.

## Where

The cluster and the stores' own buckets are in **nbg1** (Nuremberg). Every backup copy is in **fsn1** (Falkenstein),
a different Hetzner data centre, in a bucket per environment:

| Bucket | Holds | Object lock | Versioning |
|--------|-------|-------------|------------|
| `psi-backups-prod` | production's Convex exports, CNPG archives, client-file replica, OpenBao snapshots | enabled at creation | on |
| `psi-backups-dev` | dev's Convex exports and client-file replica | enabled at creation | on |

`gitops/services/backup` (Job `backup-buckets`, every Argo sync) creates them WITH object lock (it cannot be added
later, and the Job refuses a bucket without it), switches versioning on, applies `scripts/lifecycle.json`, and versions
the source buckets `psi-scheduling-{dev,prod}` too. Locks are GOVERNANCE: the estate has one object-storage key, and a
COMPLIANCE lock set by mistake could not be lifted by anyone for a year.

## What, how often, how long

| Data | How | Schedule | Kept | Lock |
|------|-----|----------|------|------|
| Convex store (prod) | `scheduling-backup` CronJob (ns `scheduling-backend-prod`): `convex export`, sealed, uploaded by tier | hourly at :07 | `convex/hourly/` 48 (2 days), `convex/daily/` 30 (a run finding no daily copy younger than 23 h), `convex/monthly/` 12 (a run finding none younger than 28 days) | each object until its tier expires |
| Convex store (dev) | the same CronJob in ns `scheduling` | every 6 h | the same tiers | the same |
| Prod Postgres (`scheduling-db`: Convex's database; `account-db`) | CNPG `barmanObjectStore` to `psi-backups-prod/cnpg/<name>-prod` | WAL continuously; base daily 03:20 / 04:55 | `retentionPolicy: 30d` (point-in-time recovery to any moment of 30 days); a deleted object 7 days more (versioning) | none (barman prunes) |
| Dev / platform Postgres | CNPG to `psi-tfstate-dev/cnpg/<name>` (SEB's pieces) | WAL; base weekly | SEB's | none |
| Client files | `files-replica-{prod,dev}` (ns `backup`): mirror into `<bucket>/files/` | prod hourly :25, dev daily 02:35 | current copy always; a deleted file's last version 30 days | none |
| OpenBao (every secret: CLINIC_MASTER_KEY, restore keys, DB passwords) | SEB's `openbao-snapshot` (6 h, nbg1) + `openbao-offsite` copies the newest to `psi-backups-prod/openbao/` | every 6 h at :50 | 30 days | 30 days |
| Kubernetes objects and volumes | SEB's Velero `velero-daily-platform`: every namespace, file-system backup of PVs | every 6 h | 120 h | none (in `psi-tfstate-dev/velero`, nbg1) |
| OpenFGA tuples | rebuilt from the store (below); `openfga-db` is a CNPG cluster with WAL + base backups (SEB) | — | — | — |

## Encryption and keys

A Convex export is sealed per file (AES-256-GCM, the file key wrapped with RSA-OAEP-256) for the environment's backup
key pair (`packages/scheduling/scripts/backup`, bundled as `/app/backup.mjs` in the scheduling-deploy image). The job
holds only the PUBLIC key (`gitops/services/scheduling-deploy/overlays/<env>/backup-public-key.pem`); the private key
is `secret/apps/backup-<env>/restore-key` in OpenBao AND escrowed on the workstation as
`.credentials/backup-<env>-restore-key.pem`. Fingerprints (in every sealed file's header): dev `d6d07e85d551ff40`,
prod `b3bd917ce203a8f0`. Clinical fields inside the export are additionally sealed by the service's own envelope
(`CLINIC_MASTER_KEY`), escrowed as `.credentials/prod-escrow.txt` beside OpenBao's own copy. Each export travels with a
manifest (`<ts>.manifest.json`): per-table counts, size, SHA-256 of the plaintext and of the sealed file.

## Alarms

No Prometheus runs on the cluster; SEB's `estate-watch` (every 10 min) posts to the infra channel when any CronJob's
newest run fails or a CronJob stops firing. So every backup job exits non-zero on any failure, and
`backup-freshness` (ns `backup`, :12 and :42) fails when the newest object of a kind is older than its limit:
prod Convex hourly 2 h, daily 26 h; dev Convex 7 h; prod CNPG base backups 26 h; prod file replica 2 h, dev 26 h;
OpenBao off-site 8 h. Its last log is the backups' state, one line per check.

## Restore

**Drill (do it after any change here, and monthly):** `tools/backup/restore-drill.sh prod` (or `dev`). It creates
`backup-drill-<env>-<time>` with an empty Convex backend of its own, fetches the newest hourly export, opens it with
the escrowed private key, checks the counts against the manifest and opens every sealed field with the escrowed master
key, imports it, exports the drill backend again and checks that too; then deletes the namespace. Exit 0 only when
every proof held; its output is names, counts and hashes.

**Convex, for real:** the same steps against the real backend. Scale `scheduling-api` of the environment to 0, then
from the scheduling-deploy image (or a workstation with the Convex CLI): `node backup.mjs open --in <ts>.zip.enc --out
restored.zip` (`BACKUP_PRIVATE_KEY_FILE`), `node backup.mjs verify --zip restored.zip --against <ts>.manifest.json`
(`CLINIC_MASTER_KEY`), `convex import --replace-all --yes restored.zip` (the backend's `CONVEX_SELF_HOSTED_URL` and
admin key), rerun the scheduling-deploy Job (functions), scale the API back.

**Postgres (point in time):** a new CNPG `Cluster` with `bootstrap.recovery` from `externalClusters` pointing at the
same `barmanObjectStore` (`s3://psi-backups-prod/cnpg/<name>-prod`, fsn1, `serverName` = the old cluster's name) and
`recoveryTarget.targetTime`; then point the consumer at it. For Convex's own database this restores production's store
as of that moment, an alternative to the logical export.

**Client files:** copy `psi-backups-<env>/files/` back to `psi-scheduling-<env>` (`aws s3 sync` through a volume, the
two endpoints differ); an older or deleted version: `aws s3api list-object-versions --prefix files/<key>`.

**OpenFGA tuples:** reconstructible from the restored store: `tools/scheduling/reconcile-authz` writes every tuple the
store implies (`--app <slug>`, `--member <subject>=<role>` for the bootstrapped members) and is idempotent; production
objects carry its `OPENFGA_APP_PREFIX` (`prod-`). The platform tuples (`platform:psi` administrator,
`role_sched_app_admin`) are not in the store: re-grant them as recorded in the estate's notes. Beyond that, `openfga-db`
is a CNPG cluster with its own WAL archive (SEB).

**OpenBao:** restore the newest `openbao/openbao-*.tar.gz` (or SEB's copy in nbg1) with OpenBao's snapshot restore; it
opens only with the estate's unseal keys, which are not in any bucket.

**Cluster objects and volumes:** Velero (`velero restore create --from-backup <name>`); its backups are in nbg1 beside
the cluster, so a lost location is covered by the fsn1 copies above, not by Velero.
