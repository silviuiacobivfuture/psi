#!/usr/bin/env bash
# The estate's upgrade step (estate/seb-upgrade.sh) and CI's image-tag step (estate/seb-image-tags.mjs),
# proven both ways WITHOUT SEB's source: everything SEB is read from the installed, locked bundle
# (.seb-bundle/, via estate/seb-root.sh), and the release and registry are doubles built from it
# (lib/seb-upgrade-doubles.sh). The same gate in every estate (SEB's tools/estate/scaffold/); what it
# judges is THIS estate's settings (estate/seb-upgrade.conf), lists and generated Applications.
#
#   .github/scripts/tests/seb-upgrade_test.sh
#
# The settings (estate/seb-upgrade.conf), each REFUSED by name (planted on a copy):
#   C1 no settings file   C2 no release-repo   C3 an apps-dir with no {env}
#   C4 a path leaving the repository   C5 a key named twice   C6 a piece-map with no ledger
# What a PLAIN upgrade (no --piece) deploys, from the lists alone (--deploy-set):
#   U12 every Application a past upgrade generated into the first environment's apps-dir is in it,
#       so a plain upgrade never removes a switched piece
#   U13 REFUSED (planted): with neither list (estate/seb-pieces.<first env>, the ledger) every one of
#       them is dropped — the deploy set comes from the lists and nowhere else
#   U22 every piece estate/seb-pieces.<first env> lists is in it, and without that file only the
#       ledger's remain (planted)
#   U23 a piece named twice is deployed once
#   U24 REFUSED (planted): an entry that is not a piece id (<id>@<profile>)
# Against the release and registry doubles (writes only into a scratch dir):
#   U11 a plain upgrade to 9.9.9 writes the lock and every Application by the new digest, each
#       naming it in spec.info and labelled platform.<ESTATE_LABEL_DOMAIN>/source: seb-bundle
#   U15 a piece whose image the estate builds (bundle.json estateImages): its Application carries the
#       tag the estate's component pins; what Argo renders from it is the bundle's render byte for byte
#   U15b REFUSED, nothing written: the same bundle served UNSIGNED (a digest nobody signed)
#   U16 a simulated CI deploy step (tag into the component, estate/seb-image-tags.mjs --write) moves
#       the Application's tag, and the render Argo deploys changes in that image line only
#   U17 REFUSED, nothing written: an Application from a bundle that takes no tag — the deploy step
#       fails instead of pushing an image nothing deploys
#   U18 a piece whose objects name several namespaces, or none, keeps its predecessor's destination
#   U19 REFUSED, nothing written (planted): the same with no predecessor to take it from
#   U25 the dry run's comparison: a bundle against itself is IDENTICAL piece by piece; a piece only
#       the release has is ADDED, not a difference
#   U26 REFUSED (planted): a locked piece the release renders differently, and one it drops
#   E1 REFUSED, nothing written: another environment's apps-dir with no repo-seb-bundle.yaml
#   E2 --env <env> writes that environment's Applications by the locked digest, each keeping the
#      first environment's name (a piece it newly takes)
#   E3 REFUSED, nothing written: an entry naming a profile the bundle does not carry
#   E4 REFUSED: --env for the first environment (an upgrade writes it)
# A HELM piece's Application (estate/seb-helm-app.mjs), from a planted template:
#   U20 every ${KEY} naming an identity key is filled from this estate's identity; shell
#       `${VAR:-}`, `${HOME}` and a key-shaped name the schema lacks stay literal, values text for text
#   U21 REFUSED, nothing on stdout (planted): an identity key the schema defines and this estate
#       does not set
# A case this estate cannot exercise (it builds no image a deployed piece runs; it deploys no
# piece without exactly one namespace) says `n/a` and why. Last: the working tree is exactly as before.
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/lib/gate.sh"

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$root"
gate_require node "run the upgrade's helpers"
gate_require jq "read bundle.json"
gate_require git "clone the release double"
gate_require kubectl "render what Argo deploys"
gate_require cosign "sign the release double's bundle and check that signature"
. estate/seb-root.sh
seb="$(seb_root "$root" 2>&1)" || gate_inconclusive "no installed SEB bundle ($seb): pnpm install installs the locked one"
# shellcheck source=lib/seb-upgrade-doubles.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib/seb-upgrade-doubles.sh"

pass=0
fail=0
ok()  { echo "  ok   $1"; pass=$((pass + 1)); }
bad() { echo "  FAIL $1"; [ -z "${2:-}" ] || printf '%s\n' "$2" | sed 's/^/       | /'; fail=$((fail + 1)); }
na()  { echo "  n/a  $1"; }
tmp="$(mktemp -d)"
gate_on_exit 'rm -rf "$tmp"'
before="$(git status --porcelain)"
idv() { sed -n "s/^$1:[[:space:]]*//p" estate/identity.yaml; }
confv() { sed -n "s/^$1[[:space:]]*=[[:space:]]*//p" estate/seb-upgrade.conf 2>/dev/null; }
[ -r estate/seb-upgrade.conf ] || gate_abort "no estate/seb-upgrade.conf: this estate's upgrade settings are not declared"
first="$(idv ENVIRONMENTS)"; first="${first%%,*}"; first="${first//[[:space:]]/}"
label="platform.$(idv ESTATE_LABEL_DOMAIN)/source"
apps_rel="$(confv apps-dir)"; apps_rel="${apps_rel//\{env\}/$first}"
apps_src="$root/$apps_rel"
first_list="estate/seb-pieces.$first"
ledger="$(confv ledger)"; [ -z "$ledger" ] || ledger="$root/$ledger"
digest_locked="$(sed -n 's/^digest = //p' estate/platform.lock 2>/dev/null)"
refused_as() { # <name> <expected text> <out> <rc>
  if [ "$4" = 0 ]; then bad "$1 was ADMITTED" "$3"
  elif grep -qF -- "$2" <<<"$3"; then ok "$1 refused: $(grep -m1 -o 'REFUSED: .*' <<<"$3" | cut -c10-130)"
  else bad "$1 refused for another reason (want: $2)" "$3"; fi
}

# ── C1–C6: the settings, planted on a copy.
echo "── the upgrade settings (estate/seb-upgrade.conf)"
plant() { local f="$tmp/conf-$1"; shift; sed "$@" estate/seb-upgrade.conf > "$f"; printf '%s' "$f"; }
c_run() { local rc=0 out; out="$(SEB_UPGRADE_CONF="$2" estate/seb-upgrade.sh --deploy-set 2>&1)" || rc=$?; refused_as "$1" "$3" "$out" "$rc"; }
c_run "C1 no settings file" "$tmp/no-such.conf" "this estate's upgrade settings (release-repo, apps-dir, predecessors) are not declared"
c_run "C2 no release-repo" "$(plant c2 '/^release-repo[[:space:]]*=/d')" "names no release-repo"
c_run "C3 an apps-dir with no {env}" "$(plant c3 's#^apps-dir[[:space:]]*=.*#apps-dir = gitops/one-for-all#')" "names no {env}"
c_run "C4 a path leaving the repository" "$(plant c4 's#^predecessors[[:space:]]*=.*#predecessors = ../{env}/elsewhere#')" "is not a path inside this repository"
c_run "C5 a key named twice" "$(plant c5 '/^apps-dir[[:space:]]*=/p')" "names apps-dir 2 times"
c6="$(plant c6 -e '/^ledger[[:space:]]*=/d' -e '/^piece-map[[:space:]]*=/d')"; printf 'piece-map = estate/no-map.mjs\n' >> "$c6"
c_run "C6 a piece-map with no ledger" "$c6" "piece-map without ledger"

# ── U12–U24: what a plain upgrade deploys covers every generated Application (no registry needed).
echo "── what a plain upgrade deploys (--deploy-set)"
gen_ids() { local f; for f in "$apps_src"/seb-*.yaml; do [ -e "$f" ] || continue
  grep -q '^# GENERATED by estate/seb-upgrade.sh' <<<"$(sed -n 1p "$f")" && basename "$f" .yaml | sed 's/^seb-//'; done | sort; }
dset() { estate/seb-upgrade.sh --deploy-set 2>&1 | sort; }
mkdir -p "$tmp/no-ledger"
if [ -z "$(gen_ids)" ]; then
  if [ -z "$digest_locked" ]; then ok "U12 no Application generated yet, and the lock names no digest: this estate has taken no bundle"
  else bad "U12 the lock names $digest_locked but $apps_rel holds no generated Application"; fi
  na "U13 nothing generated to drop"
else
  miss="$(comm -23 <(gen_ids) <(dset))"
  if [ -z "$miss" ]; then ok "U12 a plain upgrade writes all $(gen_ids | wc -l) generated Applications again (none dropped)"
  else bad "U12 a plain upgrade would REMOVE generated Applications" "$miss"; fi
  miss="$(comm -23 <(gen_ids) <(SEB_FIRST_PIECES="$tmp/no-list" SEB_LEDGER="$tmp/no-ledger" estate/seb-upgrade.sh --deploy-set 2>&1 | sort))"
  if [ "$miss" = "$(gen_ids)" ]; then ok "U13 refused (planted): with neither list, all $(gen_ids | wc -l) generated Applications are dropped"
  else bad "U13 with neither list, something was still deployed" "$(comm -13 <(printf '%s\n' "$miss") <(gen_ids))"; fi
fi
listed="$( [ ! -r "$first_list" ] || sed 's/#.*//; s/[[:space:]]//g; /^$/d' "$first_list" | sort -u)"
ledger_only="$(SEB_FIRST_PIECES="$tmp/no-list" estate/seb-upgrade.sh --deploy-set 2>&1 | sort)"
if [ -z "$listed" ]; then na "U22 $first_list lists no piece"
elif [ -z "$(comm -23 <(printf '%s\n' "$listed") <(dset))" ] \
   && [ "$(dset)" = "$(sort -u <(printf '%s\n' "$listed") <(printf '%s\n' "$ledger_only" | sed '/^$/d'))" ]; then
  ok "U22 the $(wc -l <<<"$listed") piece(s) $first_list lists are deployed; without it only the ledger's $(sed '/^$/d' <<<"$ledger_only" | wc -l) remain (planted)"
else bad "U22 the deploy set is not the ledger's pieces plus $first_list's" "$(diff <(dset) <(sort -u <(printf '%s\n' "$listed") <(printf '%s\n' "$ledger_only" | sed '/^$/d')))"; fi
one="$(dset | head -n1)"
if [ -z "$one" ]; then na "U23 U24 this estate deploys no piece yet"
else
  printf '%s\n%s\n' "$one" "$one" > "$tmp/list-dup"
  if [ "$(SEB_FIRST_PIECES="$tmp/list-dup" estate/seb-upgrade.sh --deploy-set | grep -cx "$one")" = 1 ]; then ok "U23 $one, named twice, is deployed once"
  else bad "U23 a piece named twice is not deployed exactly once" "$(SEB_FIRST_PIECES="$tmp/list-dup" estate/seb-upgrade.sh --deploy-set 2>&1)"; fi
  printf '%s@prod\n' "$one" > "$tmp/list-prof"
  rc=0; out="$(SEB_FIRST_PIECES="$tmp/list-prof" estate/seb-upgrade.sh --deploy-set 2>&1)" || rc=$?
  refused_as "U24 (planted) an entry $one@prod" "\"$one@prod\" is not a piece id" "$out" "$rc"
fi

# ── the doubles: release v9.9.9 (a copy of the installed bundle's tree) and the registry serving 9.9.9.
echo "── a plain upgrade to 9.9.9 from the release and registry doubles (writes only into $tmp)"
doubles_up "$tmp" "$seb" "$root"
digests() { find "$1" -type f -print0 | sort -z | xargs -0 sha256sum | sha256sum; }
comp="$tmp/components"; mkdir -p "$comp"; [ ! -d estate/seb-components ] || cp -r estate/seb-components/. "$comp/"
mkdir -p "$tmp/out"; cp -r "$apps_src" "$tmp/out/apps" 2>/dev/null || mkdir -p "$tmp/out/apps"  # the predecessors, as in the estate's dir
[ -e "$tmp/out/apps/repo-seb-bundle.yaml" ] || cp /dev/null "$tmp/out/apps/repo-seb-bundle.yaml"
rc=0; out="$(SEB_ESTATE_COMPONENTS="$comp" fup 9.9.9 --from-release v9.9.9 --apps-dir "$tmp/out/apps")" || rc=$?
ids="$(SEB_ESTATE_COMPONENTS="$comp" estate/seb-upgrade.sh --deploy-set 2>/dev/null)"
u11=""
for id in $ids; do
  f="$tmp/out/apps/seb-${id#_}.yaml"; [ -s "$f" ] || { u11+="no seb-${id#_}.yaml; "; continue; }
  [ "$(jq -r --arg id "$id" '.pieces[] | select(.id == $id) | .kind' "$fake/bundle/bundle.json")" != helm ] || continue
  grep -qx "    targetRevision: $fd" "$f" && grep -qx "      value: $(sed -n 's/^REGISTRY_HOST:[[:space:]]*//p' estate/identity.yaml)/seb/bundle@$fd" "$f" \
    && grep -qx "    $label: seb-bundle" "$f" || u11+="seb-${id#_}.yaml; "
done
if [ "$rc" = 0 ] && [ -n "$ids" ] && [ -z "$u11" ] && grep -qx "digest = $fd" "$tmp/out/platform.lock" \
   && grep -qx "version = 9.9.9" "$tmp/out/platform.lock"; then
  ok "U11 the plain upgrade pins 9.9.9 @ ${fd:0:19}… and writes $(wc -w <<<"$ids") Application(s) by it, labelled $label"
elif [ -z "$ids" ]; then na "U11 this estate deploys no piece yet (rc $rc)"
else bad "U11 the plain upgrade did not pin and write every Application by the new digest ($u11)" "$out"; fi

# ── U15–U17: a piece whose image the estate builds (bundle.json estateImages), rendered as the bundle ships it.
efid=""
for id in $ids; do
  [ -n "$(jq -r --arg id "$id" '.pieces[] | select(.id == $id) | (.estateImages // [])[]' "$fake/bundle/bundle.json")" ] || continue
  grep -qE '^ *newTag:' "$comp/$id/kustomization.yaml" 2>/dev/null && { efid="$id"; break; }
done
if [ -z "$efid" ]; then na "U15–U17 no piece this estate deploys runs an image it builds (bundle.json estateImages + a newTag in estate/seb-components/<piece>)"
else
  efp="$fake/bundle/pieces/$efid"
  efimg="$(jq -r --arg id "$efid" '.pieces[] | select(.id == $id) | .estateImages[0]' "$fake/bundle/bundle.json")"
  # argo_render <application> — what Argo CD renders for it from $efp: its kustomize.images set on a
  # copy of the piece, as `kustomize edit set image` writes them (images: name + newTag).
  argo_render() { local d="$tmp/argo-render" e; rm -rf "$d"; cp -r "$efp" "$d"; printf 'images:\n' >>"$d/kustomization.yaml"
    while IFS= read -r e; do printf '  - name: %s\n    newTag: %s\n' "${e%:*}" "${e##*:}" >>"$d/kustomization.yaml"; done \
      < <(sed -n 's/^        - \(.*\)$/\1/p' "$1"); kubectl kustomize "$d"; }
  eftag="$(sed -n 's/^ *newTag: "\{0,1\}\([^"]*\)"\{0,1\}$/\1/p' "$comp/$efid/kustomization.yaml" | head -n1)"
  if [ "$rc" = 0 ] && grep -qx "        - $efimg:$eftag" "$tmp/out/apps/seb-$efid.yaml" \
     && argo_render "$tmp/out/apps/seb-$efid.yaml" | cmp -s - "$efp/rendered.yaml"; then
    ok "U15 $efid's Application sets the tag the estate's component pins ($eftag); Argo's render = the bundle's byte for byte"
  else bad "U15 $efid's Application does not set the component's tag, or its render differs" "$out"$'\n'"$(cat "$tmp/out/apps/seb-$efid.yaml" 2>/dev/null)"; fi
  sed -i 's|newTag:.*|newTag: "def5678"|' "$comp/$efid/kustomization.yaml"
  if out="$(SEB_ESTATE_COMPONENTS="$comp" node estate/seb-image-tags.mjs --write --apps-dir "$tmp/out/apps" --piece "$efid" 2>&1)" \
     && grep -qx "        - $efimg:def5678" "$tmp/out/apps/seb-$efid.yaml" \
     && [ "$(argo_render "$tmp/out/apps/seb-$efid.yaml" | diff "$efp/rendered.yaml" - | grep -c '^[<>]')" = 2 ] \
     && grep -q "image: $efimg:def5678$" <<<"$(argo_render "$tmp/out/apps/seb-$efid.yaml")"; then
    ok "U16 a simulated CI bump (def5678) moves the Application's tag; the live-bound render changes in that one image line only"
  else bad "U16 the simulated bump did not reach the render Argo deploys" "$out"; fi
  sed -i '/^    kustomize:$/,/^  destination:$/{/^  destination:$/!d}' "$tmp/out/apps/seb-$efid.yaml"
  before_ef="$(sha256sum "$tmp/out/apps/seb-$efid.yaml")"
  if out="$(SEB_ESTATE_COMPONENTS="$comp" node estate/seb-image-tags.mjs --write --apps-dir "$tmp/out/apps" --piece "$efid" 2>&1)"; then bad "U17 a bundle that takes no tag passed the deploy step" "$out"
  elif grep -q "would be pushed and NOT deployed" <<<"$out" && [ "$(sha256sum "$tmp/out/apps/seb-$efid.yaml")" = "$before_ef" ]; then
    ok "U17 refused, nothing written: an Application on a bundle that takes no tag fails the deploy step loudly"
  else bad "U17 refused for another reason, or the Application was written" "$out"; fi
fi

# ── U15b: the same bundle, served on a digest nobody signed: refused before anything is written.
echo "$ud" >"$fake/digest"
mkdir -p "$tmp/out3"; cp -r "$tmp/out/apps" "$tmp/out3/apps"; before_u="$(digests "$tmp/out3")"
rc=0; out="$(SEB_LOCK="$tmp/out3/platform.lock" SEB_ESTATE_COMPONENTS="$comp" fup 9.9.9 --from-release v9.9.9 --apps-dir "$tmp/out3/apps")" || rc=$?
if [ "$rc" = 0 ]; then bad "U15b an UNSIGNED bundle was taken into the lock" "$out"
elif grep -q "is not a signed SEB release v9.9.9" <<<"$out" && [ ! -e "$tmp/out3/platform.lock" ] && [ "$(digests "$tmp/out3")" = "$before_u" ]; then
  ok "U15b refused, nothing written: $(grep -m1 -o 'REFUSED: .*' <<<"$out" | cut -c10-120)"
else bad "U15b refused for another reason, or something was written" "$out"; fi
echo "$fd" >"$fake/digest"

# ── U18–U19: a piece without exactly one namespace keeps its predecessor's destination.
mid=""
for id in $ids; do
  [ "$(jq -r --arg id "$id" '.pieces[] | select(.id == $id) | if .kind != "helm" and (.namespaces | length) != 1 then "y" else "n" end' "$fake/bundle/bundle.json")" = y ] || continue
  [ -e "$apps_src/seb-${id#_}.yaml" ] && { mid="$id"; break; }
done
if [ -z "$mid" ]; then na "U18 U19 no deployed piece names several namespaces or none with a generated predecessor"
else
  pred_dest="$(sed -n '/^  destination:$/,/^  [a-z]/s/^    namespace: //p' "$apps_src/seb-$mid.yaml")"
  if [ -n "$pred_dest" ] && grep -qx "    targetRevision: $fd" "$tmp/out/apps/seb-$mid.yaml" \
     && [ "$(sed -n '/^  destination:$/,/^  [a-z]/s/^    namespace: //p' "$tmp/out/apps/seb-$mid.yaml")" = "$pred_dest" ]; then
    ok "U18 $mid ($(jq -r --arg id "$mid" '.pieces[] | select(.id == $id) | .namespaces | length' "$fake/bundle/bundle.json") namespaces in its render) keeps its predecessor's destination ($pred_dest)"
  else bad "U18 $mid's Application lost its predecessor's destination" "$(cat "$tmp/out/apps/seb-$mid.yaml" 2>/dev/null)"; fi
  mkdir -p "$tmp/out2"; cp -r "$apps_src" "$tmp/out2/apps"; rm "$tmp/out2/apps/seb-$mid.yaml"
  # the git-sourced predecessor too, on a copy of the settings pointing at an empty directory
  sed "s#^predecessors[[:space:]]*=.*#predecessors = .no-predecessors/{env}#" estate/seb-upgrade.conf > "$tmp/conf-u19"
  before_k="$(digests "$tmp/out2")"
  rc=0; out="$(SEB_UPGRADE_CONF="$tmp/conf-u19" SEB_LOCK="$tmp/out2/platform.lock" SEB_ESTATE_COMPONENTS="$comp" fup 9.9.9 --from-release v9.9.9 --apps-dir "$tmp/out2/apps")" || rc=$?
  if [ "$rc" = 0 ]; then bad "U19 a piece with no predecessor to take its namespace from was written" "$out"
  elif grep -q "piece $mid .* and has no predecessor" <<<"$out" && [ ! -e "$tmp/out2/apps/seb-$mid.yaml" ] && [ "$(digests "$tmp/out2")" = "$before_k" ]; then
    ok "U19 refused, nothing written (planted: no predecessor): $(grep -o "piece $mid.*" <<<"$out" | cut -c1-100)"
  else bad "U19 refused for another reason, or something was written" "$out"; fi
fi

# ── U25–U26: the dry run's comparison, on unpacked bundles.
cp -r "$fake/bundle" "$tmp/cmp-old"; cp -r "$fake/bundle" "$tmp/cmp-new"
pa="$(jq -r '[.pieces[] | select(.kind != "helm") | .id][0]' "$fake/bundle/bundle.json")"
pb="$(jq -r '[.pieces[] | select(.kind != "helm") | .id][1]' "$fake/bundle/bundle.json")"
jq --arg id "$pa" 'del(.pieces[] | select(.id == $id))' "$fake/bundle/bundle.json" > "$tmp/cmp-old/bundle.json"
if out="$(estate/seb-upgrade.sh --compare-bundles "$tmp/cmp-old" "$tmp/cmp-new" "$relc" 2>&1)" \
   && grep -q "^IDENTICAL pieces/$pb " <<<"$out" && grep -qx "ADDED pieces/$pa (not in the locked bundle; not compared)" <<<"$out"; then
  ok "U25 a bundle against itself: $(grep -c '^IDENTICAL' <<<"$out") piece(s) IDENTICAL, $pa ADDED"
else bad "U25 the comparison of a bundle with itself was not identical" "$out"; fi
cp "$fake/bundle/bundle.json" "$tmp/cmp-old/bundle.json"
f="$(find "$tmp/cmp-new/pieces/$pb" -type f | head -n1)"; printf '# planted\n' >> "$f"
jq --arg id "$pa" 'del(.pieces[] | select(.id == $id))' "$fake/bundle/bundle.json" > "$tmp/cmp-new/bundle.json"
rc=0; out="$(estate/seb-upgrade.sh --compare-bundles "$tmp/cmp-old" "$tmp/cmp-new" "$relc" 2>&1)" || rc=$?
if [ "$rc" != 0 ] && grep -q "^DIFFERS pieces/$pb:" <<<"$out" && grep -q "^DIFFERS pieces/$pa: the locked bundle has it, the release drops it" <<<"$out"; then
  ok "U26 refused (planted): $pb rendered differently and $pa dropped are each a DIFFERENCE"
else bad "U26 a changed or dropped piece passed the comparison (rc $rc)" "$out"; fi

# ── E1–E4: another environment's Applications, in a scratch copy of the estate.
echo "── another environment's Applications (--env), in a copy of the estate"
cp_estate="$tmp/estate-copy"; mkdir -p "$cp_estate"
git ls-files -z -- estate | tar --null -T - -c 2>/dev/null | tar -x -C "$cp_estate"
ln -s "$root/node_modules" "$cp_estate/node_modules"; ln -s "$seb" "$cp_estate/.seb-bundle"
env -u GIT_DIR -u GIT_WORK_TREE -u GIT_INDEX_FILE git -C "$cp_estate" init -q
qa_rel="$(confv apps-dir)"; qa_rel="${qa_rel//\{env\}/qa}"
eid=""
for id in $ids; do
  [ "$(jq -r --arg id "$id" '.pieces[] | select(.id == $id) | if .kind != "helm" and (.namespaces | length) == 1 then "y" else "n" end' "$fake/bundle/bundle.json")" = y ] \
    && [ -s "$tmp/out/apps/seb-${id#_}.yaml" ] && { eid="${id#_}"; break; }
done
if [ -z "$eid" ] || [ ! -s "$tmp/out/platform.lock" ]; then
  na "E1–E3 no deployed piece is a one-namespace kustomize piece, or the upgrade wrote no lock"
else
  printf '%s\n' "$eid" > "$cp_estate/estate/seb-pieces.qa"
  rc=0; out="$(FUP_ESTATE="$cp_estate" SEB_LOCK="$tmp/out/platform.lock" fup --env qa)" || rc=$?
  if [ "$rc" != 0 ] && grep -q "holds no repo-seb-bundle.yaml" <<<"$out" && [ ! -e "$cp_estate/$qa_rel/seb-$eid.yaml" ]; then
    ok "E1 refused, nothing written: $(grep -o "$qa_rel holds no repo-seb-bundle.yaml" <<<"$out")"
  else bad "E1 an environment with no read credential was written (rc $rc)" "$out"; fi
  mkdir -p "$cp_estate/$qa_rel"; : > "$cp_estate/$qa_rel/repo-seb-bundle.yaml"
  mkdir -p "$(dirname "$cp_estate/$apps_rel")"; rm -rf "$cp_estate/$apps_rel"; cp -r "$tmp/out/apps" "$cp_estate/$apps_rel"
  rc=0; out="$(FUP_ESTATE="$cp_estate" SEB_LOCK="$tmp/out/platform.lock" fup --env qa)" || rc=$?
  want_name="$(sed -n 's/^  name: //p' "$tmp/out/apps/seb-$eid.yaml" | head -n1)"
  if [ "$rc" = 0 ] && grep -qx "    targetRevision: $fd" "$cp_estate/$qa_rel/seb-$eid.yaml" \
     && grep -qx "  name: $want_name" "$cp_estate/$qa_rel/seb-$eid.yaml" && grep -qx "  - seb-$eid.yaml" "$cp_estate/$qa_rel/kustomization.yaml"; then
    ok "E2 --env qa writes seb-$eid.yaml by the locked digest, named as on $first ($want_name)"
  else bad "E2 --env qa did not write the environment's Application" "$out"; fi
  printf '%s@noprofile\n' "$eid" > "$cp_estate/estate/seb-pieces.qa"; before_e="$(digests "$cp_estate/$qa_rel")"
  rc=0; out="$(FUP_ESTATE="$cp_estate" SEB_LOCK="$tmp/out/platform.lock" fup --env qa)" || rc=$?
  if [ "$rc" != 0 ] && grep -q "carries no noprofile profile of $eid" <<<"$out" && [ "$(digests "$cp_estate/$qa_rel")" = "$before_e" ]; then
    ok "E3 refused, nothing written: $eid@noprofile names a profile the bundle does not carry"
  else bad "E3 an entry naming a missing profile was admitted, or something was written (rc $rc)" "$out"; fi
fi
rc=0; out="$(FUP_ESTATE="$cp_estate" SEB_LOCK="$tmp/out/platform.lock" fup --env "$first")" || rc=$?
refused_as "E4 --env $first (the first environment)" "is the first environment" "$out" "$rc"

# ── U20–U21: a helm piece's Application fills identity keys only; anything else is literal text.
echo "── a helm piece's Application (estate/seb-helm-app.mjs)"
hp="$tmp/helm-piece"; mkdir -p "$hp"
cat > "$hp/application.yaml" <<'YAML'
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: planted
spec:
  project: default
  source:
    repoURL: https://charts.example.org
    chart: planted
    targetRevision: 1.2.3
    helm:
      parameters:
        - name: image.repository
          value: ${REGISTRY_HOST}/${REGISTRY_PROJECT_MIRROR}/x
  destination:
    server: https://kubernetes.default.svc
    namespace: planted
YAML
cat > "$hp/values.yaml" <<'YAML'
host: cloud.${BASE_DOMAIN}
script: |
  [ -n "${POSTGRES_PASSWORD:-}" ] || exit 1; cd "${HOME}"; echo ${NOT_IN_SCHEMA}
YAML
reg="$(idv REGISTRY_HOST)"; mir="$(idv REGISTRY_PROJECT_MIRROR)"; dom="$(idv BASE_DOMAIN)"
want_values="host: cloud.$dom
script: |
  [ -n \"\${POSTGRES_PASSWORD:-}\" ] || exit 1; cd \"\${HOME}\"; echo \${NOT_IN_SCHEMA}
"
if out="$(node estate/seb-helm-app.mjs "$hp" planted k=v "# header" 2>&1)" \
   && [ "$(node -e 'const y=require("yaml");const a=y.parse(require("fs").readFileSync(0,"utf8"));process.stdout.write(a.spec.source.helm.values)' <<<"$out")" = "$(printf '%s' "$want_values")" ] \
   && grep -qx "          value: $reg/$mir/x" <<<"$out"; then
  ok "U20 identity keys filled ($reg/$mir, cloud.$dom); \${POSTGRES_PASSWORD:-}, \${HOME}, \${NOT_IN_SCHEMA} kept literal"
else bad "U20 the helm Application was not the template filled with identity keys only" "$out"; fi
sb="$tmp/seb-unset"; cp -r "$seb" "$sb"; chmod -R u+w "$sb"
node -e 'const f=process.argv[1];const s=JSON.parse(require("fs").readFileSync(f,"utf8"));s.properties.PLANTED_UNSET_KEY={type:"string"};require("fs").writeFileSync(f,JSON.stringify(s))' "$sb/schema/identity.schema.json"
printf 'x: ${PLANTED_UNSET_KEY}\n' >> "$hp/values.yaml"
if out="$(SEB_ROOT="$sb" node estate/seb-helm-app.mjs "$hp" planted k=v "# header" 2>"$tmp/helm-u21.err")"; then
  bad "U21 an identity key this estate does not set was written" "$out"
elif [ -z "$out" ] && grep -q 'REFUSED: values.yaml: ${PLANTED_UNSET_KEY} names an identity key this estate does not set' "$tmp/helm-u21.err"; then
  ok "U21 refused, nothing on stdout (planted): $(cut -c1-100 "$tmp/helm-u21.err")"
else bad "U21 refused for another reason, or something was written" "$out$(cat "$tmp/helm-u21.err")"; fi

[ "$(git status --porcelain)" = "$before" ] && ok "the working tree is exactly as before" \
  || bad "the cases changed the working tree" "$(git status --porcelain)"

echo "── $pass ok, $fail failed"
gate_finish "$fail"
