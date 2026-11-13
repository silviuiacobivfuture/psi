#!/usr/bin/env bash
# Promote a tested build to PRODUCTION: set the image tag of the production overlays of the appointments system and
# commit it. CI moves only overlays/dev; production follows this explicit, reviewed commit (docs/plans/clinic.md
# section 9). Run it after the dev smoke tests and the restore drill have passed.
#
#   tools/scheduling/promote.sh <sha>   [--no-commit]   the services dev runs at <sha>
#   tools/scheduling/promote.sh dev     [--no-commit]   every service, at the tag dev runs now
#
# CI tags an image with the commit that built it, and builds only the apps that commit changed, so dev's services
# run different tags. <sha> (7 to 40 hex characters; the first 7 are the tag) therefore promotes exactly the services
# whose DEV tag is that commit, and says which it left alone: a tag that dev never ran, and so was never built, can
# not be promoted. `dev` copies each service's current dev tag. scheduling-sync runs the scheduling-deploy image, so it
# follows that service's tag. --no-commit edits the files and stops (to review the diff, or to commit by hand).
# Pushing is left to the person: the push IS the deploy. PROMOTE_ALLOW_UNTESTED=1 sets <sha> on all of them
# (a hotfix the owner approved).
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

# service:the service whose dev overlay names its tag
SERVICES=(
	scheduling-backend:scheduling-backend
	scheduling-deploy:scheduling-deploy
	scheduling-sync:scheduling-deploy
	scheduling-api:scheduling-api
	clinic:clinic
)

usage() {
	echo "usage: tools/scheduling/promote.sh <sha>|dev [--no-commit]" >&2
	exit 2
}

[ "$#" -ge 1 ] && [ "$#" -le 2 ] || usage
WHAT="$1"
COMMIT=1
if [ "$#" -eq 2 ]; then
	[ "$2" = "--no-commit" ] || usage
	COMMIT=0
fi
if [ "$WHAT" != "dev" ]; then
	case "$WHAT" in
	*[!0-9a-f]*) echo "promote: <sha> must be lowercase hex, or 'dev'" >&2; exit 2 ;;
	esac
	[ "${#WHAT}" -ge 7 ] && [ "${#WHAT}" -le 40 ] || { echo "promote: <sha> must be 7 to 40 hex characters" >&2; exit 2; }
	WHAT="${WHAT:0:7}"
fi

tag_of() { sed -n 's/^[[:space:]]*newTag:[[:space:]]*"\([^"]*\)".*/\1/p' "$1"; }

FILES=()
PROMOTED=()
LEFT=()
for pair in "${SERVICES[@]}"; do
	service="${pair%%:*}"
	source="${pair##*:}"
	prod="gitops/services/$service/overlays/prod/kustomization.yaml"
	dev="gitops/services/$source/overlays/dev/kustomization.yaml"
	[ -f "$prod" ] || { echo "promote: $prod is missing" >&2; exit 1; }
	grep -q '^[[:space:]]*newTag:' "$prod" || { echo "promote: $prod has no newTag" >&2; exit 1; }
	dev_tag="$(tag_of "$dev")"
	if [ "$WHAT" = "dev" ]; then
		want="$dev_tag"
	else
		want="$WHAT"
		if [ "$dev_tag" != "$want" ] && [ -z "${PROMOTE_ALLOW_UNTESTED:-}" ]; then
			LEFT+=("$service (dev runs $dev_tag)")
			continue
		fi
	fi
	case "$want" in
	*[!0-9a-f]* | "") LEFT+=("$service (dev has no built image: '$dev_tag')"); continue ;;
	esac
	sed -i "s/^\([[:space:]]*newTag:[[:space:]]*\).*/\1\"$want\"/" "$prod"
	FILES+=("$prod")
	PROMOTED+=("$service@$want")
done

for l in "${LEFT[@]+"${LEFT[@]}"}"; do echo "promote: left alone: $l" >&2; done
if [ "${#FILES[@]}" -eq 0 ]; then
	echo "promote: no production service has a dev tag to promote for '$WHAT'" >&2
	exit 1
fi
if git diff --quiet -- "${FILES[@]}"; then
	echo "promote: production already runs ${PROMOTED[*]}"
	exit 0
fi

if [ "$COMMIT" -eq 1 ]; then
	git add -- "${FILES[@]}"
	git commit -q -m "chore(gitops): promote ${PROMOTED[*]} to production [PATCH]" -- "${FILES[@]}"
	echo "promote: committed ${PROMOTED[*]}; pushing it deploys production"
else
	echo "promote: set ${PROMOTED[*]} (not committed)"
fi
