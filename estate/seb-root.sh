#!/usr/bin/env bash
# THE ONE ENTRY POINT from the estate to SEB's tools (the identity loader, the secrets
# declarations tool, …). No estate file names seb/ directly: it sources this and asks
#
#   . <repo>/estate/seb-root.sh
#   loader="$(seb_root "<repo>")/tools/identity/load.mjs"
#
# seb_root <repo root> prints the directory that holds SEB's tree, first found of:
#   1. $SEB_ROOT                    set by the caller (a test's copy, a CI job, another bundle)
#   2. <repo>/.seb-bundle           where estate/seb-bundle-install.mjs installs the
#                                   locked bundle (postinstall; .github/actions/seb-bundle in
#                                   CI), once it carries a bundle.json
# and FAILS LOUD (rc 1, on stderr) when neither exists. The estate holds no copy of SEB's source:
# SEB is changed in its own repository and reaches the estate only as the released bundle
# estate/platform.lock pins.
# Mirror for Node: seb-root.mjs (same order, same refusal).
# shellcheck shell=bash

seb_root() {
  local repo="${1:?seb_root: the repository root is required}"
  if [ -n "${SEB_ROOT:-}" ]; then
    [ -d "$SEB_ROOT" ] || { echo "seb_root: SEB_ROOT=$SEB_ROOT is not a directory" >&2; return 1; }
    printf '%s\n' "$SEB_ROOT"; return 0
  fi
  if [ -f "$repo/.seb-bundle/bundle.json" ]; then printf '%s\n' "$repo/.seb-bundle"; return 0; fi
  echo "seb_root: no SEB tree for $repo — set SEB_ROOT, or install the locked bundle (estate/platform.lock)" >&2
  return 1
}
