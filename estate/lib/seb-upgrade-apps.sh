# shellcheck shell=bash
# Sourced by estate/seb-upgrade.sh, never run: it uses that script's globals (ROOT, LOCK, LEDGER,
# APPS, FIRST_ENV, HOST, REPO, LABEL, WORK, ...) and its refuse/say.
# What an Application is made of: the estate's components, the pieces the lists deploy, carried files, one Application.

# estate_components <clone> <args-array-name> — this estate's own component per SEB piece
# ($COMPONENTS/<id>/, a kustomize Component: what is the estate's and not a setting, e.g. Plunk's
# senders, Polaris' permissions bundle and hub registry), passed to the release's bundle builder as
# --estate-components. Only the components of pieces THIS release has are passed (each named:
# a release older than a piece cannot take its component, and the builder refuses one naming no
# piece); they are linked, not copied, so a component keeps its paths into the rest of this
# repository. A release whose builder cannot take components, while one of its pieces has one
# here, is refused: its render would silently drop what the component adds.
estate_components() {
  local clone="$1" id c; local -n out="$2"
  [ -d "$COMPONENTS" ] || return 0
  local dir="$WORK/estate-components"; mkdir -p "$dir"
  for c in "$COMPONENTS"/*/; do
    id="$(basename "$c")"
    if [ -d "$clone/pieces/$id" ]; then ln -s "${c%/}" "$dir/$id"; say "estate component $id: passed"
    else say "estate component $id: the release has no piece $id — not passed"; fi
  done
  [ -n "$(ls -A "$dir")" ] || return 0
  grep -q -- '--estate-components' "$clone/tools/bundle/build.mjs" \
    || refuse "the release's bundle builder takes no --estate-components, but this estate has components for its pieces: $(ls "$dir" | tr '\n' ' ')"
  out+=(--estate-components "$dir")
}

# moved_pieces — for an estate with a ledger (seb-upgrade.conf `ledger`): the ids it records with a
# `moved` step, or with an `argo-switched` step (a piece that runs from the bundle while what the
# estate builds it from stays in its repository). Every Application a past upgrade wrote is
# therefore written again by a plain upgrade, with no --piece. No ledger: nothing.
moved_pieces() {
  [ -n "$LEDGER" ] || return 0
  [ -d "$LEDGER" ] || refuse "the ledger ${LEDGER#"$ROOT/"} (seb-upgrade.conf) is not a directory — nothing written"
  (cd "$ROOT" && node --input-type=module -e '
    import { readdirSync, readFileSync } from "node:fs";
    import { parse } from "yaml";
    const dir = process.argv[1];
    for (const f of readdirSync(dir).filter((n) => n.endsWith(".yaml")).sort()) {
      const p = parse(readFileSync(`${dir}/${f}`, "utf8"));
      if (p?.steps && typeof p.steps === "object" && ("moved" in p.steps || "argo-switched" in p.steps)) console.log(p.id);
    }' "$LEDGER")
}

# adopted_pieces — the bundle piece ids estate/seb-pieces.<first env> ($FIRST_PIECES) lists: the SEB
# pieces the first environment runs from the bundle (beside any a ledger records). One id per line,
# `#` comments. The first environment deploys a piece's default render: <id>@<profile> is refused, as
# is anything not a piece id. No file: it adopts nothing.
adopted_pieces() {
  [ -e "$FIRST_PIECES" ] || return 0
  local line id
  while IFS= read -r line || [ -n "$line" ]; do
    id="${line%%#*}"; id="${id//[[:space:]]/}"
    [ -n "$id" ] || continue
    [[ "$id" =~ ^[a-z0-9]+(-[a-z0-9]+)*$ ]] \
      || refuse "${FIRST_PIECES#"$ROOT/"}: \"$id\" is not a piece id ($FIRST_ENV runs a piece's default render, no @<profile>) — nothing written"
    printf '%s\n' "$id"
  done < "$FIRST_PIECES"
}

# carried <id> <apps-dir> <out-dir> [<legacy-dir>] — what this piece's Application keeps from the one it
# replaces: the generated seb-<id>.yaml in <apps-dir>, else the git-sourced predecessor <legacy-dir>/<id>.yaml
# (default: the first environment's predecessors, seb-upgrade.conf).
# Writes <out-dir>/<id>.name, .opts (one sync option per line), .wave (its argocd.argoproj.io/sync-wave,
# empty when it has none), .ignore (its ignoreDifferences, as YAML indented under spec) and .dest (its
# destination namespace, empty when it has none); writes
# nothing for a new piece. Refuses a predecessor it cannot read.
carried() {
  (cd "$ROOT" && node --input-type=module -e '
    import { existsSync, readFileSync, writeFileSync } from "node:fs";
    import { parse, stringify } from "yaml";
    const [id, apps, legacyDir, out] = process.argv.slice(1);
    const plain = id.replace(/^_/, "");
    for (const f of [`${apps}/seb-${plain}.yaml`, `${legacyDir}/${id}.yaml`]) {
      if (!existsSync(f)) continue;
      const a = parse(readFileSync(f, "utf8"));
      const name = a?.metadata?.name;
      const opts = a?.spec?.syncPolicy?.syncOptions ?? [];
      const ign = a?.spec?.ignoreDifferences;
      const wave = a?.metadata?.annotations?.["argocd.argoproj.io/sync-wave"] ?? "";
      const dest = a?.spec?.destination?.namespace ?? "";
      const okName = typeof name === "string" && /^[a-z0-9-]+$/.test(name);
      const okOpts = Array.isArray(opts) && opts.every((o) => typeof o === "string" && /^[A-Za-z]+=[A-Za-z0-9-]+$/.test(o));
      const okWave = typeof wave === "string" && /^(-?[0-9]+)?$/.test(wave);
      const okDest = typeof dest === "string" && /^[a-z0-9-]*$/.test(dest);
      if (a?.kind !== "Application" || !okName || !okOpts || !okWave || !okDest || (ign !== undefined && !Array.isArray(ign))) {
        console.error(`${f} is not an Application with a name, plain syncOptions, an integer sync-wave, a plain destination namespace and a list of ignoreDifferences`); process.exit(1);
      }
      writeFileSync(`${out}/${id}.name`, `${name}\n`);
      writeFileSync(`${out}/${id}.opts`, opts.map((o) => `${o}\n`).join(""));
      writeFileSync(`${out}/${id}.wave`, wave);
      writeFileSync(`${out}/${id}.dest`, dest);
      const block = ign ? stringify({ ignoreDifferences: ign }, { lineWidth: 0 }).replace(/^(?=.)/gm, "  ") : "";
      writeFileSync(`${out}/${id}.ignore`, block);
      process.exit(0);
    }' "$1" "$2" "${4:-$(pred_dir_of "$FIRST_ENV")}" "$3")
}

# app_name <id> — a real piece keeps the Application name it had as a git-sourced app (the piece
# id), so Argo adopts the live objects it already tracks (tracking-id carries the app name; for a
# helm piece it is also the release name): switching the source changes nothing in the cluster.
# A probe piece (_<id>) has no predecessor: seb-<id>.
app_name() { if [ "${1#_}" = "$1" ]; then printf '%s' "$1"; else printf 'seb-%s' "${1#_}"; fi; }

application() { # <id> <namespace> <digest> <version> <carried-dir> [<path in the bundle, default pieces/<id>>]
  # A real piece keeps the Application name it had as a git-sourced app (the piece id, or what
  # its predecessor was called), so Argo adopts the live objects it already tracks (tracking-id
  # carries the app name), and keeps its sync options and ignoreDifferences (e.g. ServerSideApply
  # on a field-shared kube-system object, ESO-defaulted fields): switching the source changes
  # nothing in the cluster. A probe piece (_<id>) has no predecessor: seb-<id>.
  local name c="$5/$1" o
  name="$(app_name "$1")"
  [ ! -r "$c.name" ] || name="$(cat "$c.name")"
  cat <<EOF
$MARK from the locked bundle $4. Do not edit; re-run the upgrade.
# SEB piece $1, deployed BY DIGEST from this estate's Harbor.
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: $name
  namespace: argocd
  labels:
    $LABEL: seb-bundle
EOF
  [ ! -s "$c.wave" ] || printf '  annotations:\n    argocd.argoproj.io/sync-wave: "%s"\n' "$(cat "$c.wave")"
  cat <<EOF
spec:
  project: default
  # The bundle by digest, where Kyverno's verify-seb-signatures reads it to check SEB's signature.
  info:
    - name: seb-bundle
      value: $REPO@$3
EOF
  [ ! -r "$c.ignore" ] || cat "$c.ignore"
  cat <<EOF
  source:
    repoURL: $SOURCE
    targetRevision: $3
    path: ${6:-pieces/$1}
EOF
  [ ! -s "$c.kimages" ] || cat "$c.kimages"
  cat <<EOF
  destination:
    server: https://kubernetes.default.svc
    namespace: $2
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
EOF
  if [ -r "$c.opts" ]; then
    [ ! -s "$c.opts" ] || { printf '    syncOptions:\n'; while IFS= read -r o; do printf '      - %s\n' "$o"; done < "$c.opts"; }
  else
    printf '    syncOptions:\n      - CreateNamespace=true\n'
  fi
}
