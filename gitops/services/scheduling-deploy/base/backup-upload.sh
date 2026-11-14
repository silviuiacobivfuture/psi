#!/bin/bash
# Uploads the sealed export and its manifest (made by the `export` initContainer: node /app/backup.mjs export) to the
# environment's backup bucket in fsn1, into its tiers, each object locked (GOVERNANCE) for as long as its tier keeps it;
# the bucket's lifecycle then removes it (docs/backup.md):
#   convex/hourly/   every run                                          kept 2 days   (48 at the hourly schedule)
#   convex/daily/    a run that finds no daily copy younger than 23 h   kept 30 days
#   convex/monthly/  a run that finds no monthly copy younger than 28 d kept 365 days (12)
# A tier is filled by AGE, not by the clock: the first run of a new environment fills all three, and a missed or
# failed midnight run is made good by the next run instead of leaving the tier stale for a day (backup-freshness
# alarms on a daily copy older than 26 h).
set -euo pipefail
shopt -s inherit_errexit
export AWS_REQUEST_CHECKSUM_CALCULATION=when_required AWS_RESPONSE_CHECKSUM_VALIDATION=when_required AWS_PAGER=""
: "${BACKUP_BUCKET:?}" "${BACKUP_ENDPOINT:?}"
W="${BACKUP_WORK:-/work}"
test -s "$W/convex.zip.enc" || { echo "FAILED: $W/convex.zip.enc missing or empty (the export failed)" >&2; exit 1; }
test -s "$W/manifest.json" || { echo "FAILED: $W/manifest.json missing" >&2; exit 1; }
ts="$(date -u +%Y%m%dT%H%M%SZ)"
now="$(date -u +%s)"

# The age in hours of the newest object under convex/<tier>/, or a very large number when it has none. A listing that
# fails is an error (set -e): a tier is never skipped because the bucket could not be read.
age_hours() {
	local newest
	newest="$(aws s3api list-objects-v2 --bucket "$BACKUP_BUCKET" --prefix "convex/$1/" \
		--query 'max(Contents[].LastModified)' --output text --endpoint-url "$BACKUP_ENDPOINT")"
	if [ -z "$newest" ] || [ "$newest" = "None" ]; then echo 1000000; return 0; fi
	echo $(((now - $(date -u -d "$newest" +%s)) / 3600))
}

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
	put "convex/$1/$ts.zip.enc" "$W/convex.zip.enc" "$2"
	put "convex/$1/$ts.manifest.json" "$W/manifest.json" "$2"
}

daily_age="$(age_hours daily)"
monthly_age="$(age_hours monthly)"
tier hourly 2
if [ "$daily_age" -ge 23 ]; then tier daily 30; else echo "daily: newest is ${daily_age} h old, kept"; fi
if [ "$monthly_age" -ge $((28 * 24)) ]; then tier monthly 365; else echo "monthly: newest is ${monthly_age} h old, kept"; fi
