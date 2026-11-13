#!/usr/bin/env bash
# Runs the old-app import (scripts/import-old/main.ts) with tsx. Real runs read the local backend's
# admin key from <repo>/.data/convex/secrets the way convex.sh does (a file, never argv); the
# master key CLINIC_MASTER_KEY and the S3_* variables come from the caller's environment. A dry
# run (--dry-run) needs none of them. Rows never pass through argv.
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
exec pnpm exec tsx scripts/import-old/main.ts "$@"
