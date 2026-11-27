# shellcheck shell=bash
# Sourced by estate/seb-upgrade.sh, never run: it uses that script's globals (ROOT, LOCK, LEDGER,
# APPS, FIRST_ENV, HOST, REPO, LABEL, WORK, ...) and its refuse/say.
# The bundle in Harbor: its digest, its bundle.json, the lock's values, a tag's commit, --verify.

# digest_of <tag> — the manifest digest Harbor serves for <REPO>:<tag>, read from the
# registry itself (a HEAD on the manifest; podman's local digest can differ from what it
# pushed). Logs in with podman's own credential for HOST, in-process: never argv, never printed.
digest_of() {
  local f auth="" cred tok head
  for f in "${REGISTRY_AUTH_FILE:-}" "${XDG_RUNTIME_DIR:-/run/user/$(id -u)}/containers/auth.json" \
           "$HOME/.config/containers/auth.json" "$HOME/.docker/config.json"; do
    [ -n "$f" ] && [ -r "$f" ] || continue
    auth="$(jq -r --arg h "$HOST" '.auths[$h].auth // empty' "$f")"
    [ -z "$auth" ] || break
  done
  [ -n "$auth" ] || { echo "no podman login for $HOST (podman login $HOST)" > "$WORK/pull.err"; return 1; }
  cred="$(base64 -d <<< "$auth")"; cred=${cred//\\/\\\\}; cred=${cred//\"/\\\"}
  tok="$(printf 'user = "%s"\nurl = "https://%s/service/token?service=harbor-registry&scope=repository:%s/%s:pull"\n' "$cred" "$HOST" "$PROJECT" "$REPOSITORY" \
         | curl -sS --fail --max-time 20 -K - 2>"$WORK/pull.err" | jq -r '.token // empty')" || return 1
  [ -n "$tok" ] || { echo "Harbor issued no pull token for $PROJECT/$REPOSITORY" > "$WORK/pull.err"; return 1; }
  head="$(printf 'header = "Authorization: Bearer %s"\nheader = "Accept: application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.v2+json"\nurl = "https://%s/v2/%s/%s/manifests/%s"\n' "$tok" "$HOST" "$PROJECT" "$REPOSITORY" "$1" \
          | curl -sS -I --max-time 20 -K - 2>"$WORK/pull.err")" || return 1
  if ! grep -qE '^HTTP/[0-9.]+ 200' <<< "$head"; then
    echo "registry answered $(head -n1 <<< "$head" | tr -d '\r') for $PROJECT/$REPOSITORY:$1" > "$WORK/pull.err"; return 1
  fi
  sed -n 's/^[Dd]ocker-[Cc]ontent-[Dd]igest:[[:space:]]*//p' <<< "$head" | tr -d '\r'
}

# bundle_json <digest> — bundle.json of <REPO>@<digest>, pulled by digest. The whole bundle is
# unpacked once into $WORK/bundle-<digest hex> (helm pieces are read from it).
bundle_json() {
  local cid dir="$WORK/bundle-${1#sha256:}"
  if [ ! -d "$dir" ]; then
    podman pull -q "$REPO@$1" >/dev/null 2>"$WORK/pull.err" \
      || refuse "Harbor does not serve $REPO@$1: $(tail -n1 "$WORK/pull.err")"
    cid="$(podman create "$REPO@$1" seb-bundle)"
    mkdir -p "$dir"
    podman export "$cid" | tar -x -C "$dir" bundle.json pieces profiles 2>/dev/null || true
    podman rm "$cid" >/dev/null
  fi
  [ -s "$dir/bundle.json" ] || refuse "$REPO@$1 holds no bundle.json — not a SEB bundle"
  cat "$dir/bundle.json"
}

# lock_value <key> — one value of the lock file, exactly once.
lock_value() {
  local n
  n="$(grep -cE "^$1 = " "$LOCK" || true)"
  [ "$n" = 1 ] || refuse "$LOCK must name $1 exactly once (found $n)"
  sed -n "s/^$1 = //p" "$LOCK"
}

# tag_commit_or_none <version> — the commit SEB's tag v<version> names (peeled), or nothing when
# SEB has no such tag (rc 0); rc 1 only when the repository cannot be read.
tag_commit_or_none() {
  env -u GIT_DIR -u GIT_WORK_TREE -u GIT_INDEX_FILE git ls-remote "$RELEASE_REPO" "refs/tags/v$1" "refs/tags/v$1^{}" 2>"$WORK/ls.err" \
    | awk '{ c = $1 } /\^\{\}$/ { p = $1 } END { print (p != "" ? p : c) }'
}

# release_tag_of <commit> — the SEB release tag (vMAJOR.MINOR.PATCH) that names <commit> (peeled),
# the highest when several do; rc 1 and nothing printed when no release names it.
release_tag_of() {
  local out
  out="$(env -u GIT_DIR -u GIT_WORK_TREE -u GIT_INDEX_FILE git ls-remote --tags "$RELEASE_REPO" 2>"$WORK/ls.err")" || return 1
  out="$(printf '%s\n' "$out" | awk -v c="$1" '
    { t = $2; sub(/^refs\/tags\//, "", t); peeled = sub(/\^\{\}$/, "", t)
      if (peeled) p[t] = $1; else d[t] = $1 }
    END { for (t in d) { e = (t in p) ? p[t] : d[t]; if (e == c && t ~ /^v[0-9]+\.[0-9]+\.[0-9]+$/) print t } }' | sort -V | tail -n 1)"
  [ -n "$out" ] || return 1
  printf '%s\n' "$out"
}

# tag_commit <version> — the commit SEB's tag v<version> names (peeled), asked of the SEB repository.
tag_commit() {
  local c
  c="$(env -u GIT_DIR -u GIT_WORK_TREE -u GIT_INDEX_FILE git ls-remote "$RELEASE_REPO" "refs/tags/v$1" "refs/tags/v$1^{}" 2>"$WORK/ls.err" \
    | awk '{ c = $1 } /\^\{\}$/ { p = $1 } END { print (p != "" ? p : c) }')" \
    || refuse "cannot read release v$1 from $RELEASE_REPO: $(tail -n1 "$WORK/ls.err")"
  [ -n "$c" ] || refuse "the SEB repository $RELEASE_REPO holds no release v$1"
  printf '%s\n' "$c"
}

verify() {
  [ -r "$LOCK" ] || refuse "no lock at $LOCK"
  local version digest source served
  version="$(lock_value version)"; digest="$(lock_value digest)"; source="$(lock_value source)"
  [ "$source" = "$SOURCE" ] || refuse "the lock's source $source is not this estate's bundle repository $SOURCE"
  served="$(digest_of "$version")" \
    || refuse "the lock names $REPO:$version, a tag Harbor does not hold: $(tail -n1 "$WORK/pull.err")"
  [ "$served" = "$digest" ] \
    || refuse "$REPO:$version is now $served, not the locked $digest — a published version moved"
  [ "$(bundle_json "$digest" | jq -r .version)" = "$version" ] || refuse "$REPO@$digest does not say it is $version"
  say "lock holds: $REPO:$version @ $digest"
  # The locked bundle is the release it says it is: built from the commit SEB's tag v<version> names.
  # An estate may number its bundles of one release itself (psi: 0.1.121-psi.1 is SEB's v0.1.121
  # built with psi's identity, seb-upgrade.sh 0.1.121-psi.1 --from-artifact 0.1.121): SEB has no
  # tag v0.1.121-psi.1, so the bundle's own source commit must then be one a SEB release tag names.
  # Before 2026-11-15 that lock was refused ("holds no release v0.1.121-psi.1") on every doctor run.
  local tagged commit release
  commit="$(bundle_json "$digest" | jq -r .source.commit)"
  tagged="$(tag_commit_or_none "$version")" || refuse "cannot read release v$version from $RELEASE_REPO: $(tail -n1 "$WORK/ls.err")"
  if [ -n "$tagged" ]; then
    release="v$version"
  else
    release="$(release_tag_of "$commit")" \
      || refuse "the SEB repository $RELEASE_REPO holds no release v$version, and no SEB release names the bundle's commit ${commit:-(none)}"
    tagged="$commit"
  fi
  [ "$commit" = "$tagged" ] \
    || refuse "$REPO@$digest was not built from release $release ($tagged)"
  say "built from release $release = $tagged"
  signed_release "$version" "$digest" "$tagged"
}
