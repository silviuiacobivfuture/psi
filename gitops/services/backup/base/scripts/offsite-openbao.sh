#!/bin/bash
# Copies the newest OpenBao snapshot (SEB's openbao-snapshot CronJob, every 6 h, to psi-tfstate-dev/openbao-snapshots in
# nbg1) to psi-backups-prod/openbao/ in fsn1, locked (GOVERNANCE) for 30 days: the estate's key material, production's
# CLINIC_MASTER_KEY and the backup restore keys among it, outside the cluster's location. A snapshot opens only with
# OpenBao's unseal keys, which are not in any bucket (they are the estate's own escrow, on the workstation).
source /scripts/lib.sh
src_bucket="${SNAPSHOT_BUCKET:-psi-tfstate-dev}"
src_prefix="${SNAPSHOT_PREFIX:-openbao-snapshots}"
dst_bucket="${BACKUP_BUCKET:-psi-backups-prod}"
latest="$(retry aws s3 ls "s3://$src_bucket/$src_prefix/" --endpoint-url "$SOURCE_ENDPOINT" |
	awk '{print $4}' | grep -E '^openbao-.*\.tar\.gz$' | sort | tail -n 1 || true)"
if [ -z "$latest" ]; then
	echo "FAILED: no OpenBao snapshot under s3://$src_bucket/$src_prefix/" >&2
	exit 1
fi
if aws s3api head-object --bucket "$dst_bucket" --key "openbao/$latest" --endpoint-url "$BACKUP_ENDPOINT" >/dev/null 2>&1; then
	echo "openbao/$latest already off-site"
	exit 0
fi
retry aws s3 cp "s3://$src_bucket/$src_prefix/$latest" "/work/$latest" --endpoint-url "$SOURCE_ENDPOINT" --only-show-errors
test -s "/work/$latest" || { echo "FAILED: $latest is empty" >&2; exit 1; }
retry aws s3api put-object --bucket "$dst_bucket" --key "openbao/$latest" --body "/work/$latest" \
	--object-lock-mode GOVERNANCE --object-lock-retain-until-date "$(until_days 30)" \
	--endpoint-url "$BACKUP_ENDPOINT" >/dev/null
echo "copied $latest ($(stat -c %s "/work/$latest") bytes) to s3://$dst_bucket/openbao/, locked 30 days"
