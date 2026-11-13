#!/bin/sh
# Prints the row count of every user table of a Convex deployment, one `COUNT <table> <n>` line each
# (read-only: a snapshot export through the admin API, counted and discarded; no document content is
# printed). The restore drill (tools/scheduling/restore-drill.sh) runs it against the live backend and
# against the backend restored from the barman archive, and compares the two outputs.
#
#   CONVEX_SELF_HOSTED_URL, CONVEX_SELF_HOSTED_ADMIN_KEY   as deploy.sh
set -eu

: "${CONVEX_SELF_HOSTED_URL:?MISSING REQUIRED SETTING: CONVEX_SELF_HOSTED_URL}"
: "${CONVEX_SELF_HOSTED_ADMIN_KEY:?MISSING REQUIRED SECRET: CONVEX_SELF_HOSTED_ADMIN_KEY}"

convex=./node_modules/.bin/convex
zip=/tmp/count.zip
trap 'rm -f "$zip"' EXIT

"$convex" export --path "$zip" >/dev/null
# A snapshot holds <table>/documents.jsonl per table (one JSON document per line).
unzip -l "$zip" | awk '{print $NF}' | grep '/documents\.jsonl$' | sort | while read -r f; do
	table="${f%/documents.jsonl}"
	echo "COUNT $table $(unzip -p "$zip" "$f" | wc -l | tr -d ' ')"
done
echo "COUNT-DONE"
