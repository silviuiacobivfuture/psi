#!/bin/bash
# Mirrors an environment's client-file bucket (SOURCE_BUCKET, nbg1) into its backup bucket (BACKUP_BUCKET, fsn1) under
# files/, through the pod's scratch volume (the two locations are separate endpoints, so S3 cannot copy between them).
# The backup bucket is versioned: a file deleted at the source is deleted here as a delete marker and its last version
# kept 30 days (lifecycle files-deleted-kept-30). Writes replica/files-<env>.json (when, how many) for the freshness check.
source /scripts/lib.sh
: "${SOURCE_BUCKET:?}" "${BACKUP_BUCKET:?}" "${BACKUP_ENV:?}"
work=/work/files
# Always from an empty copy: whatever a previous run left must never reach another environment's replica.
rm -rf "$work"
mkdir -p "$work"
retry aws s3 sync "s3://$SOURCE_BUCKET" "$work" --endpoint-url "$SOURCE_ENDPOINT" --only-show-errors
objects="$(find "$work" -type f | wc -l | tr -d ' ')"
bytes="$(du -sb "$work" | cut -f1)"
retry aws s3 sync "$work" "s3://$BACKUP_BUCKET/files/" --delete --endpoint-url "$BACKUP_ENDPOINT" --only-show-errors
printf '{"at":"%s","source":"%s","objects":%s,"bytes":%s}\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$SOURCE_BUCKET" \
	"$objects" "$bytes" >/work/marker.json
retry aws s3 cp /work/marker.json "s3://$BACKUP_BUCKET/replica/files-$BACKUP_ENV.json" --endpoint-url "$BACKUP_ENDPOINT" \
	--only-show-errors
echo "replicated $objects objects ($bytes bytes) of $SOURCE_BUCKET to $BACKUP_BUCKET/files/"
