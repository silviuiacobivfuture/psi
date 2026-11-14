#!/usr/bin/env bash
# The appointments store's restore drill (docs/backup.md): restores an environment's NEWEST sealed Convex export into a
# throwaway namespace with its own empty backend, using ONLY what is escrowed off the cluster (the backup private key
# and the master key on this workstation), and proves it: the archive's counts equal its manifest's, every sealed
# clinical field opens, and the restored store, exported again, holds the same counts and the same openable fields.
# The namespace is deleted at the end, whatever happened.
#
#   tools/backup/restore-drill.sh dev|prod            (KUBECONFIG must point at the estate's cluster)
#
# Reads (never prints): <creds>/backup-<env>-restore-key.pem, and the master key from <creds>/prod-escrow.txt
# (line apps/scheduling-api-prod/env.CLINIC_MASTER_KEY for prod, apps/scheduling-api/env.CLINIC_MASTER_KEY for dev).
# <creds> is $PSI_CREDENTIALS (default: the main checkout's .credentials). Needs kubectl and docker (the drill backend's
# admin key is derived locally by tools/scheduling/admin-key.sh). Exit 0 only when every proof held.
set -euo pipefail

ENV="${1:-}"
case "$ENV" in dev | prod) ;; *) echo "usage: tools/backup/restore-drill.sh dev|prod" >&2; exit 2 ;; esac
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CREDS="${PSI_CREDENTIALS:-$ROOT/../psi/.credentials}"
KEY_FILE="$CREDS/backup-$ENV-restore-key.pem"
ESCROW="$CREDS/prod-escrow.txt"
[ -r "$KEY_FILE" ] || { echo "drill: the escrowed restore key $KEY_FILE is missing" >&2; exit 1; }
[ -r "$ESCROW" ] || { echo "drill: the escrow file $ESCROW is missing" >&2; exit 1; }
if [ "$ENV" = prod ]; then line="apps/scheduling-api-prod/env.CLINIC_MASTER_KEY"; else line="apps/scheduling-api/env.CLINIC_MASTER_KEY"; fi

tag_of() { sed -n 's/^[[:space:]]*newTag:[[:space:]]*"\([^"]*\)".*/\1/p' "$1"; }
DEPLOY_TAG="$(tag_of "$ROOT/gitops/services/scheduling-deploy/overlays/$ENV/kustomization.yaml")"
BACKEND_TAG="$(tag_of "$ROOT/gitops/services/scheduling-backend/overlays/$ENV/kustomization.yaml")"
case "$DEPLOY_TAG$BACKEND_TAG" in *unpromoted* | *unbuilt* | "") echo "drill: $ENV has no built images to drill with" >&2; exit 1 ;; esac
NS="backup-drill-$ENV-$(date -u +%Y%m%d%H%M%S)"
BUCKET="psi-backups-$ENV"

TMP="$(mktemp -d)"
chmod 700 "$TMP"
cleanup() {
	rm -rf "$TMP"
	kubectl delete namespace "$NS" --wait=false >/dev/null 2>&1 || true
}
trap cleanup EXIT

# The drill backend's own instance: fresh, random, and its admin key derived from it (nothing of the source's).
INSTANCE_NAME=psi-drill
INSTANCE_SECRET="$(openssl rand -hex 32)"
export INSTANCE_NAME INSTANCE_SECRET
ADMIN_KEY="$("$ROOT/tools/scheduling/admin-key.sh")"
umask 077
printf 'INSTANCE_NAME=%s\nINSTANCE_SECRET=%s\nCONVEX_SELF_HOSTED_ADMIN_KEY=%s\n' "$INSTANCE_NAME" "$INSTANCE_SECRET" "$ADMIN_KEY" >"$TMP/instance.env"
unset INSTANCE_SECRET ADMIN_KEY
sed -n "s|^$line=||p" "$ESCROW" | tr -d '\n' >"$TMP/master"
[ -s "$TMP/master" ] || { echo "drill: no $line in the escrow file" >&2; exit 1; }

sed -e "s|__NS__|$NS|g" -e "s|__BUCKET__|$BUCKET|g" \
	-e "s|__DEPLOY_IMAGE__|registry.psizone.ro/psi/scheduling-deploy:$DEPLOY_TAG|g" \
	-e "s|__BACKEND_IMAGE__|registry.psizone.ro/psi/scheduling-backend:$BACKEND_TAG|g" \
	"$ROOT/tools/backup/drill.yaml" >"$TMP/drill.yaml"

echo "drill: $ENV into namespace $NS (deploy $DEPLOY_TAG, backend $BACKEND_TAG), from s3://$BUCKET/convex/hourly/"
kubectl create namespace "$NS" >/dev/null
kubectl label namespace "$NS" psizone.ro/drill=true >/dev/null
kubectl -n "$NS" create secret generic drill-instance --from-env-file="$TMP/instance.env" >/dev/null
kubectl -n "$NS" create secret generic drill-keys --from-file=CLINIC_MASTER_KEY="$TMP/master" \
	--from-file=restore-key.pem="$KEY_FILE" >/dev/null
rm -f "$TMP/instance.env" "$TMP/master"
kubectl apply -f "$TMP/drill.yaml" >/dev/null

started="$(date +%s)"
until kubectl -n "$NS" get job drill-restore -o jsonpath='{.status.conditions[*].type}' 2>/dev/null | grep -qE 'Complete|Failed'; do
	[ $(($(date +%s) - started)) -lt 1600 ] || { echo "drill: timed out" >&2; break; }
	sleep 10
done
pod="$(kubectl -n "$NS" get pods -l app=drill-restore -o jsonpath='{.items[0].metadata.name}')"
for c in fetch open-and-verify import prove; do
	echo "--- $c"
	kubectl -n "$NS" logs "$pod" -c "$c" 2>&1 | grep -E '^\{|FAILED|backup:|error' | tail -n 5 || true
done
state="$(kubectl -n "$NS" get job drill-restore -o jsonpath='{.status.conditions[*].type}')"
echo "drill: $ENV took $(($(date +%s) - started)) s, job: $state"
case "$state" in *Complete*) exit 0 ;; *) exit 1 ;; esac
