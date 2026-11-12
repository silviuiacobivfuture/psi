# scheduling-backend: the upstream self-hosted Convex backend with its permissions fixed, so it runs
# as a non-root user (the cluster's Kyverno requires one) with no initContainer.
#
# WHY A WRAPPER: upstream ships convex-local-backend and its scripts mode 0744 root:root, so any other
# uid gets "Permission denied" on ./run_backend.sh, and /convex/data is root-owned. This layer only
# changes modes and ownership; it adds no code. The upstream version stays the only moving part, pinned
# below by the linux/amd64 MANIFEST digest (the tag's multi-arch index is sha256:e9c084e8...; its amd64
# child is edf5c02b...). To upgrade: change tag and digest together, verify with
#   docker buildx imagetools inspect ghcr.io/convex/convex-backend:<tag>
#
# Built by .github/workflows/apps.yml from the repository root (no package.json, no workspace member:
# the plan job only needs this Dockerfile; the tag bump goes to
# gitops/services/scheduling-backend/overlays/dev). The REGISTRY_* build-args apps.yml always passes
# are unused here: the base is pulled from ghcr.io, not the Harbor mirror.
#
# Data: /convex/data (the image's default, a VOLUME) is where the StatefulSet mounts its PVC.
FROM ghcr.io/convex/convex-backend:d1fcbeaf939502a23a0f4b7e9095a12e84866294@sha256:edf5c02b395b17d58d0e494b401855da72bc01dda934e45552d6790fe430f368

USER root
RUN chmod 755 /convex/convex-local-backend /convex/generate_key /convex/run_backend.sh \
        /convex/read_credentials.sh /convex/generate_admin_key.sh \
    && mkdir -p /convex/data && chown -R 1000:1000 /convex/data
USER 1000:1000
WORKDIR /convex
# Same entrypoint as upstream (./run_backend.sh); restated so a change upstream cannot silently alter it.
ENTRYPOINT ["./run_backend.sh"]
