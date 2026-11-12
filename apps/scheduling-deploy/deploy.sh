#!/bin/sh
# Deploys @psi/scheduling's Convex functions to the in-cluster backend, then makes sure the server
# key is set INSIDE the deployment. Runs as an Argo PostSync Job (gitops/services/scheduling-deploy).
# It deploys schema, functions and crons ONLY: it never runs a function, so the DEMO seed
# (convex/seed.ts, internal, admin-key only) is never called here. Nothing is printed but progress.
#
#   CONVEX_SELF_HOSTED_URL          the backend's in-cluster Service URL
#   CONVEX_SELF_HOSTED_ADMIN_KEY    the deployment's admin key (OpenBao, apps/scheduling/admin)
#   PSI_SCHEDULING_KEY              the server key the public functions demand (apps/scheduling/env)
set -eu

: "${CONVEX_SELF_HOSTED_URL:?MISSING REQUIRED SETTING: CONVEX_SELF_HOSTED_URL}"
: "${CONVEX_SELF_HOSTED_ADMIN_KEY:?MISSING REQUIRED SECRET: CONVEX_SELF_HOSTED_ADMIN_KEY}"
: "${PSI_SCHEDULING_KEY:?MISSING REQUIRED SECRET: PSI_SCHEDULING_KEY}"

convex=./node_modules/.bin/convex

# On a first install the backend may still be starting (PostSync runs after the sync is healthy,
# but a restore or a node move can still be in flight): wait up to ten minutes.
tries=0
until wget -q -T 5 -O /dev/null "$CONVEX_SELF_HOSTED_URL/version"; do
	tries=$((tries + 1))
	if [ "$tries" -ge 120 ]; then
		echo "the backend did not answer on its Service within ten minutes" >&2
		exit 1
	fi
	sleep 5
done
echo "backend is up"

# The key goes in over stdin, as in packages/scheduling/scripts/local-backend.sh: never in argv.
printf '%s' "$PSI_SCHEDULING_KEY" | "$convex" env set --force PSI_SCHEDULING_KEY >/dev/null
echo "PSI_SCHEDULING_KEY is set in the deployment"

# Type-checking and code generation are CI's job (pnpm affected); _generated is committed.
"$convex" deploy --yes --typecheck disable --codegen disable
echo "functions deployed"
