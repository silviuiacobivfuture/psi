#!/usr/bin/env bash
# Runs the old-app sync (scripts/sync-old/main.ts) with tsx: one tool for local, dev (--anonymize) and production.
# The old app's credentials (OLD_APP_SUPABASE_URL, OLD_APP_SUPABASE_ANON_KEY, OLD_APP_EMAIL, OLD_APP_PASSWORD) come from
# the caller's environment, never argv. On the local backend the admin key is read from <repo>/.data/convex/secrets the
# way import-old.sh does (a file); CLINIC_MASTER_KEY and S3_* come from the environment. Without --anonymize a real run
# also needs SYNC_ALLOW_REAL=1, which only the production CronJob sets.
#
#   scripts/sync-old.sh --mapping scripts/import-old/mapping.example.json --dry-run
#   scripts/sync-old.sh --mapping scripts/import-old/mapping.example.json --anonymize
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PKG="$(cd "$HERE/.." && pwd)"
SECRETS="${PSI_CONVEX_DATA:-$(cd "$PKG/../.." && pwd)/.data/convex}/secrets"
if [ -z "${CONVEX_SELF_HOSTED_ADMIN_KEY:-}" ] && [ -s "$SECRETS/admin-key" ]; then
	CONVEX_SELF_HOSTED_ADMIN_KEY="$(cat "$SECRETS/admin-key")"
	export CONVEX_SELF_HOSTED_ADMIN_KEY
fi
export CONVEX_SELF_HOSTED_URL="${CONVEX_SELF_HOSTED_URL:-http://127.0.0.1:${PSI_CONVEX_PORT:-3210}}"
cd "$PKG"
exec pnpm exec tsx scripts/sync-old/main.ts "$@"
