#!/bin/bash
# Converges the backup buckets (idempotent; Argo runs it on every sync of `backup`): psi-backups-dev and psi-backups-prod
# in fsn1, created WITH object lock (it can only be switched on at creation), versioned, and with the lifecycle that
# keeps the tiers (lifecycle.json). The source file buckets (nbg1) are versioned too, so a deleted client file stays
# recoverable from the source as well as from the replica. Prints what it found and what it changed; refuses (exit 1)
# when a bucket exists WITHOUT object lock, because that cannot be repaired in place and must be said.
source /scripts/lib.sh

ensure_backup_bucket() {
	local b="$1"
	if aws s3api head-bucket --bucket "$b" --endpoint-url "$BACKUP_ENDPOINT" >/dev/null 2>&1; then
		echo "$b: exists"
	else
		aws s3api create-bucket --bucket "$b" --object-lock-enabled-for-bucket \
			--create-bucket-configuration "LocationConstraint=$BACKUP_REGION" --endpoint-url "$BACKUP_ENDPOINT" >/dev/null
		echo "$b: created with object lock"
		retry aws s3api head-bucket --bucket "$b" --endpoint-url "$BACKUP_ENDPOINT"
	fi
	local lock
	lock="$(retry aws s3api get-object-lock-configuration --bucket "$b" --endpoint-url "$BACKUP_ENDPOINT" \
		--query 'ObjectLockConfiguration.ObjectLockEnabled' --output text 2>/dev/null || echo none)"
	if [ "$lock" != "Enabled" ]; then
		echo "REFUSED: $b has no object lock (it can only be enabled when the bucket is created)" >&2
		return 1
	fi
	retry aws s3api put-bucket-versioning --bucket "$b" --versioning-configuration Status=Enabled \
		--endpoint-url "$BACKUP_ENDPOINT"
	retry aws s3api put-bucket-lifecycle-configuration --bucket "$b" \
		--lifecycle-configuration file:///scripts/lifecycle.json --endpoint-url "$BACKUP_ENDPOINT"
	echo "$b: object lock $lock, versioning $(aws s3api get-bucket-versioning --bucket "$b" \
		--endpoint-url "$BACKUP_ENDPOINT" --query Status --output text), lifecycle rules $(aws s3api \
		get-bucket-lifecycle-configuration --bucket "$b" --endpoint-url "$BACKUP_ENDPOINT" \
		--query 'join(`,`, Rules[].ID)' --output text)"
}

version_source() {
	local b="$1"
	retry aws s3api put-bucket-versioning --bucket "$b" --versioning-configuration Status=Enabled \
		--endpoint-url "$SOURCE_ENDPOINT"
	echo "$b (source): versioning $(aws s3api get-bucket-versioning --bucket "$b" --endpoint-url "$SOURCE_ENDPOINT" \
		--query Status --output text)"
}

ensure_backup_bucket psi-backups-dev
ensure_backup_bucket psi-backups-prod
version_source psi-scheduling-dev
version_source psi-scheduling-prod
echo "buckets converged"
