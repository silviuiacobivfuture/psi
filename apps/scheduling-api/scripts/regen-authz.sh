#!/usr/bin/env bash
# Regenerates the OpenFGA modules, the role catalogs and the permission constants from every app's authz.manifest.json
# with SEB's generator in estate mode, as estate/authz.json says: the installed bundle's authz/ (.seb-bundle, the release
# estate/platform.lock pins) is the platform, the artefacts are written under estate/authz/ and src/authz/. Run the
# bundle installer first when .seb-bundle is absent.
set -euo pipefail
repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
if [ ! -f "$repo/.seb-bundle/authz/tools/generate.py" ]; then
	echo "no SEB bundle at $repo/.seb-bundle: install it first (estate/ bundle installer)" >&2
	exit 1
fi
cd "$repo"
AUTHZ_ESTATE_ROOT="$repo" python3 .seb-bundle/authz/tools/generate.py --estate estate/authz.json
