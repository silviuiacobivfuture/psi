# scheduling-deploy — the one-shot that deploys @psi/scheduling's Convex functions to the in-cluster
# backend (gitops/services/scheduling-deploy runs it as an Argo PostSync Job). It holds the
# functions (packages/scheduling/convex), the Convex CLI, deploy.sh, and the nightly export (export.sh,
# with age) and the restore drill's table counter (count-tables.sh); no admin key is baked in
# (it arrives from OpenBao at run time). Built from the repository root:
#   podman build -f apps/scheduling-deploy/Dockerfile \
#     --build-arg REGISTRY_HOST=… --build-arg REGISTRY_PROJECT_MIRROR=… -t <registry>/psi/scheduling-deploy:<tag> .
# Base images come from the estate's Harbor mirror; there is no default registry.
ARG REGISTRY_HOST
ARG REGISTRY_PROJECT_MIRROR
FROM ${REGISTRY_HOST}/${REGISTRY_PROJECT_MIRROR}/docker.io/library/node:24-alpine AS build
WORKDIR /repo
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile --filter "@psi/scheduling..."
RUN pnpm --config.node-linker=hoisted --filter "@psi/scheduling" deploy --prod --legacy /out

FROM ${REGISTRY_HOST}/${REGISTRY_PROJECT_MIRROR}/docker.io/library/node:24-alpine
ENV NODE_ENV=production HOME=/tmp NO_UPDATE_NOTIFIER=1 CI=true
# age encrypts the nightly export (export.sh) to the owner's public key.
RUN apk add --no-cache age
WORKDIR /app
COPY --from=build --chown=1000:1000 /out /app
COPY --chown=1000:1000 apps/scheduling-deploy/deploy.sh apps/scheduling-deploy/export.sh \
     apps/scheduling-deploy/count-tables.sh /app/
USER 1000
CMD ["/app/deploy.sh"]
