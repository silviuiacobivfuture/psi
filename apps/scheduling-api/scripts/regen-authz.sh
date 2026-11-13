#!/usr/bin/env bash
# Regenerates the OpenFGA module, the role catalog and the permission constants from authz.manifest.json with SEB's
# generator, at the release estate/platform.lock pins. Needs a SEB checkout (default ../../../seb relative to the repo,
# or SEB_CHECKOUT); writes nothing outside this repository's estate/authz and src/authz.
set -euo pipefail
repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
seb="${SEB_CHECKOUT:-$repo/../seb}"
version="$(sed -n 's/^version *= *//p' "$repo/estate/platform.lock")"
scratch="$(mktemp -d)"
trap 'rm -rf "$scratch"' EXIT
git -C "$seb" archive "v$version" authz | tar -x -C "$scratch"
mkdir -p "$scratch/apps/scheduling-api" "$scratch/estate"
cp "$repo/apps/scheduling-api/authz.manifest.json" "$scratch/apps/scheduling-api/"
cp "$repo/estate/authz.json" "$scratch/estate/"
cp -r "$repo/estate/authz" "$scratch/estate/authz"
(cd "$scratch" && python3 authz/tools/generate.py --estate estate/authz.json "$scratch/apps/scheduling-api/authz.manifest.json")
cp "$scratch/estate/authz/modules/sched.fga" "$repo/estate/authz/modules/sched.fga"
cp "$scratch/estate/authz/catalog/scheduling-api.roles.json" "$repo/estate/authz/catalog/scheduling-api.roles.json"
cp "$scratch/apps/scheduling-api/src/authz/permissions.generated.ts" "$repo/apps/scheduling-api/src/authz/permissions.generated.ts"
echo "regenerated from SEB v$version"
