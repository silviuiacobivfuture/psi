#!/usr/bin/env bash
# The estate's upgrade step: take SEB release <version> into this estate's Harbor and pin it.
# The same code in every estate (SEB's tools/estate/scaffold/estate/); what makes it THIS estate's
# is read, never written here: the identity (estate/identity.yaml: REGISTRY_HOST, ENVIRONMENTS,
# ESTATE_LABEL_DOMAIN) and the upgrade settings (estate/seb-upgrade.conf, below).
#
#   estate/seb-upgrade.sh <version> --from-artifact <version> [--dry-run] [--piece <id>]… [--apps-dir <dir>]
#   estate/seb-upgrade.sh <version> --from-release <git-tag> [--dry-run] [--piece <id>]… [--apps-dir <dir>]
#   estate/seb-upgrade.sh --verify
#   estate/seb-upgrade.sh --env <env>
#
# estate/seb-upgrade.conf — one `key = value` per line, `#` comments; each key at most once. No
# key has a default: a required key that is missing refuses every command, by name.
#   release-repo   (required) SEB's git repository, where release tags v<x.y.z> live: what a release
#                  artifact's commit is checked against, and what --from-release clones
#   apps-dir       (required) where one environment's generated Applications go, relative to the
#                  repository root, with {env} for the environment
#                  (e.g. gitops/apps/overlays/{env}/seb-bundle); it also holds the hand-written
#                  repo-seb-bundle.yaml, Argo CD's read credential for the bundle repository
#   predecessors   (required) where one environment's git-sourced Applications are, the ones a
#                  piece's generated Application replaces (<dir>/<piece id>.yaml), with {env}
#   housekeeping   (optional) the Harbor housekeeping manifest whose platform-lock mount the first
#                  upgrade makes required (optional: true → false)
#   ledger         (optional) a directory of <piece>.yaml records ({id, steps}) for an estate that
#                  moves pieces it held into SEB: each piece with a `moved` or `argo-switched` step
#                  is deployed on the first environment, on top of estate/seb-pieces.<first env>
#   piece-map      (optional, with ledger) a Node script mapping ledger ids to bundle piece ids
#                  (`node <map> <ledger id>…` prints one bundle id per line, exits 1 refusing)
#
# The FIRST environment (the first of the identity's ENVIRONMENTS) is the one that holds Harbor:
# its Applications go to apps-dir with that environment, beside the platform-lock ConfigMap.
# Every other environment with an estate/seb-pieces.<env> gets its own (step 6).
#
# --from-artifact <version> (the way to take a bundle): the release's SOURCE ARTIFACT that SEB's CI
#   published into this estate's Harbor, <REGISTRY_HOST>/seb/release:<version> (immutable tags), pulled
#   with the pull-only robot (credential: SEB_RELEASE_AUTH_FILE, a containers auth.json for robot$pull),
#   every digest checked (estate/seb-release-artifact.mjs); REFUSED unless the commit it records is
#   the one SEB's tag v<version> names (git ls-remote release-repo). Then exactly as below, built
#   from that tree. SEB_RELEASE_REGISTRY / SEB_RELEASE_PLAIN_HTTP=1 point it at a local registry (gate).
# --from-release <git-tag> (the fallback, when the artifact is not there: the estate holds no copy of SEB's source):
#   clones release-repo at <git-tag>, builds bundle <version> FROM THAT CLONE (its
#   tools/bundle/build.mjs, with THIS estate's identity and its own components,
#   estate/seb-components/<piece>/, for the pieces the release has), pushes it to Harbor (project
#   seb; a published version is never re-pushed), signed with SEB's key (COSIGN_PRIVATE_KEY,
#   COSIGN_PASSWORD: secret/platform/seb/cosign in this estate's OpenBao; SEB docs/lockdown.md),
#   REFUSES when the bundle Harbor then serves was not built from the tag's commit, runs the steps
#   below. The lock is the whole record: the estate keeps no copy of the release's tree.
#   With --dry-run: builds locally only, then compares the bundle piece by piece with the bundle
#   estate/platform.lock pins (pulled from Harbor): every locked piece present and its rendered
#   files BYTE-IDENTICAL; a piece the release ADDS is listed, not a difference. Writes nothing,
#   pushes nothing; exits 1 on a changed or dropped piece.
# --compare-bundles <locked-dir> <release-dir> <commit>: that comparison alone, on unpacked bundles.
#
# <version>:
#   1. resolves <registry>/seb/bundle:<version> to its manifest digest (asked of the registry);
#      with --digest, REFUSES when Harbor's digest is a different one
#   2. pulls it again BY DIGEST and reads its bundle.json: REFUSES when the version inside
#      is not <version>, or a piece to deploy is not in the bundle; REFUSES unless that digest
#      carries SEB's signature for <version> at its source commit (estate/lib/seb-upgrade-sign.sh)
#   3. writes estate/platform.lock (version, digest, source), keeping the lock's own header comment
#   4. regenerates <apps-dir>/platform-lock.yaml, the ConfigMap (namespace harbor) the Harbor
#      housekeeping job reads so retention never deletes the locked bundle (and, with housekeeping
#      set, makes the job's mount of it required)
#   5. writes one Argo CD Application per bundle piece the first environment deploys: every piece
#      estate/seb-pieces.<first env> lists, every piece the ledger records as `moved` or
#      `argo-switched` (mapped by piece-map), plus any --piece, by digest: repoURL
#      oci://<registry>/seb/bundle, path pieces/<id>, into --apps-dir (default: apps-dir for the
#      first environment) with its kustomization.yaml. Generated Applications for pieces no longer
#      listed are removed.
#      Each Application KEEPS the name, sync options, wave and ignoreDifferences of the one it
#      replaces — the generated seb-<id>.yaml already in --apps-dir, else the git-sourced
#      <predecessors>/<id>.yaml it takes over from — so the switch changes the source and nothing
#      Argo applies with. A piece with no predecessor gets its default name and CreateNamespace=true.
#      Each is labelled platform.<ESTATE_LABEL_DOMAIN>/source: seb-bundle, and names the bundle by
#      digest in spec.info (Kyverno's verify-seb-signatures reads it there).
#      A piece whose image the estate builds (bundle.json estateImages) also sets that image's tag,
#      from the estate's component, in spec.source.kustomize.images (estate/seb-image-tags.mjs).
#      A piece whose render names NO namespace (cluster-scoped objects only, e.g. the
#      ClusterIssuers of cert-manager) takes its destination namespace from that predecessor too
#      (Argo's tracking-id carries it); so does one whose objects name several namespaces (e.g.
#      platform-rbac); with no predecessor it is REFUSED, nothing written.
#      A HELM piece (bundle.json kind "helm": an upstream chart, contract in
#      seb/tools/bundle/helm-piece.mjs) is written instead as the bundle's Application template
#      with this estate's identity filled in and its values.yaml as spec.source.helm.values
#      (estate/seb-helm-app.mjs): the chart still comes from its repository, as Argo installs
#      any Helm Application, and the Application keeps the piece id as its name.
#   6. for every other estate/seb-pieces.<env> (e.g. prod), writes that environment's Applications from
#      the same bundle, by digest: the pieces it lists, into apps-dir for <env> (write_env). An entry
#      <id> deploys the piece's default render (path pieces/<id>); an entry <id>@<profile> deploys
#      that PROFILE of it (bundle.json .pieces[].profiles, path profiles/<profile>/<id>) and refuses
#      when the bundle carries no such profile: a piece is never quietly deployed with another
#      environment's profile. --env <env> does only this, from the current lock.
# --verify: the lock still holds — Harbor serves the locked tag, ON the locked digest, built from
#   the tag's commit, and SIGNED by SEB (estate/lib/seb-upgrade-sign.sh: estate/seb-cosign.pub,
#   annotations naming that version and commit). A lock edited by hand fails here.
# --deploy-set: the bundle piece ids a plain upgrade (no --piece) deploys on the first environment,
#   one per line, from the lists alone (no registry): what step 5 writes an Application for.
#
# Commits nothing: review the diff and commit it; the merge is the deploy.
# Registry credentials: podman's own login (REGISTRY_AUTH_FILE or the default auth file),
# read in-process for one pull token; never on argv, never printed.
set -euo pipefail

ROOT="$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)"
LOCK="${SEB_LOCK:-$ROOT/estate/platform.lock}"
CONF="${SEB_UPGRADE_CONF:-$ROOT/estate/seb-upgrade.conf}"  # overridable for the gate only
MARK="# GENERATED by estate/seb-upgrade.sh"
COMPONENTS="${SEB_ESTATE_COMPONENTS:-$ROOT/estate/seb-components}"  # overridable for the gate only

refuse() { printf 'REFUSED: %s\n' "$*" >&2; exit 1; }
say() { printf '%s\n' "$*"; }

# identity_value <key> — one value of the estate's identity (a flat `KEY: value` file).
identity_value() { sed -n "s/^$1:[[:space:]]*//p" "$ROOT/estate/identity.yaml"; }

# conf_value <key> [optional] — one value of the upgrade settings, named at most once; a path is
# relative to the repository root and never leaves it.
conf_value() {
  local n v
  [ -r "$CONF" ] || refuse "no ${CONF#"$ROOT/"}: this estate's upgrade settings (release-repo, apps-dir, predecessors) are not declared"
  n="$(grep -cE "^$1[[:space:]]*=" "$CONF" || true)"
  [ "$n" -le 1 ] || refuse "${CONF#"$ROOT/"} names $1 $n times"
  if [ "$n" = 0 ]; then
    [ "${2:-}" = optional ] || refuse "${CONF#"$ROOT/"} names no $1 (required: release-repo, apps-dir, predecessors)"
    return 0
  fi
  v="$(sed -n "s/^$1[[:space:]]*=[[:space:]]*//p" "$CONF")"; v="${v%"${v##*[![:space:]]}"}"
  [ -n "$v" ] || refuse "${CONF#"$ROOT/"}: $1 is empty"
  [ "$1" = release-repo ] && { printf '%s\n' "$v"; return 0; }
  [[ "$v" =~ ^[A-Za-z0-9._{}-]+(/[A-Za-z0-9._{}-]+)*$ ]] && [[ "/$v/" != */../* ]] && [[ "/$v/" != */./* ]] \
    || refuse "${CONF#"$ROOT/"}: $1 \"$v\" is not a path inside this repository"
  printf '%s\n' "$v"
}

HOST="$(identity_value REGISTRY_HOST)"
[[ "$HOST" =~ ^[a-z0-9.-]+$ ]] || refuse "estate/identity.yaml names no REGISTRY_HOST"
LABEL_DOMAIN="$(identity_value ESTATE_LABEL_DOMAIN)"
[[ "$LABEL_DOMAIN" =~ ^[a-z0-9.-]+$ ]] || refuse "estate/identity.yaml names no ESTATE_LABEL_DOMAIN"
LABEL="platform.$LABEL_DOMAIN/source"
FIRST_ENV="$(identity_value ENVIRONMENTS)"; FIRST_ENV="${FIRST_ENV%%,*}"; FIRST_ENV="${FIRST_ENV//[[:space:]]/}"
[[ "$FIRST_ENV" =~ ^[a-z]+$ ]] || refuse "estate/identity.yaml names no ENVIRONMENTS"
# SEB's own names in every estate's Harbor (tools/release, harbor-bootstrap.sh, verify-seb-signatures).
PROJECT=seb REPOSITORY=bundle
REPO="$HOST/$PROJECT/$REPOSITORY"
SOURCE="oci://$REPO"

RELEASE_REPO="${SEB_RELEASE_REPO:-$(conf_value release-repo)}"  # overridable for the gate only
APPS_PATTERN="$(conf_value apps-dir)"
PRED_PATTERN="$(conf_value predecessors)"
[[ "$APPS_PATTERN" == *"{env}"* ]] || refuse "${CONF#"$ROOT/"}: apps-dir \"$APPS_PATTERN\" names no {env}: every environment would write the same Applications"
[[ "$PRED_PATTERN" == *"{env}"* ]] || refuse "${CONF#"$ROOT/"}: predecessors \"$PRED_PATTERN\" names no {env}"
apps_dir_of() { printf '%s/%s\n' "$ROOT" "${APPS_PATTERN//\{env\}/$1}"; }
pred_dir_of() { printf '%s/%s\n' "$ROOT" "${PRED_PATTERN//\{env\}/$1}"; }
APPS="$(apps_dir_of "$FIRST_ENV")"
HOUSEKEEPING="$(conf_value housekeeping optional)"; [ -z "$HOUSEKEEPING" ] || HOUSEKEEPING="$ROOT/$HOUSEKEEPING"
LEDGER="$(conf_value ledger optional)"; [ -z "$LEDGER" ] || LEDGER="$ROOT/$LEDGER"
LEDGER="${SEB_LEDGER:-$LEDGER}"  # overridable for the gate only
PIECE_MAP="$(conf_value piece-map optional)"; [ -z "$PIECE_MAP" ] || PIECE_MAP="$ROOT/$PIECE_MAP"
[ -z "$PIECE_MAP" ] || [ -n "$LEDGER" ] || refuse "${CONF#"$ROOT/"}: piece-map without ledger maps nothing"
FIRST_PIECES="${SEB_FIRST_PIECES:-$ROOT/estate/seb-pieces.$FIRST_ENV}"  # overridable for the gate only

# The other environments that run SEB pieces from the same lock: each declares its pieces in
# estate/seb-pieces.<env>. Not the first: it runs its pieces through --apps-dir (step 5).
ENVS=()
for f in "$ROOT"/estate/seb-pieces.*; do [ -e "$f" ] && [ "${f##*.}" != "$FIRST_ENV" ] && ENVS+=("${f##*.}"); done

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# The script's parts, one responsibility each:
# shellcheck source=estate/lib/seb-upgrade-registry.sh
. "$ROOT/estate/lib/seb-upgrade-registry.sh"
# shellcheck source=estate/lib/seb-upgrade-sources.sh
. "$ROOT/estate/lib/seb-upgrade-sources.sh"
# shellcheck source=estate/lib/seb-upgrade-apps.sh
. "$ROOT/estate/lib/seb-upgrade-apps.sh"
# shellcheck source=estate/lib/seb-upgrade-write.sh
. "$ROOT/estate/lib/seb-upgrade-write.sh"
# shellcheck source=estate/lib/seb-upgrade-sign.sh
. "$ROOT/estate/lib/seb-upgrade-sign.sh"

case "${1:-}" in
  --verify) verify ;;
  --deploy-set) deploy_set ;;
  --compare-bundles)
    # The dry run's comparison alone, on two unpacked bundles (the gate's fixtures; no registry).
    [ $# = 4 ] || { echo "usage: $0 --compare-bundles <locked-dir> <release-dir> <commit>" >&2; exit 2; }
    compare_bundles "$2" "$3" "$4" ;;
  --env)
    # Regenerate one environment's Applications from the CURRENT lock (no new bundle taken).
    [[ "${2:-}" =~ ^[a-z]+$ ]] || { echo "usage: $0 --env <env>" >&2; exit 2; }
    [ -r "$LOCK" ] || refuse "no lock at $LOCK"
    write_env "$2" "$(lock_value version)" "$(lock_value digest)" ;;
  ""|-*) echo "usage: $0 <version> [--from-artifact <version> | --from-release <git-tag>] [--dry-run] [--digest sha256:…] [--piece <id>]… [--apps-dir <dir>] | --verify | --env <env>" >&2; exit 2 ;;
  *)
    version="$1"; shift; expect=""; apps="$APPS"; extra=(); tag=""; aver=""; dry=0
    while [ $# -gt 0 ]; do
      case "$1" in
        --from-release) tag="${2:-}"; shift 2 ;;
        --from-artifact) aver="${2:-}"; [ -n "$aver" ] || refuse "--from-artifact needs <version>"; shift 2 ;;
        --dry-run) dry=1; shift ;;
        --digest) expect="${2:-}"; shift 2 ;;
        --piece) extra+=("${2:-}"); shift 2 ;;
        --apps-dir) apps="$(realpath -m "${2:-}")"; shift 2 ;;
        *) echo "unknown argument: $1" >&2; exit 2 ;;
      esac
    done
    if [ -n "$aver" ]; then
      [ -z "$tag" ] || refuse "--from-artifact and --from-release: take the release one way"
      [ -z "$expect" ] || refuse "--digest and --from-artifact: the release's build decides the digest"
      from_artifact "$version" "$aver" "$dry" "$apps" "${extra[@]}"
    elif [ -n "$tag" ]; then
      [ -z "$expect" ] || refuse "--digest and --from-release: the release's build decides the digest"
      from_release "$version" "$tag" "$dry" "$apps" "${extra[@]}"
    else
      [ "$dry" = 0 ] || refuse "--dry-run needs --from-artifact <version> or --from-release <git-tag>"
      refuse "a bundle is taken only from a SEB release — $0 $version --from-artifact <version> (or --from-release <git-tag>)"
    fi
    ;;
esac
