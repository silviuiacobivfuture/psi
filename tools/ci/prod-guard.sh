#!/usr/bin/env bash
# Production changes arrive only through the `promote` workflow (.github/workflows/promote.yml, run by hand).
# Argo deploys production from the `prod` branch; that workflow is its only writer. This guard runs on every push
# (.github/workflows/prod-guard.yml) and fails:
#
#   on `prod`  any commit in the push that the promote workflow did not make: every first-parent commit that dev
#              does not hold (DEV_REF, default origin/dev) must carry the `Promote-run:` trailer the workflow writes.
#   on `dev`   any change to a production IMAGE PIN (a `newTag` line in gitops/services/*/overlays/prod/): only the
#              promote workflow sets those, and only on `prod`. Other edits to a production overlay on dev are
#              allowed: they reach production only when a later promotion merges that commit into `prod`.
#
#   tools/ci/prod-guard.sh <branch> <before sha> <after sha>
#
# Exit 0 clean, 1 refused (each offence named), 2 usage. A new branch (before = 40 zeros) is judged from its root.
set -euo pipefail

[ "$#" -eq 3 ] || { echo "usage: tools/ci/prod-guard.sh <branch> <before> <after>" >&2; exit 2; }
BRANCH="$1" BEFORE="$2" AFTER="$3"

if [ "$BEFORE" = "0000000000000000000000000000000000000000" ]; then
	RANGE="$AFTER"
else
	RANGE="$BEFORE..$AFTER"
fi

bad=0
case "$BRANCH" in
prod)
	while read -r c; do
		[ -n "$c" ] || continue
		if ! git log -1 --format=%B "$c" | grep -q '^Promote-run: '; then
			echo "prod-guard: REFUSED: $c reached prod without the promote workflow ($(git log -1 --format=%s "$c"))" >&2
			bad=1
		fi
	done < <(git rev-list --first-parent "$RANGE" --not "${DEV_REF:-origin/dev}")
	;;
dev)
	[ "$RANGE" != "$AFTER" ] || { echo "prod-guard: dev has no previous head to compare with" >&2; exit 2; }
	while read -r f; do
		[ -n "$f" ] || continue
		if git diff "$RANGE" -- "$f" | grep -qE '^[+-][[:space:]]*newTag:'; then
			echo "prod-guard: REFUSED: $f changes a production image pin on dev; production is promoted only by the promote workflow" >&2
			bad=1
		fi
	done < <(git diff --name-only "$RANGE" -- 'gitops/services/*/overlays/prod/*')
	;;
*) ;;
esac

[ "$bad" -eq 0 ] && echo "prod-guard: $BRANCH clean"
exit "$bad"
