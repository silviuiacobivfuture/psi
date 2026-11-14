#!/bin/bash
# Uploads the sealed export and its manifest (made by the `export` initContainer: node /app/backup.mjs export) to the
# environment's backup bucket in fsn1, into its tiers, each object locked (GOVERNANCE) for as long as its tier keeps it;
# the bucket's lifecycle then removes it (docs/backup.md):
#   convex/hourly/   every run          kept 2 days   (48 at the hourly schedule)
#   convex/daily/    the 00:xx UTC run  kept 30 days
#   convex/monthly/  00:xx UTC on the 1st kept 365 days (12)
set -euo pipefail
export AWS_REQUEST_CHECKSUM_CALCULATION=when_required AWS_RESPONSE_CHECKSUM_VALIDATION=when_required AWS_PAGER=""
: "${BACKUP_BUCKET:?}" "${BACKUP_ENDPOINT:?}"
test -s /work/convex.zip.enc || { echo "FAILED: /work/convex.zip.enc missing or empty (the export failed)" >&2; exit 1; }
test -s /work/manifest.json || { echo "FAILED: /work/manifest.json missing" >&2; exit 1; }
ts="$(date -u +%Y%m%dT%H%M%SZ)"
hour="$(date -u +%H)"
day="$(date -u +%d)"

put() {
	local key="$1" file="$2" days="$3" n=0
	until aws s3api put-object --bucket "$BACKUP_BUCKET" --key "$key" --body "$file" \
		--object-lock-mode GOVERNANCE \
		--object-lock-retain-until-date "$(date -u -d "+$days days" +%Y-%m-%dT%H:%M:%SZ)" \
		--endpoint-url "$BACKUP_ENDPOINT" >/dev/null; do
		n=$((n + 1))
		[ "$n" -lt 10 ] || { echo "FAILED: upload of $key" >&2; return 1; }
		sleep 3
	done
	echo "uploaded s3://$BACKUP_BUCKET/$key, locked $days days"
}

tier() {
	put "convex/$1/$ts.zip.enc" /work/convex.zip.enc "$2"
	put "convex/$1/$ts.manifest.json" /work/manifest.json "$2"
}

tier hourly 2
if [ "$hour" = "00" ]; then
	tier daily 30
	if [ "$day" = "01" ]; then tier monthly 365; fi
fi
