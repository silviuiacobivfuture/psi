# shellcheck shell=bash
# Sourced by estate/seb-upgrade.sh, never run: it uses that script's globals (ROOT, LOCK, LEDGER,
# APPS, FIRST_ENV, HOST, REPO, LABEL, WORK, ...) and its refuse/say.
# The writes: an upgrade, one environment's Applications, the deploy set.

upgrade() {
  local version="$1" expect="$2" apps="$3"; shift 3
  [[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$ ]] || refuse "version \"$version\" is not major.minor.patch[-pre]"
  [ -z "$expect" ] || [[ "$expect" =~ ^sha256:[0-9a-f]{64}$ ]] || refuse "--digest \"$expect\" is not sha256:<64 hex>"
  local digest bundle
  digest="$(digest_of "$version")" \
    || refuse "Harbor holds no $REPO:$version: $(tail -n1 "$WORK/pull.err")"
  [[ "$digest" =~ ^sha256:[0-9a-f]{64}$ ]] || refuse "podman reported no digest for $REPO:$version"
  [ -z "$expect" ] || [ "$expect" = "$digest" ] \
    || refuse "$REPO:$version is $digest in Harbor, not the expected $expect — nothing written"
  say "resolved $REPO:$version @ $digest"
  bundle="$(bundle_json "$digest")"
  [ "$(jq -r .version <<< "$bundle")" = "$version" ] \
    || refuse "$REPO@$digest says it is version $(jq -r .version <<< "$bundle"), not $version — nothing written"
  say "bundle.json: version $version, source commit $(jq -r .source.commit <<< "$bundle"), pieces [$(jq -r '[.pieces[].id] | join(", ")' <<< "$bundle")]"
  # Only a SIGNED SEB release is ever written into the lock (estate/lib/seb-upgrade-sign.sh).
  signed_release "$version" "$digest" "$(jq -r .source.commit <<< "$bundle")"

  local ids=() id ns moved=()
  moved_pieces > "$WORK/moved"  # its own step, so a ledger that does not read stops the upgrade before anything is written
  while IFS= read -r id; do [ -z "$id" ] || moved+=("$id"); done < "$WORK/moved"
  # A ledger piece may be another bundle piece, or several: the estate's piece-map
  # (seb-upgrade.conf). A map it refuses refuses the upgrade before anything is written.
  if [ "${#moved[@]}" -gt 0 ]; then
    map_pieces "${moved[@]}" > "$WORK/bundle-ids" 2>"$WORK/map.err" \
      || refuse "$(sed 's/^REFUSED: //' "$WORK/map.err") — nothing written"
    while IFS= read -r id; do [ -z "$id" ] || ids+=("$id"); done < "$WORK/bundle-ids"
  fi
  adopted_pieces > "$WORK/adopted"  # its own step, so a refusal stops the upgrade before anything is written
  while IFS= read -r id; do [[ " ${ids[*]} " == *" $id "* ]] || ids+=("$id"); done < "$WORK/adopted"
  for id in "$@"; do [[ " ${ids[*]} " == *" $id "* ]] || ids+=("$id"); done  # a --piece already moved is listed once
  declare -A nsof=() kindof=()
  for id in "${ids[@]}"; do
    kindof[$id]="$(jq -r --arg id "$id" '.pieces[] | select(.id == $id) | .kind' <<< "$bundle")"
    # "-": the piece renders cluster-scoped objects only; "*": it names several namespaces, each object its
    # own. Either way its destination comes from its predecessor (below): Argo's spec stays as it was.
    ns="$(jq -r --arg id "$id" '.pieces[] | select(.id == $id) | if (.namespaces | length) == 1 then .namespaces[0] elif (.namespaces | length) == 0 then "-" else "*" end' <<< "$bundle")"
    [ -n "$ns" ] || refuse "piece $id is to be deployed but bundle $version does not hold it — nothing written"
    [ "$ns" != "*" ] || [ "${kindof[$id]}" != helm ] \
      || refuse "helm piece $id in bundle $version does not name exactly one namespace — nothing written"
    nsof[$id]="$ns"
  done
  # Helm pieces are rendered BEFORE anything is written: a template this estate cannot fill
  # refuses the whole upgrade.
  for id in "${ids[@]}"; do
    [ "${kindof[$id]}" = helm ] || continue
    node "$ROOT/estate/seb-helm-app.mjs" "$WORK/bundle-${digest#sha256:}/pieces/$id" "$(app_name "$id")" \
      "$LABEL=seb-bundle" \
      "${MARK#\# } from the locked bundle $version. Do not edit; re-run the upgrade." \
      > "$WORK/helm-$id.yaml" 2>"$WORK/helm.err" \
      || refuse "helm piece $id in bundle $version: $(sed 's/^REFUSED: //' "$WORK/helm.err") — nothing written"
  done

  mkdir -p "$WORK/carry"
  for id in "${ids[@]}"; do
    [ "${kindof[$id]}" != helm ] || continue  # a helm piece's Application is the bundle's template
    carried "$id" "$apps" "$WORK/carry" || refuse "cannot read the Application piece $id replaces — nothing written"
  done
  # A piece whose image the estate builds (bundle.json estateImages): its Application sets that image's
  # tag from the estate's component, so CI's builds deploy between bundles (estate/seb-image-tags.mjs).
  local names
  for id in "${ids[@]}"; do
    names="$(jq -r --arg id "$id" '.pieces[] | select(.id == $id) | (.estateImages // [])[]' <<< "$bundle")"
    [ -n "$names" ] || continue
    # shellcheck disable=SC2086 # one rendered image name per word
    node "$ROOT/estate/seb-image-tags.mjs" --emit "$id" $names > "$WORK/carry/$id.kimages" 2>"$WORK/kimg.err" \
      || refuse "$(sed 's/^REFUSED: //' "$WORK/kimg.err") — nothing written"
  done
  for id in "${ids[@]}"; do
    [ "${nsof[$id]}" = - ] || [ "${nsof[$id]}" = "*" ] || continue
    [ "${kindof[$id]}" != helm ] && [ -s "$WORK/carry/$id.dest" ] \
      || refuse "piece $id in bundle $version renders $([ "${nsof[$id]}" = - ] && echo "no namespaced object" || echo "objects in several namespaces") and has no predecessor Application to take its destination namespace from — nothing written"
    nsof[$id]="$(cat "$WORK/carry/$id.dest")"
  done

  [ -r "$apps/repo-seb-bundle.yaml" ] \
    || refuse "${apps#"$ROOT/"} holds no repo-seb-bundle.yaml (Argo CD's read credential for $SOURCE, written by hand): its Applications could not be synced — nothing written"

  # ── write: lock, the housekeeping ConfigMap, the Applications ────────────────
  # The lock keeps its own header comment (the estate's words for it); a new lock gets this one.
  local header
  header="$( [ ! -r "$LOCK" ] || sed -n '/^[^#]/q;p' "$LOCK")"
  [ -n "$header" ] || header="# estate/platform.lock — the SEB platform bundle this estate runs.
# Written by estate/seb-upgrade.sh."
  printf '%s\nversion = %s\ndigest = %s\nsource = %s\n' "$header" "$version" "$digest" "$SOURCE" > "$LOCK"
  say "wrote ${LOCK#"$ROOT/"}"
  mkdir -p "$apps"
  {
    printf '%s from estate/platform.lock. Do not edit; re-run the upgrade.\n' "$MARK"
    printf '# Read by the Harbor housekeeping CronJobs (harbor-housekeeping.yaml): the locked bundle is always kept.\n'
    printf 'apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: platform-lock\n  namespace: harbor\ndata:\n  platform.lock: |\n'
    sed 's/^/    /' "$LOCK"
  } > "$apps/platform-lock.yaml"
  say "wrote ${apps#"$ROOT/"}/platform-lock.yaml"
  if [ -n "$HOUSEKEEPING" ] && grep -q 'name: platform-lock, optional: true' "$HOUSEKEEPING"; then
    sed -i 's/name: platform-lock, optional: true/name: platform-lock, optional: false/' "$HOUSEKEEPING"
    say "flipped the platform-lock mount to optional: false in ${HOUSEKEEPING#"$ROOT/"}"
  fi

  local f
  for f in "$apps"/seb-*.yaml; do
    if [ -e "$f" ] && grep -qF "$MARK" <<<"$(sed -n 1p "$f")"; then rm -f "$f"; fi
  done
  for id in "${ids[@]}"; do
    if [ "${kindof[$id]}" = helm ]; then cp "$WORK/helm-$id.yaml" "$apps/seb-${id#_}.yaml"
    else application "$id" "${nsof[$id]}" "$digest" "$version" "$WORK/carry" > "$apps/seb-${id#_}.yaml"; fi
    if [ "${kindof[$id]}" = helm ]; then
      say "wrote ${apps#"$ROOT/"}/seb-${id#_}.yaml → helm chart $(jq -r --arg id "$id" '.pieces[] | select(.id == $id) | .chart.chart + " " + .chart.version' <<< "$bundle") in namespace ${nsof[$id]}, values from the bundle"
    else say "wrote ${apps#"$ROOT/"}/seb-${id#_}.yaml → pieces/$id in namespace ${nsof[$id]}"; fi
  done
  {
    printf '%s. Do not edit; re-run the upgrade.\n' "$MARK"
    printf '# The SEB pieces this estate deploys from its locked bundle (one Application per moved piece).\n'
    printf 'apiVersion: kustomize.config.k8s.io/v1beta1\nkind: Kustomization\n'
    printf 'resources:\n  # Argo CD'"'"'s read credential for the bundle repository (hand-written, kept).\n  - repo-seb-bundle.yaml\n  # The lock, for Harbor housekeeping (namespace harbor).\n  - platform-lock.yaml\n'
    for id in "${ids[@]}"; do printf '  - seb-%s.yaml\n' "${id#_}"; done
  } > "$apps/kustomization.yaml"
  say "wrote ${apps#"$ROOT/"}/kustomization.yaml (${#ids[@]} Application(s))"
  # Only for the first environment's own directory: an --apps-dir elsewhere (a gate's scratch) is not the estate.
  local e
  [ "$(realpath -m "$apps")" = "$(realpath -m "$APPS")" ] || return 0
  for e in "${ENVS[@]}"; do write_env "$e" "$version" "$digest"; done
}

# write_env <env> <version> <digest> — the SEB pieces another environment runs, from the SAME locked
# bundle, by digest: one Application per id listed in estate/seb-pieces.<env> (that environment's
# choice; it may run fewer pieces than the first), into apps-dir for <env> (seb-upgrade.conf) with its
# kustomization.yaml. Each keeps what its predecessor carried (generated seb-<id>.yaml there, else the
# git-sourced <predecessors for env>/<id>.yaml, else — a piece this environment newly takes from
# the bundle — the same piece's Application on the FIRST environment, <apps-dir for it>/seb-<id>.yaml,
# so it is applied with that one's name, sync options and wave). A piece whose render names no namespace
# (cluster-scoped objects only, e.g. cert-manager's ClusterIssuers) takes its destination from that
# predecessor, and is refused with none. No platform-lock ConfigMap: Harbor and its housekeeping live
# on the first environment. Refuses, writing nothing, when a listed piece is not in the bundle.
write_env() {
  local env="$1" version="$2" digest="$3" list="$ROOT/estate/seb-pieces.$1"
  [ "$env" != "$FIRST_ENV" ] || refuse "$env is the first environment: its Applications are written by an upgrade (step 5), not --env"
  local dir legacy
  dir="$(apps_dir_of "$env")"; legacy="$(pred_dir_of "$env")"
  [ -r "$list" ] || refuse "no estate/seb-pieces.$env: which SEB pieces $env runs is not declared"
  local bundle ids=() id ns f entry prof
  bundle="$(bundle_json "$digest")"
  declare -A nsof=() pathof=()
  while IFS= read -r entry; do
    entry="${entry%%#*}"; entry="${entry//[[:space:]]/}"; [ -n "$entry" ] || continue
    [[ "$entry" =~ ^_?[a-z0-9]+(-[a-z0-9]+)*(@[a-z][a-z0-9]*)?$ ]] \
      || refuse "estate/seb-pieces.$env: \"$entry\" is not <piece id>[@<profile>] — nothing written for $env"
    id="${entry%@*}"; prof=""; [ "$id" = "$entry" ] || prof="${entry#*@}"
    ns="$(jq -r --arg id "$id" '.pieces[] | select(.id == $id) | if .kind == "helm" then "helm" elif (.namespaces | length) == 1 then .namespaces[0] elif (.namespaces | length) == 0 then "-" else "?" end' <<< "$bundle")"
    [ -n "$ns" ] || refuse "estate/seb-pieces.$env lists $id; bundle $version does not hold it — nothing written for $env"
    [ "$ns" != helm ] || refuse "estate/seb-pieces.$env lists the helm piece $id; only kustomize pieces are written per environment — nothing written for $env"
    [ "$ns" != "?" ] || refuse "piece $id in bundle $version does not name exactly one namespace — nothing written for $env"
    pathof[$id]="pieces/$id"
    if [ -n "$prof" ]; then
      pathof[$id]="$(jq -r --arg id "$id" --arg p "$prof" '.pieces[] | select(.id == $id) | .profiles[]? | select(.name == $p) | .path' <<< "$bundle")"
      [ -n "${pathof[$id]}" ] || refuse "estate/seb-pieces.$env lists $id@$prof; bundle $version carries no $prof profile of $id — nothing written for $env"
      [ -s "$WORK/bundle-${digest#sha256:}/${pathof[$id]}/rendered.yaml" ] \
        || refuse "bundle $version records ${pathof[$id]} and does not hold it — nothing written for $env"
      ns="$(jq -r --arg id "$id" --arg p "$prof" '.pieces[] | select(.id == $id) | .profiles[] | select(.name == $p) | if (.namespaces | length) == 1 then .namespaces[0] elif (.namespaces | length) == 0 then "-" else "?" end' <<< "$bundle")"
      [ "$ns" != "?" ] || refuse "profile $prof of $id in bundle $version does not name exactly one namespace — nothing written for $env"
    fi
    nsof[$id]="$ns"; ids+=("$id")
  done < "$list"
  [ -r "$dir/repo-seb-bundle.yaml" ] \
    || refuse "${dir#"$ROOT/"} holds no repo-seb-bundle.yaml (Argo CD's read credential for $SOURCE, written by hand): its Applications could not be synced — nothing written for $env"
  mkdir -p "$WORK/carry-$env" "$dir"
  for id in "${ids[@]}"; do
    carried "$id" "$dir" "$WORK/carry-$env" "$legacy" || refuse "cannot read the $env Application piece $id replaces — nothing written for $env"
    if [ ! -e "$WORK/carry-$env/$id.name" ]; then
      carried "$id" "$APPS" "$WORK/carry-$env" "$WORK/no-legacy" || refuse "cannot read $FIRST_ENV's Application of piece $id — nothing written for $env"
    fi
    if [ "${nsof[$id]}" = - ]; then
      [ -s "$WORK/carry-$env/$id.dest" ] \
        || refuse "piece $id in bundle $version renders no namespaced object and has no predecessor Application to take its destination namespace from — nothing written for $env"
      nsof[$id]="$(cat "$WORK/carry-$env/$id.dest")"
    fi
  done
  for f in "$dir"/seb-*.yaml; do
    if [ -e "$f" ] && grep -qF "$MARK" <<<"$(sed -n 1p "$f")"; then rm -f "$f"; fi
  done
  for id in "${ids[@]}"; do
    application "$id" "${nsof[$id]}" "$digest" "$version" "$WORK/carry-$env" "${pathof[$id]}" > "$dir/seb-$id.yaml"
    say "wrote ${dir#"$ROOT/"}/seb-$id.yaml → ${pathof[$id]} in namespace ${nsof[$id]}"
  done
  {
    printf '%s. Do not edit; re-run the upgrade.\n' "$MARK"
    printf '# The SEB pieces %s deploys from the locked bundle (estate/seb-pieces.%s).\n' "$env" "$env"
    printf 'apiVersion: kustomize.config.k8s.io/v1beta1\nkind: Kustomization\n'
    printf 'resources:\n  # Argo CD'"'"'s read credential for the bundle repository (hand-written, kept).\n  - repo-seb-bundle.yaml\n'
    for id in "${ids[@]}"; do printf '  - seb-%s.yaml\n' "$id"; done
  } > "$dir/kustomization.yaml"
  say "wrote ${dir#"$ROOT/"}/kustomization.yaml (${#ids[@]} Application(s))"
}

# map_pieces <ledger id>… — the bundle piece ids for those ledger pieces: the estate's piece-map
# (seb-upgrade.conf), else each ledger id is its own bundle piece.
map_pieces() {
  if [ -n "$PIECE_MAP" ]; then node "$PIECE_MAP" "$@"; else printf '%s\n' "$@"; fi
}

# deploy_set — the bundle piece ids a plain upgrade deploys (step 5, before any --piece): the ledger's,
# then those estate/seb-pieces.<first env> adopts, one per line, each once.
deploy_set() {
  local moved=() ids=() id
  moved_pieces > "$WORK/moved"
  while IFS= read -r id; do [ -z "$id" ] || moved+=("$id"); done < "$WORK/moved"
  if [ "${#moved[@]}" -gt 0 ]; then
    map_pieces "${moved[@]}" > "$WORK/bundle-ids" || exit 1
    while IFS= read -r id; do [ -z "$id" ] || ids+=("$id"); done < "$WORK/bundle-ids"
  fi
  adopted_pieces > "$WORK/adopted"
  while IFS= read -r id; do [[ " ${ids[*]} " == *" $id "* ]] || ids+=("$id"); done < "$WORK/adopted"
  [ "${#ids[@]}" -eq 0 ] || printf '%s\n' "${ids[@]}"
}
