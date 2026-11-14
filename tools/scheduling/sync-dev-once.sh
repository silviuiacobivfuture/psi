#!/usr/bin/env bash
# Prints the manifests of the one-shot, ANONYMIZED sync into dev (gitops/services/scheduling-sync/overlays/dev-once),
# with the image tag dev runs for scheduling-deploy (the image that carries the sync). Pipe it into the dev cluster:
#
#   tools/scheduling/sync-dev-once.sh | kubectl create -f -
#   kubectl -n scheduling logs -f job/scheduling-sync-dev
#
# A previous run is removed first (a Job's name is unique): kubectl -n scheduling delete job scheduling-sync-dev.
# Needs the image built after the sync landed (CI builds scheduling-deploy on every change to packages/): the tag in
# gitops/services/scheduling-deploy/overlays/dev must be newer than that change.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

TAG="$(sed -n 's/^[[:space:]]*newTag:[[:space:]]*"\([^"]*\)".*/\1/p' gitops/services/scheduling-deploy/overlays/dev/kustomization.yaml)"
case "$TAG" in
*[!0-9a-f]* | "") echo "sync-dev-once: dev has no built scheduling-deploy image yet ('$TAG')" >&2; exit 1 ;;
esac

kustomize build gitops/services/scheduling-sync/overlays/dev-once | sed "s|psi/scheduling-deploy:from-dev-overlay|psi/scheduling-deploy:$TAG|"
