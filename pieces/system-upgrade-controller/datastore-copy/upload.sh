#!/bin/sh
# Upload the copy copy.py verified, read it back, then prune. Pruning comes last and
# only after the object store has confirmed the new object's size: a run that fails
# anywhere keeps every older copy. Prints names and sizes, never a credential.
set -eu

OUT="${WORK:-/work}/state.db.gz"
test -s "$OUT" || { echo "COPY REFUSED [NOTHING_TO_UPLOAD]: $OUT is missing or empty" >&2; exit 3; }

# Hetzner S3 rejects the AWS SDK's default checksum (same flag velero uses).
export AWS_REQUEST_CHECKSUM_CALCULATION=when_required
export AWS_RESPONSE_CHECKSUM_VALIDATION=when_required

# When the contents are from, written by copy.py before it read the database. Not now:
# compressing and starting this container take seconds, and objects get created in them.
TS="$(cat "${WORK:-/work}/taken-at" 2>/dev/null || true)"
printf '%s' "$TS" | grep -qE '^[0-9]{8}T[0-9]{6}Z$' || { echo "COPY REFUSED [NO_TIMESTAMP]: copy.py left no time for this copy" >&2; exit 3; }
NAME="state-${TS}.db.gz"
KEY="${PREFIX}/${NAME}"
WANT="$(wc -c < "$OUT" | tr -d ' ')"

aws s3 cp --only-show-errors "$OUT" "s3://${BUCKET}/${KEY}" --endpoint-url "${AWS_ENDPOINT_URL}"
GOT="$(aws s3api head-object --bucket "$BUCKET" --key "$KEY" --query ContentLength --output text --endpoint-url "${AWS_ENDPOINT_URL}")"
[ "$GOT" = "$WANT" ] || { echo "COPY REFUSED [UPLOAD_SHORT]: s3://${BUCKET}/${KEY} holds ${GOT} bytes, ${WANT} were sent" >&2; exit 3; }
rm -f "$OUT" "${WORK:-/work}/taken-at"
echo "uploaded s3://${BUCKET}/${KEY} bytes=${GOT}"

# Keep the newest KEEP, by the timestamp in the name. Only names this job writes are
# ever candidates.
aws s3 ls "s3://${BUCKET}/${PREFIX}/" --endpoint-url "${AWS_ENDPOINT_URL}" \
  | awk '{print $4}' | grep -E '^state-[0-9]{8}T[0-9]{6}Z\.db\.gz$' | sort -r \
  | tail -n +$((KEEP + 1)) | while read -r old; do
      echo "pruning ${old}"
      aws s3 rm --only-show-errors "s3://${BUCKET}/${PREFIX}/${old}" --endpoint-url "${AWS_ENDPOINT_URL}"
    done
echo "done"
