#!/usr/bin/env bash
# The Convex CLI against the local self-hosted backend, with its admin key read from
# <repo>/.data/convex/secrets (never from a file in this package, so no build context or
# commit can pick it up). Usage: scripts/convex.sh deploy --yes | run seed:demo | env list …
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PKG="$(cd "$HERE/.." && pwd)"
SECRETS="${PSI_CONVEX_DATA:-$(cd "$PKG/../.." && pwd)/.data/convex}/secrets"
if [ ! -s "$SECRETS/admin-key" ]; then
	echo "no admin key: run scripts/local-backend.sh up && scripts/local-backend.sh env first" >&2
	exit 1
fi
export CONVEX_SELF_HOSTED_URL="${CONVEX_SELF_HOSTED_URL:-http://127.0.0.1:${PSI_CONVEX_PORT:-3210}}"
CONVEX_SELF_HOSTED_ADMIN_KEY="$(cat "$SECRETS/admin-key")"
export CONVEX_SELF_HOSTED_ADMIN_KEY
cd "$PKG"
exec npx convex "$@"
