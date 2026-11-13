# shellcheck shell=bash
# Sourced by estate/seb-upgrade.sh, never run: it uses that script's globals (ROOT, LOCK, LEDGER,
# APPS, FIRST_ENV, HOST, REPO, LABEL, WORK, ...) and its refuse/say.
# Where a release's bundle comes from: the dry run's comparison, --from-release, --from-artifact, the build from a SEB tree.

# compare_bundles <old-dir> <new-dir> <commit> — the dry run's verdict on an unpacked release
# bundle (<new-dir>) against the unpacked locked one (<old-dir>): built from <commit>, and every
# piece of the locked bundle present and byte-identical. A piece only the release has is ADDED,
# not a difference (nothing runs it yet; it is switched on by its own --piece). A locked piece the
# release drops, or renders differently, is. A piece that only GAINS kustomization.yaml (SEB's
# estate-images: the same render, its image tag settable by this estate) is identical when that
# kustomization builds to the locked render byte for byte. Prints one line per piece; returns 1 on any difference.
compare_bundles() {
  local old="$1" new="$2" commit="$3" differ=0 id a b
  [ "$(jq -r .source.commit "$new/bundle.json")" = "$commit" ] || { say "DIFFERS bundle.json: not built from $commit"; differ=1; }
  a="$(jq -r '[.pieces[].id] | join(" ")' "$old/bundle.json")"; b="$(jq -r '[.pieces[].id] | join(" ")' "$new/bundle.json")"
  for id in $a; do
    if [[ " $b " != *" $id "* ]]; then say "DIFFERS pieces/$id: the locked bundle has it, the release drops it"; differ=1
    elif diff -r "$old/pieces/$id" "$new/pieces/$id" > "$WORK/diff" 2>&1; then
      say "IDENTICAL pieces/$id ($(find "$new/pieces/$id" -type f | wc -l) file(s), $(jq -r --arg id "$id" '.pieces[] | select(.id == $id) | .sum' "$new/bundle.json"))"
    elif [ "$(cat "$WORK/diff")" = "Only in $new/pieces/$id: kustomization.yaml" ] \
         && kubectl kustomize "$new/pieces/$id" 2>/dev/null | cmp -s - "$new/pieces/$id/rendered.yaml"; then
      # SEB tools/bundle/estate-images.mjs: the render, now also a kustomization so this estate sets
      # its own image's tag; what it builds to is the locked render byte for byte.
      say "IDENTICAL pieces/$id render (+ kustomization.yaml building to it byte for byte: image tags $(jq -r --arg id "$id" '.pieces[] | select(.id == $id) | (.estateImages // []) | join(", ")' "$new/bundle.json") settable)"
    else say "DIFFERS pieces/$id:"; sed -n 's/^/    /;1,20p' "$WORK/diff"; differ=1; fi
  done
  for id in $b; do [[ " $a " == *" $id "* ]] || say "ADDED pieces/$id (not in the locked bundle; not compared)"; done
  return "$differ"
}

# from_release <version> <tag> <dry-run 0|1> <apps> [piece…] — build the bundle from the SEB
# release <tag>, then (unless dry run) publish and pin it.
from_release() {
  local version="$1" tag="$2" dry="$3" apps="$4"; shift 4
  [[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$ ]] || refuse "version \"$version\" is not major.minor.patch[-pre]"
  [[ "$tag" =~ ^v[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$ ]] || refuse "tag \"$tag\" is not v<major.minor.patch[-pre]>"
  local clone="$WORK/release" commit
  env -u GIT_DIR -u GIT_WORK_TREE -u GIT_INDEX_FILE git clone -q --depth 1 --branch "$tag" "$RELEASE_REPO" "$clone" 2>"$WORK/clone.err" \
    || refuse "the SEB repository $RELEASE_REPO holds no release $tag: $(tail -n1 "$WORK/clone.err")"
  commit="$(git -C "$clone" rev-parse HEAD)"
  say "release $tag = $commit ($RELEASE_REPO)"
  from_tree "$version" "$tag" "$commit" "$clone" "$dry" "$apps" "$@"
}

# from_artifact <version> <release version> <dry-run 0|1> <apps> [piece…] — the same, from the
# release's SOURCE ARTIFACT in this estate's Harbor (<registry>/seb/release:<release version>, SEB's
# tools/release/publish-source.mjs), pulled with the pull-only robot (estate/seb-release-artifact.mjs
# checks every digest, release.json and the archive's own commit). REFUSES unless the commit it
# records is the one SEB's tag v<release version> names. The archive is then given a git view in
# which HEAD is that commit (a replace ref onto a local commit of exactly the archive's files), so
# the release's bundle builder records the release's commit, as from a clone.
from_artifact() {
  local version="$1" aver="$2" dry="$3" apps="$4"; shift 4
  [[ "$aver" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$ ]] || refuse "artifact version \"$aver\" is not major.minor.patch[-pre]"
  local reg="${SEB_RELEASE_REGISTRY:-$HOST}" tagged out commit adigest tree="$WORK/release" local_c
  local pargs=(--registry "$reg" --project "$PROJECT" --repository release --version "$aver" --out "$WORK/release.tar.gz")
  [ "${SEB_RELEASE_PLAIN_HTTP:-0}" != 1 ] || pargs+=(--plain-http)
  tagged="$(tag_commit "$aver")"
  out="$(node "$ROOT/estate/seb-release-artifact.mjs" "${pargs[@]}" 2>&1)" \
    || refuse "the release artifact $reg/$PROJECT/release:$aver: $(grep -m1 '^REFUSED: ' <<< "$out" | sed 's/^REFUSED: //' || tail -n1 <<< "$out")"
  commit="${out%% *}"; adigest="${out##* }"
  [ "$commit" = "$tagged" ] \
    || refuse "the release artifact $reg/$PROJECT/release:$aver records commit $commit, but SEB's tag v$aver is $tagged — nothing built, nothing written"
  say "release artifact $reg/$PROJECT/release:$aver @ $adigest = $commit (= SEB's tag v$aver)"
  mkdir -p "$tree"
  tar -xzf "$WORK/release.tar.gz" -C "$tree" --strip-components=1 || refuse "the release archive does not unpack"
  local g=(env -u GIT_DIR -u GIT_WORK_TREE -u GIT_INDEX_FILE git -C "$tree" -c core.hooksPath=/dev/null -c user.name=seb-upgrade -c user.email=seb-upgrade@invalid)
  "${g[@]}" init -q -b release && "${g[@]}" add -A -f && "${g[@]}" commit -q --no-verify -m "release $aver ($commit)" \
    || refuse "cannot give the release archive a git view"
  local_c="$("${g[@]}" rev-parse HEAD)"
  "${g[@]}" update-ref "refs/replace/$commit" "$local_c"
  printf '%s\n' "$commit" > "$("${g[@]}" rev-parse --absolute-git-dir)/refs/heads/release"
  [ "$("${g[@]}" rev-parse HEAD)" = "$commit" ] && [ -z "$("${g[@]}" status --porcelain)" ] \
    || refuse "the release archive's git view does not stand at $commit, clean"
  from_tree "$version" "v$aver" "$commit" "$tree" "$dry" "$apps" "$@"
}

# from_tree <version> <tag> <commit> <tree> <dry-run 0|1> <apps> [piece…] — build bundle <version>
# with the release tree's own builder, then (unless dry run) publish and pin it.
from_tree() {
  local version="$1" tag="$2" commit="$3" clone="$4" dry="$5" apps="$6"; shift 6
  local out
  [ -f "$clone/tools/bundle/build.mjs" ] || refuse "release $tag holds no tools/bundle/build.mjs"
  local args=(--version "$version" --registry "$HOST" --project "$PROJECT" --repository "$REPOSITORY" --identity "$ROOT/estate/identity.yaml")
  [ "$dry" = 0 ] || args+=(--dry-run)
  estate_components "$clone" args
  # A version Harbor already serves is never rebuilt (it is never re-pushed): re-running the pin
  # for it skips the build, and the source-commit check below still refuses one not built from
  # this release.
  if [ "$dry" = 0 ] && digest_of "$version" > /dev/null 2>&1; then
    say "bundle $version is already published: not rebuilt; pinning it if it was built from $tag"
  else
    out="$(cd "$clone" && env -u GIT_DIR -u GIT_WORK_TREE -u GIT_INDEX_FILE node tools/bundle/build.mjs "${args[@]}" 2>&1)" \
      || refuse "the release's bundle builder refused: $(grep -m1 REFUSED <<< "$out" || tail -n1 <<< "$out")"
    sed 's/^/  build: /' <<< "$out"
  fi
  if [ "$dry" = 1 ]; then
    local cid new="$WORK/new" ldigest old differ=0
    cid="$(podman create "$REPO:$version" seb-bundle)"
    mkdir -p "$new"; podman export "$cid" | tar -x -C "$new" bundle.json pieces profiles 2>/dev/null || true; podman rm "$cid" >/dev/null
    [ -s "$new/bundle.json" ] || refuse "the release's bundle holds no bundle.json"
    podman rmi -f "$REPO:$version" >/dev/null 2>&1 || true
    ldigest="$(lock_value digest)"
    bundle_json "$ldigest" >/dev/null
    old="$WORK/bundle-${ldigest#sha256:}"
    compare_bundles "$old" "$new" "$commit" || differ=1
    # Profiles: each one the locked bundle carries renders byte-identical; a new one is listed.
    local p
    for p in $(jq -r '.pieces[] | .profiles[]? | .path' "$old/bundle.json"); do
      if diff -r "$old/$p" "$new/$p" > "$WORK/diff" 2>&1; then say "IDENTICAL $p"
      else say "DIFFERS $p:"; sed -n 's/^/    /;1,20p' "$WORK/diff"; differ=1; fi
    done
    for p in $(jq -r '.pieces[] | .profiles[]? | .path' "$new/bundle.json"); do
      jq -e --arg p "$p" '[.pieces[] | .profiles[]? | .path] | index($p)' "$old/bundle.json" >/dev/null \
        || say "NEW $p: not in the locked bundle"
    done
    [ "$differ" = 0 ] || refuse "release $tag changes or drops a piece of the locked bundle $(lock_value version) — dry run, nothing written"
    say "dry run: release $tag renders every piece of the locked bundle $(lock_value version) byte for byte (pieces it adds are not compared: nothing runs them yet); nothing pushed, nothing written"
    return 0
  fi
  local digest
  digest="$(digest_of "$version")" || refuse "Harbor does not serve the bundle just pushed: $(tail -n1 "$WORK/pull.err")"
  [ "$(bundle_json "$digest" | jq -r .source.commit)" = "$commit" ] \
    || refuse "$REPO:$version ($digest) was not built from release $tag ($commit) — nothing written"
  # The release's own tools render its helm pieces (its identity loader knows its schema's keys;
  # .seb-bundle/ is still the previous release until the lock is installed).
  SEB_ROOT="$clone" upgrade "$version" "$digest" "$apps" "$@"
}
