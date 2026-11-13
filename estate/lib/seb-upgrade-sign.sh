# shellcheck shell=bash
# Sourced by estate/seb-upgrade.sh, never run: it uses that script's globals (ROOT, REPO, WORK)
# and its refuse/say.
# The lock names a SIGNED SEB release: the digest carries SEB's cosign signature, by the key the
# estate pins (estate/seb-cosign.pub, the trust anchor; it changes only by a reviewed commit, never from
# the bundle being judged), whose annotations name the version the lock names and the commit SEB's
# tag v<version> points at. A digest typed into the lock by hand is unsigned, signed for another
# release, or signed by another key: each is refused by name.
#
# cosign: SEB_COSIGN, else `cosign` on PATH. Registry credentials: the container tools' own login.

SEB_COSIGN_PUB="${SEB_COSIGN_PUB:-$ROOT/estate/seb-cosign.pub}"

# signed_release <version> <digest> <commit> — refuses unless REPO@digest is SEB's signed release.
signed_release() {
  local cosign="${SEB_COSIGN:-cosign}" ref="$REPO@$2" insecure=() out
  command -v "$cosign" >/dev/null 2>&1 || refuse "cosign is not installed: the lock's signature cannot be checked (SEB's tools/release/cosign.sh install <dir>)"
  [ -r "$SEB_COSIGN_PUB" ] || refuse "no SEB public key at $SEB_COSIGN_PUB"
  case "$REPO" in localhost:*|127.0.0.1:*) insecure=(--allow-insecure-registry) ;; esac
  if ! out="$("$cosign" verify --key "$SEB_COSIGN_PUB" --insecure-ignore-tlog=true "${insecure[@]}" \
         -a "seb.version=$1" -a "seb.commit=$3" "$ref" 2>&1 >/dev/null)"; then
    refuse "$ref is not a signed SEB release v$1 ($3): $(grep -m1 -iE 'no matching|no signatures|error' <<< "$out" || tail -n1 <<< "$out")"
  fi
  say "signed: $ref is SEB release v$1 ($3), by $(basename "$SEB_COSIGN_PUB")"
}
