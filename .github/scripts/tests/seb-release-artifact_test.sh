#!/usr/bin/env bash
# estate/seb-upgrade.sh --from-artifact: a bundle built from the release's SOURCE ARTIFACT in this
# estate's registry, pushed in SEB's tools/release/publish-source.mjs format (one manifest,
# release.json config, one `git archive` layer) into an in-memory registry on loopback
# (lib/oci-registry.mjs). The same gate in every estate (SEB's tools/estate/scaffold/).
#
#   .github/scripts/tests/seb-release-artifact_test.sh
#
# Fixtures (temp dir only; lib/seb-upgrade-doubles.sh): a RELEASE double — a git repository holding the
# installed bundle's tree, tagged v9.9.x, reached through SEB_RELEASE_REPO; a second commit X2 in it;
# the Harbor double for the BUNDLE (podman and curl shims, on PATH for the upgrade only); SEB's
# signature on that bundle's digest by a throwaway key pair (never SEB's real key) pinned as the trust
# anchor, read by the upgrade's own signed_release through COSIGN_REPOSITORY.
#
#   A1  pins from the artifact: the recorded commit is the tag's; Applications written by digest
#   A2  dry run: the release's own builder runs in the archive's git view and records the TAG'S
#       commit, clean (not DIRTY, not a local commit)
#   Refused, each by its own message, each writing nothing (Applications dir and lock unchanged):
#   R1  a version the registry does not hold          R2  an artifact recording another commit
#   R3  release.json's archive is not the layer       R4  an archive of another commit than release.json
#   R5  a credential that is not robot$pull           R6  no credential
#   R7  an artifact that is not a SEB release         R8  --from-artifact with --from-release / --digest
#   R9  --plain-http to a registry that is not local  R10 a version SEB has no tag for
#   R11 the bundle Harbor serves is not signed (a digest nobody signed)
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/lib/gate.sh"

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$root"
gate_require node "pull the artifact"
gate_require jq "read bundle.json"
gate_require git "the release double"
gate_require cosign "sign the bundle double and check that signature"
. estate/seb-root.sh
seb="$(seb_root "$root" 2>&1)" || gate_inconclusive "no installed SEB bundle ($seb): pnpm install installs the locked one"
# shellcheck source=lib/seb-upgrade-doubles.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib/seb-upgrade-doubles.sh"
[ -r estate/seb-upgrade.conf ] || gate_abort "no estate/seb-upgrade.conf: this estate's upgrade settings are not declared"

pass=0; fail=0
ok()  { echo "  ok   $1"; pass=$((pass + 1)); }
bad() { echo "  FAIL $1"; [ -z "${2:-}" ] || printf '%s\n' "$2" | sed 's/^/       | /'; fail=$((fail + 1)); }
tmp="$(mktemp -d)"
gate_on_exit 'rm -rf "$tmp"'
before="$(git status --porcelain)"
G=(env -u GIT_DIR -u GIT_WORK_TREE -u GIT_INDEX_FILE git)
first="$(sed -n 's/^ENVIRONMENTS:[[:space:]]*//p' estate/identity.yaml)"; first="${first%%,*}"; first="${first//[[:space:]]/}"
apps_src="$(sed -n 's/^apps-dir[[:space:]]*=[[:space:]]*//p' estate/seb-upgrade.conf)"; apps_src="${apps_src//\{env\}/$first}"

# ── the doubles (release v9.9.9 at relc, the bundle 9.9.9 signed), and the release's other tags.
doubles_up "$tmp" "$seb" "$root"
reg="$sreg"
gc() { "${G[@]}" -C "$rel" -c user.name=gate -c user.email=gate@invalid -c core.hooksPath=/dev/null "$@"; }
for v in 9.9.8 9.9.7 9.9.6 9.9.5 9.9.4; do gc tag "v$v"; done
( cd "$rel" && echo planted >X2 ) && gc add X2 && gc commit -qm x2
x2="$(gc rev-parse HEAD)"
arch() { "${G[@]}" -C "$rel" archive --format=tar.gz --prefix="seb-$2/" "$1" >"$tmp/$2-$1.tgz"; printf '%s' "$tmp/$2-$1.tgz"; }

# push <version> <archive> <commit in release.json> [artifactType] [archive file release.json describes]
cat >"$tmp/push.mjs" <<'JS'
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
const [reg, version, archivePath, commit, type, describedPath] = process.argv.slice(2);
const sha = (b) => `sha256:${createHash("sha256").update(b).digest("hex")}`;
const base = `http://${reg}/v2/seb/release`;
const put = async (b) => {
  const d = sha(b); const s = await fetch(`${base}/blobs/uploads/`, { method: "POST" });
  const loc = new URL(s.headers.get("location"), `http://${reg}`); loc.searchParams.set("digest", d);
  const r = await fetch(loc, { method: "PUT", body: b, headers: { "content-type": "application/octet-stream" } });
  if (r.status !== 201) throw new Error(`blob ${r.status}`); return d;
};
const archive = readFileSync(archivePath); const described = readFileSync(describedPath || archivePath);
const config = Buffer.from(JSON.stringify({ format: "seb-release/1", version, commit,
  archive: { name: `seb-${version}.tar.gz`, sha256: sha(described), size: described.length } }));
const m = JSON.stringify({ schemaVersion: 2, mediaType: "application/vnd.oci.image.manifest.v1+json",
  artifactType: type || "application/vnd.seb.release.v1",
  config: { mediaType: "application/vnd.seb.release.config.v1+json", digest: await put(config), size: config.length },
  layers: [{ mediaType: "application/vnd.seb.release.source.v1.tar+gzip", digest: await put(archive), size: archive.length }] });
const r = await fetch(`${base}/manifests/${version}`, { method: "PUT", body: m, headers: { "content-type": "application/vnd.oci.image.manifest.v1+json" } });
if (r.status !== 201) throw new Error(`manifest ${r.status} ${await r.text()}`);
JS
push() { node "$tmp/push.mjs" "$reg" "$@"; }
push 9.9.9 "$(arch "$relc" 9.9.9)" "$relc"
push 9.9.7 "$(arch "$x2" 9.9.7)" "$x2"                                   # R2: records X2, tag is relc
push 9.9.6 "$(arch "$relc" 9.9.6)" "$relc" "" "$(arch "$x2" 9.9.6)"      # R3: release.json describes another archive
push 9.9.5 "$(arch "$x2" 9.9.5)" "$relc"                                 # R4: archive of X2, release.json says relc
push 9.9.4 "$(arch "$relc" 9.9.4)" "$relc" "application/vnd.oci.image.config.v1+json"  # R7
# A2: release v9.9.2's builder is a probe saying what git shows it (the commit it would record, clean
# or not), so the archive's git view is seen from inside the builder; the fixture tree itself is not
# a full SEB source (its consumer record refuses a real build, from a clone just the same).
mkdir -p "$rel/tools/bundle"
cat >"$rel/tools/bundle/build.mjs" <<'JS'
// probe: accepts --estate-components; prints what the real builder would record
import { execFileSync } from "node:child_process";
const g = (...a) => execFileSync("git", a, { encoding: "utf8" }).trim();
const v = process.argv[process.argv.indexOf("--version") + 1];
console.log(`bundle ${v} from ${g("rev-parse", "HEAD")}${g("status", "--porcelain", "--", ".") ? " (DIRTY)" : ""} listing ${g("ls-files").split("\n").length} files`);
JS
gc add tools/bundle/build.mjs && gc commit -qm probe && gc tag v9.9.2
probec="$(gc rev-parse HEAD)"
probefiles="$(gc ls-files | wc -l)"
push 9.9.2 "$(arch "$probec" 9.9.2)" "$probec"

authf() { printf '{"auths":{"%s":{"auth":"%s"}}}\n' "$reg" "$(printf '%s:secret' "$1" | base64)" >"$tmp/release-auth-$2.json"; printf '%s' "$tmp/release-auth-$2.json"; }
PULL_AUTH="$(authf 'robot$pull' pull)"
mkdir -p "$tmp/out"; cp -r "$apps_src" "$tmp/out/apps" 2>/dev/null || mkdir -p "$tmp/out/apps"
[ -e "$tmp/out/apps/repo-seb-bundle.yaml" ] || : > "$tmp/out/apps/repo-seb-bundle.yaml"
snap() { find "$tmp/out" -type f -print0 | sort -z | xargs -0 sha256sum | sha256sum; }
# fua [VAR=value…] -- <upgrade args> — the upgrade against the doubles and the artifact registry.
fua() {
  local envs=(); while [ "$1" != -- ]; do envs+=("$1"); shift; done; shift
  ( export SEB_RELEASE_REGISTRY="$reg" SEB_RELEASE_PLAIN_HTTP=1 SEB_RELEASE_AUTH_FILE="$PULL_AUTH"
    local e; for e in "${envs[@]}"; do export "${e?}"; done
    fup "$@" )
}

echo "── refused, nothing written"
base_snap="$(snap)"
refused() { # <name> <needle> <fua args…>
  local name="$1" needle="$2"; shift 2; local out rc=0
  out="$(fua "$@")" || rc=$?
  if [ "$rc" = 0 ]; then bad "$name: passed" "$out"
  elif ! grep -qF -- "$needle" <<<"$out"; then bad "$name: refused for another reason" "$out"
  elif [ "$(snap)" != "$base_snap" ] || [ -e "$tmp/out/platform.lock" ]; then bad "$name: refused but wrote" "$out"
  else ok "$name — $(grep -m1 REFUSED <<<"$out" | cut -c1-120)"; fi
}
A=(--apps-dir "$tmp/out/apps")
refused "R1 a version the registry does not hold" "release:9.9.8 is not published" -- 9.9.8 --from-artifact 9.9.8 "${A[@]}"
refused "R2 an artifact recording another commit" "records commit $x2, but SEB's tag v9.9.7 is $relc" -- 9.9.7 --from-artifact 9.9.7 "${A[@]}"
refused "R3 release.json's archive is not the layer" "release.json's archive is not the artifact's layer" -- 9.9.6 --from-artifact 9.9.6 "${A[@]}"
refused "R4 an archive of another commit than release.json" "the archive is of commit $x2, release.json says $relc" -- 9.9.5 --from-artifact 9.9.5 "${A[@]}"
refused "R5 a credential that is not robot\$pull" 'pulled with the pull-only robot robot$pull, not robot$ci-robot' \
  "SEB_RELEASE_AUTH_FILE=$(authf 'robot$ci-robot' ci)" -- 9.9.9 --from-artifact 9.9.9 "${A[@]}"
refused "R6 no credential" "MISSING REGISTRY CREDENTIAL: SEB_RELEASE_AUTH_FILE" SEB_RELEASE_AUTH_FILE= -- 9.9.9 --from-artifact 9.9.9 "${A[@]}"
refused "R7 an artifact that is not a SEB release" "is not a SEB release" -- 9.9.4 --from-artifact 9.9.4 "${A[@]}"
refused "R8 --from-artifact with --from-release" "take the release one way" -- 9.9.9 --from-artifact 9.9.9 --from-release v9.9.9 "${A[@]}"
refused "R8 --from-artifact with --digest" "--digest and --from-artifact" -- 9.9.9 --from-artifact 9.9.9 --digest "$fd" "${A[@]}"
refused "R9 --plain-http to a registry that is not local" "--plain-http is for a local registry only" \
  SEB_RELEASE_REGISTRY=registry.example.org -- 9.9.9 --from-artifact 9.9.9 "${A[@]}"
refused "R10 a version SEB has no tag for" "holds no release v9.9.3" -- 9.9.3 --from-artifact 9.9.3 "${A[@]}"
echo "$ud" >"$fake/digest"
refused "R11 the bundle Harbor serves is not signed" "is not a signed SEB release v9.9.9" -- 9.9.9 --from-artifact 9.9.9 "${A[@]}"
echo "$fd" >"$fake/digest"

echo "── taken from the artifact"
out="$(fua -- 9.9.2 --from-artifact 9.9.2 --dry-run "${A[@]}")" || true
if grep -qx "  build: bundle 9.9.2 from $probec listing $probefiles files" <<<"$out" && [ "$(snap)" = "$base_snap" ]; then
  ok "A2 dry run: inside the release's own builder git shows the tag's commit ${probec:0:12}, clean, all $probefiles files listed; nothing written"
else bad "A2 the dry run's build did not record the tag's commit cleanly (or wrote)" "$out"; fi
if out="$(fua -- 9.9.9 --from-artifact 9.9.9 "${A[@]}")" \
   && grep -qF "= $relc (= SEB's tag v9.9.9)" <<<"$out" \
   && grep -qx "version = 9.9.9" "$tmp/out/platform.lock" && grep -qx "digest = $fd" "$tmp/out/platform.lock" \
   && { [ -z "$(estate/seb-upgrade.sh --deploy-set 2>/dev/null)" ] || grep -lqx "    targetRevision: $fd" "$tmp/out/apps"/seb-*.yaml; }; then
  ok "A1 pinned from release:9.9.9 (commit = tag v9.9.9); Applications by digest, lock written"
else bad "A1 the upgrade from the artifact did not pin" "$out"; fi

[ "$(git status --porcelain)" = "$before" ] && ok "the working tree is exactly as before" \
  || bad "the cases changed the working tree" "$(git status --porcelain)"
echo "── $pass ok, $fail failed"
gate_finish "$fail"
