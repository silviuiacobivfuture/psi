# shellcheck shell=bash
# Sourced by the upgrade gates (seb-upgrade_test.sh, and SEB's estate-upgrade_test.sh), after
# lib/gate.sh: the doubles a SEB release is taken from, so the estate's real upgrade step
# (estate/seb-upgrade.sh) runs with no network, no credential and no Harbor.
#
#   doubles_up <scratch dir> <SEB tree> <estate root>
#
# <SEB tree> is the installed bundle (.seb-bundle/: bundle.json, pieces/, profiles/, tools/,
# schema/). It sets up, under <scratch dir>:
#   a RELEASE double — a git repository holding a copy of that tree, tagged v9.9.9 (its commit
#     declaring `Take-Needs: $DOUBLES_TAKE_NEEDS` when the caller sets it), which
#     --from-release clones through SEB_RELEASE_REPO ($rel, its commit $relc); its parent is the
#     release the estate's committed lock names (v<locked version>, an empty commit), so the take reads the
#     needs of v<locked>..v9.9.9 from its history as from SEB's (tools/estate/take-order.mjs)
#   a REGISTRY double — podman and curl shims on PATH ($fake/bin) serving bundle 9.9.9: the tree's
#     bundle.json and pieces ($fake/bundle), its version 9.9.9 and its source commit the release's
#   SEB's SIGNATURE on it — a throwaway key pair ($tmp/sign/seb.{key,pub}; never SEB's real key) pinned
#     as the trust anchor, the digest $fd signed for v9.9.9 at the release's commit and $ud beside it
#     unsigned, held in an in-memory registry on loopback ($sreg, lib/oci-registry.mjs) that cosign
#     reads through COSIGN_REPOSITORY. The shims serve whichever digest $fake/digest holds.
#
#   fup <args>… — runs the estate's estate/seb-upgrade.sh against the doubles (stdout+stderr), the
#     lock at $SEB_LOCK when the caller sets it, else <scratch dir>/out/platform.lock; in the estate
#     at $FUP_ESTATE when the caller sets it (a scratch copy), else <estate root>.

doubles_up() {
  local tmp="$1" seb="$2" estate="$3" host here
  here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  host="$(sed -n 's/^REGISTRY_HOST:[[:space:]]*//p' "$estate/estate/identity.yaml")"
  [ -n "$host" ] || gate_abort "the estate's identity names no REGISTRY_HOST"
  _d_tmp="$tmp" _d_estate="$estate"
  rel="$tmp/release"; mkdir -p "$rel"
  cp -r "$seb"/. "$rel/"; chmod -R u+w "$rel"  # the installed bundle is sealed read-only; its copy is not
  # The platform's image list a real release carries: one image kept in Harbor, so the upgrade's
  # image check (images_present) has something to ask the registry double for.
  mkdir -p "$rel/infrastructure/hetzner"
  { echo "# the release double's platform images"
    echo "moved docker.io/library/busybox 1.37.0 sha256:$(printf 'b%.0s' $(seq 64)) # gate"; echo "upstream docker.io/library/alpine 3.22 sha256:$(printf 'a%.0s' $(seq 64)) # gate: never in Harbor"
    # …and any rows the caller adds (DOUBLES_IMAGE_ROWS, one per line): rows only some pieces name.
    [ -z "${DOUBLES_IMAGE_ROWS:-}" ] || printf '%s\n' "$DOUBLES_IMAGE_ROWS"; } > "$rel/infrastructure/hetzner/images.list"
  # The images a real release's piece SOURCE leaves for the estate to build (`image: <ref>:REPLACE_ME`,
  # what bundle.json records as estateImages): the image ↔ piece mapping the take's image-first check
  # reads from the release's history (SEB tools/release/image-contract.mjs).
  local id img
  for id in $(jq -r '.pieces[] | select((.estateImages // []) | length > 0) | .id' "$rel/bundle.json"); do
    for img in $(jq -r --arg id "$id" '.pieces[] | select(.id == $id) | .estateImages[]' "$rel/bundle.json"); do
      printf '        image: %s:REPLACE_ME\n' "$img" >> "$rel/pieces/$id/estate-images.source.yaml"
    done
  done
  local g=(env -u GIT_DIR -u GIT_WORK_TREE -u GIT_INDEX_FILE git -C "$rel" -c user.name=gate -c user.email=gate@invalid -c core.hooksPath=/dev/null) was
  # The COMMITTED lock: what the take reads its needs from (a lock an earlier case wrote is not).
  was="$(env -u GIT_DIR -u GIT_WORK_TREE -u GIT_INDEX_FILE git -C "$estate" show HEAD:estate/platform.lock 2>/dev/null \
    | sed -n 's/^version[[:space:]]*=[[:space:]]*//p' | sed -n 1p)"
  # A lock already at 9.9.9 (the take committed, re-run): the take reads v<the lock before the commit
  # that moved it>..v9.9.9 (tools/estate/take-order.mjs, image-first.mjs), so THAT release is the parent.
  if [ "$was" = 9.9.9 ]; then
    local moved
    moved="$(env -u GIT_DIR -u GIT_WORK_TREE -u GIT_INDEX_FILE git -C "$estate" log -1 --format=%H HEAD -- estate/platform.lock 2>/dev/null)"
    was="$( [ -z "$moved" ] || env -u GIT_DIR -u GIT_WORK_TREE -u GIT_INDEX_FILE git -C "$estate" show "$moved^:estate/platform.lock" 2>/dev/null \
      | sed -n 's/^version[[:space:]]*=[[:space:]]*//p' | sed -n 1p)"
  fi
  "${g[@]}" init -q \
    && { [ -z "$was" ] || [ "$was" = 9.9.9 ] || { "${g[@]}" commit -q --allow-empty -m "release $was" && "${g[@]}" tag "v$was"; }; } \
    && "${g[@]}" add -A && "${g[@]}" commit -qm release ${DOUBLES_TAKE_NEEDS:+-m "Take-Needs: $DOUBLES_TAKE_NEEDS"} \
    && "${g[@]}" tag v9.9.9 || gate_abort "the release double could not be committed"
  relc="$("${g[@]}" rev-parse HEAD)"
  fake="$tmp/fake"; mkdir -p "$fake/bin" "$fake/bundle"
  cp -r "$seb/pieces" "$fake/bundle/"; [ ! -d "$seb/profiles" ] || cp -r "$seb/profiles" "$fake/bundle/"; chmod -R u+w "$fake/bundle"
  jq --arg c "$relc" '.version = "9.9.9" | .source = {commit: $c, dirty: false}' "$seb/bundle.json" >"$fake/bundle/bundle.json"
  local port="$tmp/sign-registry"
  node "$here/oci-registry.mjs" "$port" & _d_pid=$!
  gate_on_exit "kill $_d_pid 2>/dev/null"
  for _ in $(seq 50); do [ -s "$port" ] && break; sleep 0.1; done
  sreg="$(cat "$port" 2>/dev/null)"; [ -n "$sreg" ] || gate_abort "the signature registry double did not come up"
  fd="$(node "$here/oci-registry.mjs" push "$sreg" seb/bundle signed)"
  ud="$(node "$here/oci-registry.mjs" push "$sreg" seb/bundle unsigned)"
  mkdir -p "$tmp/sign"
  ( cd "$tmp/sign" && COSIGN_PASSWORD=gate cosign generate-key-pair --output-key-prefix seb >/dev/null 2>&1 ) \
    || gate_abort "cosign could not generate the throwaway key pair"
  COSIGN_PASSWORD=gate cosign sign --yes --tlog-upload=false --allow-insecure-registry --key "$tmp/sign/seb.key" \
    -a seb.version=9.9.9 -a "seb.commit=$relc" "$sreg/seb/bundle@$fd" >/dev/null 2>&1 \
    || gate_abort "cosign could not sign the release double's bundle"
  echo "$fd" >"$fake/digest"
  # curl: a HEAD answers 200 with the bundle's digest, except a mirror image while $fake/mirror-absent
  # exists (the image check's refusal): empty, every mirror image is absent; else only the mirror
  # repositories it lists, one per line. Anything else is a token.
  cat > "$fake/bin/curl" <<SHIM
#!/usr/bin/env bash
cfg="\$(cat)"
if [[ " \$* " == *" -I "* ]]; then
  absent=0
  if [[ "\$cfg" == *"/v2/mirror/"* ]] && [ -e "$fake/mirror-absent" ]; then
    if [ ! -s "$fake/mirror-absent" ]; then absent=1
    else while IFS= read -r r; do [ -z "\$r" ] || [[ "\$cfg" != *"/v2/mirror/\$r/manifests/"* ]] || absent=1; done < "$fake/mirror-absent"; fi
  fi
  if [ "\$absent" = 1 ]; then printf 'HTTP/2 404\r\n'; else printf 'HTTP/2 200\r\ndocker-content-digest: %s\r\n' "\$(cat "$fake/digest")"; fi
else echo '{"token":"t"}'; fi
SHIM
  printf '#!/usr/bin/env bash\ncase "$1" in create) echo fakecid ;; export) tar -C "%s" -c bundle.json pieces $( [ -d "%s/profiles" ] && echo profiles ) ;; esac\n' "$fake/bundle" "$fake/bundle" >"$fake/bin/podman"
  chmod +x "$fake/bin/curl" "$fake/bin/podman"
  printf '{"auths":{"%s":{"auth":"%s"}}}\n' "$host" "$(printf 'u:p' | base64)" >"$fake/auth.json"
}

fup() {
  ( cd "${FUP_ESTATE:-$_d_estate}" && PATH="$fake/bin:$PATH" REGISTRY_AUTH_FILE="$fake/auth.json" SEB_RELEASE_REPO="file://$rel" \
      SEB_LOCK="${SEB_LOCK:-$_d_tmp/out/platform.lock}" COSIGN_REPOSITORY="$sreg/seb/bundle" SEB_COSIGN_PUB="$_d_tmp/sign/seb.pub" \
      estate/seb-upgrade.sh "$@" 2>&1 )
}
