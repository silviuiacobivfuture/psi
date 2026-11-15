#!/usr/bin/env bash
# --verify accepts an estate's own numbering of a SEB release (estate/lib/seb-upgrade-registry.sh):
# psi locks 0.1.121-psi.1, SEB's v0.1.121 built with psi's identity; SEB has no tag v0.1.121-psi.1,
# so the bundle's source commit must be one a SEB release tag names. Before 2026-11-15 every doctor
# run on psi read "holds no release v0.1.121-psi.1". The same gate in every estate (SEB's
# tools/estate/scaffold/). Offline: a throwaway git repository stands in for SEB's.
#   T1 a lightweight release tag names the commit           → that tag
#   T2 an annotated release tag: matched on the PEELED commit → that tag (never the tag object)
#   T3 only a pre-release tag (v1.2.5-rc.1) names it          → none (rc 1)
#   T4 an untagged commit                                     → none (rc 1)
#   T5 two release tags name one commit                       → the highest (v1.2.10 over v1.2.9)
#   T6 tag_commit_or_none: a tag SEB has → its commit; one it lacks → empty, rc 0
#   T7 an unreadable repository                               → release_tag_of rc 1, tag_commit_or_none rc ≠ 0
#
#   .github/scripts/tests/seb-lock-release_test.sh
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/lib/gate.sh"

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
fails=0
ok() { echo "  ok   $1"; }
bad() { echo "  FAIL $1"; fails=$((fails + 1)); }
eq() { if [ "$2" = "$3" ]; then ok "$1"; else bad "$1: expected [$2], got [$3]"; fi; }
work="$(mktemp -d)"; gate_on_exit "rm -rf '$work'"
command -v git >/dev/null || gate_inconclusive "git is not installed"

repo="$work/seb"
git init -q "$repo"
g() { env -u GIT_DIR -u GIT_WORK_TREE -u GIT_INDEX_FILE git -C "$repo" -c user.name=t -c user.email=t@t "$@"; }
mk() { echo "$1" > "$repo/f"; g add f; g commit -q -m "$1"; g rev-parse HEAD; }
A="$(mk a)"; g tag v1.2.3; g tag v1.2.9; g tag v1.2.10
B="$(mk b)"; g tag -a v1.2.4 -m "release 1.2.4"
C="$(mk c)"; g tag v1.2.5-rc.1
D="$(mk d)"

# The library's functions alone, as --verify calls them.
run() { # <function> <arg> → its output, then "rc=<n>"
  ( set -euo pipefail
    RELEASE_REPO="$repo" WORK="$work"
    refuse() { echo "REFUSED: $*" >&2; exit 1; }
    # shellcheck source=/dev/null
    . "$root/estate/lib/seb-upgrade-registry.sh"
    rc=0; "$1" "$2" || rc=$?; echo "rc=$rc" ) 2>/dev/null
}
eq "T1 a lightweight release tag" "$(printf 'v1.2.10\nrc=0')" "$(run release_tag_of "$A")"
eq "T2 an annotated release tag, on its peeled commit" "$(printf 'v1.2.4\nrc=0')" "$(run release_tag_of "$B")"
TAGOBJ="$(g rev-parse v1.2.4)"
eq "T2 never the tag object itself" "rc=1" "$(run release_tag_of "$TAGOBJ")"
eq "T3 a pre-release tag is not a release" "rc=1" "$(run release_tag_of "$C")"
eq "T4 an untagged commit" "rc=1" "$(run release_tag_of "$D")"
eq "T5 the highest of several (version order, not text)" "v1.2.10" "$(run release_tag_of "$A" | head -n1)"
eq "T6 a tag SEB has" "$(printf '%s\nrc=0' "$B")" "$(run tag_commit_or_none 1.2.4)"
eq "T6 a tag SEB lacks (0.1.121-psi.1's kind)" "$(printf '\nrc=0')" "$(run tag_commit_or_none 1.2.3-psi.1)"
repo="$work/missing"
eq "T7 an unreadable repository: no release" "rc=1" "$(run release_tag_of "$A")"
if [ "$(run tag_commit_or_none 1.2.3 | tail -n1)" != "rc=0" ]; then ok "T7 tag_commit_or_none does not answer 'no such tag' for an unreadable repository"
else bad "T7 an unreadable repository read as 'no such tag'"; fi

gate_finish "$fails"
