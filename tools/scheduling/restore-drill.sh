#!/usr/bin/env bash
# Restore drill for the scheduling store (docs/plans/clinic.md section 5, docs/runbooks/scheduling-restore.md).
#
# Proves, end to end and read-only against production, that the Postgres WAL archive can bring the
# store back: it restores the latest backup + WAL of Cluster scheduling-db from the object storage
# into a SCRATCH namespace (a recovery-bootstrapped Cluster, no `backup:` stanza so it can never write
# into the live archive prefix), starts a scratch Convex backend on it, and compares the row count of
# every Convex table between live and restored. It then deletes the scratch namespace.
#
#   tools/scheduling/restore-drill.sh [--keep] [--timeout SECONDS] [--allow-empty]
#
#   --keep         leave the scratch namespace in place (print its name) for inspection
#   --timeout N    seconds each wait may take (default 900)
#   --allow-empty  pass even when the live store has no tables yet (a fresh install)
#
# REQUIRES: kubectl with access to the estate's cluster (the dev kubeconfig, see CLAUDE.md), jq, awk.
# NEEDS from the cluster: the live Cluster scheduling-db, StatefulSet scheduling-backend, CronJob
# scheduling-export (its image has the Convex CLI and count-tables.sh), and the ExternalSecrets
# scheduling-backup-s3, scheduling-db-app, scheduling-backend-env, scheduling-deploy-env, harbor-pull
# in namespace scheduling. Secrets are never read or printed: the scratch namespace gets COPIES OF THE
# ExternalSecret DEFINITIONS and External Secrets syncs the values itself.
#
# COUNTS. The live table counts are taken twice, before the restore (L0) and after it (L1); a WAL
# segment is switched right after L0 so the archive holds everything up to L0. For every table
#   L0 <= restored <= L1
# must hold (writes during the drill can only add rows). PASS when it does for every table and every
# table exists on both sides; "exact" is printed when all three counts are equal.
#
# EXIT: 0 pass, 1 fail, 2 usage or a missing prerequisite.
set -euo pipefail

LIVE_NS=scheduling
LIVE_CLUSTER=scheduling-db
KEEP=0
TIMEOUT=900
ALLOW_EMPTY=0
while [ $# -gt 0 ]; do
	case "$1" in
	--keep) KEEP=1 ;;
	--allow-empty) ALLOW_EMPTY=1 ;;
	--timeout) shift; TIMEOUT="${1:?--timeout needs a number}" ;;
	-h | --help) sed -n 2,28p "$0"; exit 0 ;;
	*) echo "unknown argument: $1" >&2; exit 2 ;;
	esac
	shift
done

for tool in kubectl jq awk; do
	command -v "$tool" >/dev/null || { echo "missing prerequisite: $tool" >&2; exit 2; }
done
K="kubectl"
NS="scheduling-drill-$(date -u +%Y%m%d%H%M%S)"
WORK="$(mktemp -d)"
LIVE_JOBS=()
NS_CREATED=0

log() { printf '[drill %s] %s\n' "$(date -u +%H:%M:%S)" "$*" >&2; }
fail() { log "FAIL: $*"; exit 1; }

cleanup() {
	local rc=$?
	for j in "${LIVE_JOBS[@]:-}"; do
		if [ -n "$j" ]; then $K -n "$LIVE_NS" delete job "$j" --ignore-not-found --wait=false >/dev/null 2>&1 || true; fi
	done
	if [ "$NS_CREATED" = 1 ]; then
		if [ "$KEEP" = 1 ]; then
			log "scratch namespace kept: $NS (delete it with: kubectl delete namespace $NS)"
		else
			log "deleting scratch namespace $NS"
			$K delete namespace "$NS" --wait=false >/dev/null 2>&1 || log "COULD NOT DELETE $NS: delete it by hand"
		fi
	fi
	rm -rf "$WORK"
	exit "$rc"
}
trap cleanup EXIT

# ---- preflight: the live side must be healthy, or the drill proves nothing -----------------------------
$K -n "$LIVE_NS" get cluster "$LIVE_CLUSTER" -o json >"$WORK/cluster.json" || { log "cannot read Cluster $LIVE_CLUSTER (kubectl access?)"; exit 2; }
archiving="$(jq -r '[.status.conditions[]? | select(.type=="ContinuousArchiving") | .status] | first // "Unknown"' "$WORK/cluster.json")"
[ "$archiving" = "True" ] || fail "ContinuousArchiving is '$archiving' on $LIVE_CLUSTER: the WAL archive is not healthy"
last_ok="$(jq -r '.status.lastSuccessfulBackup // empty' "$WORK/cluster.json")"
[ -n "$last_ok" ] || fail "$LIVE_CLUSTER has no successful base backup yet"
log "live: ContinuousArchiving=True, last successful base backup $last_ok"

DEST="$(jq -r '.spec.backup.barmanObjectStore.destinationPath' "$WORK/cluster.json")"
ENDPOINT="$(jq -r '.spec.backup.barmanObjectStore.endpointURL' "$WORK/cluster.json")"
PGIMAGE="$(jq -r '.spec.imageName' "$WORK/cluster.json")"
BACKEND_IMAGE="$($K -n "$LIVE_NS" get statefulset scheduling-backend -o jsonpath='{.spec.template.spec.containers[?(@.name=="backend")].image}')"
TOOLS_IMAGE="$($K -n "$LIVE_NS" get cronjob scheduling-export -o jsonpath='{.spec.jobTemplate.spec.template.spec.initContainers[?(@.name=="export")].image}')"
for v in DEST ENDPOINT PGIMAGE BACKEND_IMAGE TOOLS_IMAGE; do
	if [ -z "${!v}" ] || [ "${!v}" = null ]; then fail "could not read $v from the live objects"; fi
done

# ---- helpers ---------------------------------------------------------------------------------------------
# A counting Job (count-tables.sh) in namespace $1, against $2, named $3; prints its COUNT lines to $4.
count_job() {
	local ns="$1" url="$2" name="$3" out="$4" label="$5"
	cat <<YAML | $K -n "$ns" apply -f - >/dev/null
apiVersion: batch/v1
kind: Job
metadata:
  name: $name
spec:
  backoffLimit: 0
  activeDeadlineSeconds: $TIMEOUT
  ttlSecondsAfterFinished: 3600
  template:
    metadata:
      labels: { app: $label }
    spec:
      restartPolicy: Never
      imagePullSecrets: [{ name: harbor-pull }]
      securityContext: { runAsNonRoot: true, runAsUser: 1000, runAsGroup: 1000, seccompProfile: { type: RuntimeDefault } }
      containers:
        - name: count
          image: $TOOLS_IMAGE
          command: ["/app/count-tables.sh"]
          env:
            - { name: CONVEX_SELF_HOSTED_URL, value: "$url" }
            - name: CONVEX_SELF_HOSTED_ADMIN_KEY
              valueFrom: { secretKeyRef: { name: scheduling-deploy-env, key: CONVEX_SELF_HOSTED_ADMIN_KEY } }
          volumeMounts: [{ name: tmp, mountPath: /tmp }]
          resources: { requests: { cpu: 100m, memory: 256Mi }, limits: { cpu: "1", memory: 768Mi } }
          securityContext: { allowPrivilegeEscalation: false, capabilities: { drop: ["ALL"] } }
      volumes: [{ name: tmp, emptyDir: {} }]
YAML
	$K -n "$ns" wait --for=condition=complete "job/$name" --timeout="${TIMEOUT}s" >/dev/null 2>&1 \
		|| { $K -n "$ns" logs "job/$name" --tail=20 >&2 || true; fail "counting job $name did not complete"; }
	$K -n "$ns" logs "job/$name" | grep -E '^(COUNT|COUNT-DONE)' >"$out"
	grep -q '^COUNT-DONE$' "$out" || fail "counting job $name printed no COUNT-DONE"
	{ grep -v '^COUNT-DONE$' "$out" || true; } | sed 's/^COUNT //' >"$out.tbl"
}

# ---- 1. live counts before (L0), then archive everything up to now --------------------------------------
LIVE_JOBS+=("drill-count-live-0")
log "counting the live tables (L0)"
count_job "$LIVE_NS" "http://scheduling-backend.$LIVE_NS.svc:3210" drill-count-live-0 "$WORK/l0" scheduling-deploy
if [ ! -s "$WORK/l0.tbl" ] && [ "$ALLOW_EMPTY" != 1 ]; then
	fail "the live store has no tables: nothing to compare (--allow-empty for a fresh install)"
fi
primary="$(jq -r '.status.currentPrimary' "$WORK/cluster.json")"
log "switching the WAL segment on $primary so the archive holds L0"
$K -n "$LIVE_NS" exec "$primary" -c postgres -- psql -U postgres -d postgres -Atc 'select pg_switch_wal()' >/dev/null
sleep 30

# ---- 2. scratch namespace, secrets (ExternalSecret copies), recovery cluster ----------------------------
log "creating scratch namespace $NS"
$K create namespace "$NS" >/dev/null
NS_CREATED=1
for es in scheduling-backup-s3 scheduling-db-app scheduling-backend-env scheduling-deploy-env harbor-pull; do
	$K -n "$LIVE_NS" get externalsecret "$es" -o json \
		| jq 'del(.metadata.namespace,.metadata.resourceVersion,.metadata.uid,.metadata.creationTimestamp,.metadata.generation,.metadata.ownerReferences,.metadata.managedFields,.metadata.annotations,.metadata.labels,.status)' \
		| $K -n "$NS" apply -f - >/dev/null
done
$K -n "$NS" wait --for=condition=Ready externalsecret --all --timeout="${TIMEOUT}s" >/dev/null || fail "the copied ExternalSecrets did not sync"

log "bootstrapping drill-db from the barman archive $DEST"
cat <<YAML | $K -n "$NS" apply -f - >/dev/null
apiVersion: postgresql.cnpg.io/v1
kind: Cluster
metadata:
  name: drill-db
  annotations:
    alerts.psizone.ro/owner: ops@psizone.ro
spec:
  instances: 1
  smartShutdownTimeout: 10
  imageName: $PGIMAGE
  # NO backup stanza: the scratch cluster must never archive into the live prefix.
  bootstrap:
    recovery:
      source: scheduling-db
      database: psi_scheduling
      owner: scheduling
      secret: { name: scheduling-db-app }
  externalClusters:
    - name: scheduling-db
      barmanObjectStore:
        destinationPath: $DEST
        endpointURL: $ENDPOINT
        serverName: $LIVE_CLUSTER
        s3Credentials:
          accessKeyId: { name: scheduling-backup-s3, key: AWS_ACCESS_KEY_ID }
          secretAccessKey: { name: scheduling-backup-s3, key: AWS_SECRET_ACCESS_KEY }
        wal: { maxParallel: 2 }
  storage: { size: 10Gi, storageClass: hcloud-volumes }
  resources:
    requests: { cpu: 100m, memory: 256Mi }
    limits: { cpu: "1", memory: 768Mi }
YAML
$K -n "$NS" wait --for=condition=Ready cluster/drill-db --timeout="${TIMEOUT}s" >/dev/null \
	|| { $K -n "$NS" get cluster drill-db >&2 || true; fail "the recovery cluster did not become Ready (the archive could not be replayed)"; }
log "drill-db is Ready: the backup and WAL replayed"

# ---- 3. scratch Convex backend on the restored database -------------------------------------------------
cat <<YAML | $K -n "$NS" apply -f - >/dev/null
apiVersion: apps/v1
kind: Deployment
metadata:
  name: scheduling-backend
  labels: { app: scheduling-backend }
spec:
  replicas: 1
  selector: { matchLabels: { app: scheduling-backend } }
  template:
    metadata:
      labels: { app: scheduling-backend }
    spec:
      imagePullSecrets: [{ name: harbor-pull }]
      securityContext: { runAsNonRoot: true, runAsUser: 1000, runAsGroup: 1000, fsGroup: 1000, seccompProfile: { type: RuntimeDefault } }
      containers:
        - name: backend
          image: $BACKEND_IMAGE
          ports: [{ name: api, containerPort: 3210 }]
          envFrom: [{ secretRef: { name: scheduling-backend-env } }]
          env:
            - name: PG_USER
              valueFrom: { secretKeyRef: { name: scheduling-db-app, key: username } }
            - name: PG_PASSWORD
              valueFrom: { secretKeyRef: { name: scheduling-db-app, key: password } }
            - { name: POSTGRES_URL, value: "postgresql://\$(PG_USER):\$(PG_PASSWORD)@drill-db-rw:5432" }
            - { name: PG_CA_FILE, value: /etc/db-ca/ca.crt }
            - { name: CONVEX_CLOUD_ORIGIN, value: "http://scheduling-backend.$NS.svc:3210" }
            - { name: CONVEX_SITE_ORIGIN, value: "http://scheduling-backend.$NS.svc:3211" }
            - { name: DISABLE_BEACON, value: "true" }
            - { name: REDACT_LOGS_TO_CLIENT, value: "true" }
          volumeMounts:
            - { name: data, mountPath: /convex/data }
            - { name: db-ca, mountPath: /etc/db-ca, readOnly: true }
          resources: { requests: { cpu: 100m, memory: 256Mi }, limits: { cpu: "1", memory: 1Gi } }
          securityContext: { allowPrivilegeEscalation: false, capabilities: { drop: ["ALL"] }, readOnlyRootFilesystem: true }
          readinessProbe: { httpGet: { path: /version, port: api }, periodSeconds: 5 }
      volumes:
        - { name: data, emptyDir: {} }
        - name: db-ca
          secret: { secretName: drill-db-ca, items: [{ key: ca.crt, path: ca.crt }] }
---
apiVersion: v1
kind: Service
metadata:
  name: scheduling-backend
spec:
  selector: { app: scheduling-backend }
  ports: [{ name: api, port: 3210, targetPort: api }]
YAML
$K -n "$NS" rollout status deployment/scheduling-backend --timeout="${TIMEOUT}s" >/dev/null \
	|| { $K -n "$NS" logs deployment/scheduling-backend --tail=20 >&2 || true; fail "the scratch backend did not start on the restored database"; }

# ---- 4. restored counts, live counts after (L1), compare -----------------------------------------------
log "counting the restored tables (R)"
count_job "$NS" "http://scheduling-backend.$NS.svc:3210" drill-count-restored "$WORK/r" drill-count
LIVE_JOBS+=("drill-count-live-1")
log "counting the live tables (L1)"
count_job "$LIVE_NS" "http://scheduling-backend.$LIVE_NS.svc:3210" drill-count-live-1 "$WORK/l1" scheduling-deploy

awk '
	FILENAME ~ /l0\.tbl$/ { l0[$1] = $2; t[$1] = 1 }
	FILENAME ~ /\/r\.tbl$/ { r[$1] = $2; t[$1] = 1 }
	FILENAME ~ /l1\.tbl$/ { l1[$1] = $2; t[$1] = 1 }
	END {
		bad = 0; exact = 1; n = 0
		printf "%-32s %8s %8s %8s  %s\n", "table", "live0", "restored", "live1", "verdict"
		for (k in t) names[++n] = k
		for (i = 1; i <= n; i++) for (j = i + 1; j <= n; j++) if (names[j] < names[i]) { x = names[i]; names[i] = names[j]; names[j] = x }
		for (i = 1; i <= n; i++) {
			k = names[i]
			if (!(k in l0) || !(k in r) || !(k in l1)) { v = "MISSING on a side"; bad++ }
			else if (r[k] + 0 < l0[k] + 0) { v = "LOST ROWS (restored < live before)"; bad++ }
			else if (r[k] + 0 > l1[k] + 0) { v = "EXTRA ROWS (restored > live after)"; bad++ }
			else if (r[k] == l0[k] && r[k] == l1[k]) v = "exact"
			else { v = "ok (live moved during the drill)"; exact = 0 }
			printf "%-32s %8s %8s %8s  %s\n", k, (k in l0 ? l0[k] : "-"), (k in r ? r[k] : "-"), (k in l1 ? l1[k] : "-"), v
		}
		print "tables compared: " n
		exit (bad > 0)
	}' "$WORK/l0.tbl" "$WORK/r.tbl" "$WORK/l1.tbl" && cmp=0 || cmp=$?

if [ "$cmp" = 0 ]; then
	log "PASS: the restored store matches the live store ($NS cleaned up unless --keep)"
else
	fail "the restored store differs from the live store (table above)"
fi
