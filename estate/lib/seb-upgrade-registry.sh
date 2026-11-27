# shellcheck shell=bash
# Sourced by estate/seb-upgrade.sh, never run: it uses that script's globals (ROOT, LOCK, LEDGER,
# APPS, FIRST_ENV, HOST, REPO, LABEL, WORK, ...) and its refuse/say.
# The bundle in Harbor: its digest, its bundle.json, the lock's values, a tag's commit, --verify.

# digest_of <tag> — the manifest digest Harbor serves for <REPO>:<tag>, read from the
# registry itself (a HEAD on the manifest; podman's local digest can differ from what it
# pushed). Logs in with podman's own credential for HOST, in-process: never argv, never printed.
# harbor_cred — podman's login for HOST as "user:password" (shell- and curl-config-escaped), or
# rc 1 with the reason in $WORK/pull.err. In-process only: never argv, never printed.
harbor_cred() {
  local f auth="" cred
  for f in "${REGISTRY_AUTH_FILE:-}" "${XDG_RUNTIME_DIR:-/run/user/$(id -u)}/containers/auth.json" \
           "$HOME/.config/containers/auth.json" "$HOME/.docker/config.json"; do
    [ -n "$f" ] && [ -r "$f" ] || continue
    auth="$(jq -r --arg h "$HOST" '.auths[$h].auth // empty' "$f")"
    [ -z "$auth" ] || break
  done
  [ -n "$auth" ] || { echo "no podman login for $HOST (podman login $HOST)" > "$WORK/pull.err"; return 1; }
  cred="$(base64 -d <<< "$auth")"; cred=${cred//\\/\\\\}; cred=${cred//\"/\\\"}
  printf '%s' "$cred"
}

digest_of() {
  local cred tok head
  cred="$(harbor_cred)" || return 1
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

# images_present <release tree> [piece…] — every image the release's platform list keeps in Harbor
# (class `moved` or `copied` in infrastructure/hetzner/images.list) THAT THIS ESTATE RUNS is served by
# THIS estate's Harbor, in its `mirror` project, at the pinned digest. A release that adds an image
# (0.1.25: AFFiNE's search engine) was otherwise taken, pinned and synced, and the new pod sat in
# ImagePullBackOff until somebody copied the image by hand (measured on the second estate,
# 2026-11-13). Which rows this estate runs is the release's own tools/estate/mirror-scope.mjs, given
# the pieces this take deploys (deploy_set, every --piece, every other estate/seb-pieces.<env>): a row
# only pieces the estate does not deploy name is not asked for, so a lean estate is not made to mirror
# images it never runs. A release without that tool asks for every row, as it always did. Refuses,
# naming every missing image and the command that copies them, before anything is built or written.
images_present() {
  local tree="$1" list="$1/infrastructure/hetzner/images.list" cred cls repo tag dig tok head missing=() kept e
  shift
  [ -r "$list" ] || refuse "the release holds no infrastructure/hetzner/images.list — nothing to check the estate's Harbor against"
  if [ -f "$tree/tools/estate/mirror-scope.mjs" ]; then
    { deploy_set; [ $# = 0 ] || printf '%s\n' "$@"; for e in "${ENVS[@]}"; do cat "$ROOT/estate/seb-pieces.$e"; done; } > "$WORK/deployed"
    kept="$(node "$tree/tools/estate/mirror-scope.mjs" --repo "$ROOT" --list "$list" --identity "$ROOT/estate/identity.yaml" \
              --deployed "$WORK/deployed" 2>"$WORK/scope.err")" \
      || refuse "which of the release's images this estate runs cannot be read: $(grep -m1 '^REFUSED: ' "$WORK/scope.err" || tail -n1 "$WORK/scope.err") — nothing built, nothing written"
    sed 's/^/  images: /' "$WORK/scope.err"
  else
    kept="$(grep -vE '^[[:space:]]*(#|$)' "$list" | awk '$1 == "moved" || $1 == "copied" { print $1, $2, $3, $4 }')"
  fi
  cred="$(harbor_cred)" || refuse "cannot read this estate's Harbor: $(cat "$WORK/pull.err")"
  while read -r cls repo tag dig; do
    [ -n "$cls" ] || continue
    tok="$(printf 'user = "%s"\nurl = "https://%s/service/token?service=harbor-registry&scope=repository:mirror/%s:pull"\n' "$cred" "$HOST" "$repo" \
           | curl -sS --fail --max-time 20 -K - 2>/dev/null | jq -r '.token // empty')" || tok=""
    head="$(printf 'header = "Authorization: Bearer %s"\nheader = "Accept: application/vnd.oci.image.index.v1+json, application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.list.v2+json, application/vnd.docker.distribution.manifest.v2+json"\nurl = "https://%s/v2/mirror/%s/manifests/%s"\n' "$tok" "$HOST" "$repo" "$dig" \
            | curl -sS -I --max-time 20 -K - 2>/dev/null)" || head=""
    grep -qE '^HTTP/[0-9.]+ 200' <<< "$head" || missing+=("$repo:$tag@$dig")
  done <<< "$kept"
  [ "${#missing[@]}" = 0 ] || refuse "this estate's Harbor ($HOST/mirror) does not serve ${#missing[@]} image(s) the release pins: ${missing[*]} — copy them first: IM_LIST=<the release's infrastructure/hetzner/images.list> infrastructure/hetzner/scripts/harbor-mirror-images.sh <env>. Nothing built, nothing written"
  say "images: every image the release keeps in Harbor for the pieces this estate runs is in $HOST/mirror"
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
  # An estate may number its bundles of one release itself (e.g. 0.1.121-acme.1 is SEB's v0.1.121
  # built with that estate's identity, seb-upgrade.sh 0.1.121-acme.1 --from-artifact 0.1.121): SEB has no
  # tag v0.1.121-acme.1, so the bundle's own source commit must then be one a SEB release tag names.
  # Before 2026-11-15 that lock was refused ("holds no release v0.1.121-acme.1") on every doctor run.
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
