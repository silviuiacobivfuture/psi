#!/bin/bash
# The backups' alarm. CHECKS lists `<bucket>|<prefix>|<max age in hours>` (space separated); for each, the newest object
# under the prefix (in the backup location) must be younger than that. Any stale or missing one fails the Job, which
# estate-watch reports to the infra channel within ten minutes (a failed newest run of any CronJob is an alert). It
# prints every check and its age, so the log of the last run is the backups' state.
source /scripts/lib.sh
: "${CHECKS:?}"
now="$(date -u +%s)"
failed=0
for check in $CHECKS; do
	bucket="${check%%|*}"
	rest="${check#*|}"
	prefix="${rest%%|*}"
	hours="${rest##*|}"
	newest="$(retry aws s3api list-objects-v2 --bucket "$bucket" --prefix "$prefix" --endpoint-url "$BACKUP_ENDPOINT" \
		--query 'max_by(Contents || `[]`, &LastModified).LastModified' --output text 2>/dev/null || echo None)"
	if [ -z "$newest" ] || [ "$newest" = "None" ] || [ "$newest" = "null" ]; then
		echo "MISSING $bucket/$prefix: no object (wanted one younger than ${hours}h)"
		failed=1
		continue
	fi
	age=$(((now - $(date -u -d "$newest" +%s)) / 60))
	if [ "$age" -gt $((hours * 60)) ]; then
		echo "STALE   $bucket/$prefix: newest is ${age} min old (limit ${hours}h)"
		failed=1
	else
		echo "OK      $bucket/$prefix: newest is ${age} min old (limit ${hours}h)"
	fi
done
exit "$failed"
