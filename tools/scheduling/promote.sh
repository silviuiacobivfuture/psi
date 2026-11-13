#!/usr/bin/env bash
# Promote a tested build to PRODUCTION: set the image tag of every production overlay of the appointments system to
# <sha> and commit it. CI moves only overlays/dev; production follows this explicit, reviewed commit
# (docs/plans/clinic.md section 9). Run it after the dev smoke tests and the restore drill have passed for <sha>.
#
#   tools/scheduling/promote.sh <sha> [--no-commit]
#
# <sha> is the commit CI built (7 to 40 hex characters; the first 7 are the image tag, as apps.yml tags them). It must be
# the tag dev already runs for scheduling-api, so a build that never reached dev cannot be promoted. --no-commit edits
# the files and stops (to review the diff, or to commit by hand). Pushing is left to the person: the push IS the deploy.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

SERVICES=(scheduling-backend scheduling-deploy scheduling-api clinic)

usage() {
	echo "usage: tools/scheduling/promote.sh <sha> [--no-commit]" >&2
	exit 2
}

[ "$#" -ge 1 ] && [ "$#" -le 2 ] || usage
SHA="$1"
COMMIT=1
if [ "$#" -eq 2 ]; then
	[ "$2" = "--no-commit" ] || usage
	COMMIT=0
fi
case "$SHA" in
*[!0-9a-f]*) echo "promote: <sha> must be lowercase hex" >&2; exit 2 ;;
esac
[ "${#SHA}" -ge 7 ] && [ "${#SHA}" -le 40 ] || { echo "promote: <sha> must be 7 to 40 hex characters" >&2; exit 2; }
TAG="${SHA:0:7}"

# The dev overlay of scheduling-api names the tag dev runs; promoting anything else skips the gate.
DEV_TAG="$(sed -n 's/^[[:space:]]*newTag:[[:space:]]*"\([^"]*\)".*/\1/p' gitops/services/scheduling-api/overlays/dev/kustomization.yaml)"
if [ "$DEV_TAG" != "$TAG" ] && [ -z "${PROMOTE_ALLOW_UNTESTED:-}" ]; then
	echo "promote: dev runs scheduling-api at '$DEV_TAG', not '$TAG': promote what was tested on dev (PROMOTE_ALLOW_UNTESTED=1 overrides, for a hotfix the owner approved)" >&2
	exit 1
fi

FILES=()
for s in "${SERVICES[@]}"; do
	f="gitops/services/$s/overlays/prod/kustomization.yaml"
	[ -f "$f" ] || { echo "promote: $f is missing" >&2; exit 1; }
	grep -q '^[[:space:]]*newTag:' "$f" || { echo "promote: $f has no newTag" >&2; exit 1; }
	FILES+=("$f")
done

for f in "${FILES[@]}"; do
	sed -i "s/^\([[:space:]]*newTag:[[:space:]]*\).*/\1\"$TAG\"/" "$f"
done

if git diff --quiet -- "${FILES[@]}"; then
	echo "promote: production already runs $TAG"
	exit 0
fi

if [ "$COMMIT" -eq 1 ]; then
	git add -- "${FILES[@]}"
	git commit -q -m "chore(gitops): promote $TAG to production [PATCH]" -- "${FILES[@]}"
	echo "promote: committed $TAG for ${SERVICES[*]}; pushing it deploys production"
else
	echo "promote: set $TAG in ${#FILES[@]} overlays (not committed)"
fi
