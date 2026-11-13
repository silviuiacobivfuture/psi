# scheduling-api — psi's headless scheduling service (Hono, one bundled server.js). Built from the repository root:
#   podman build -f apps/scheduling-api/Dockerfile --ignorefile apps/scheduling-api/Dockerfile.dockerignore \
#     --build-arg REGISTRY_HOST=… --build-arg REGISTRY_PROJECT_MIRROR=… -t <registry>/psi/scheduling-api:<tag> .
# Base images come from the estate's Harbor mirror; there is no default registry. .github/workflows/apps.yml builds
# every app that has a Dockerfile, so merging this builds and tags it (the Argo Application is registered separately).
ARG REGISTRY_HOST
ARG REGISTRY_PROJECT_MIRROR
FROM ${REGISTRY_HOST}/${REGISTRY_PROJECT_MIRROR}/docker.io/library/node:24-alpine AS build
WORKDIR /repo
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile --ignore-scripts --filter "@psi/scheduling-api..."
# esbuild bundles the workspace packages (TypeScript sources) and every dependency into dist/server.js, so the
# runtime image needs neither node_modules nor pnpm.
# The workspace packages that generate code (@psi/notify compiles its messages) build first, as nx does.
RUN pnpm --filter "@psi/scheduling-api^..." --if-present build
RUN pnpm --filter @psi/scheduling-api build

FROM ${REGISTRY_HOST}/${REGISTRY_PROJECT_MIRROR}/docker.io/library/node:24-alpine
ENV NODE_ENV=production PORT=4380
WORKDIR /app
COPY --from=build --chown=1000:1000 /repo/apps/scheduling-api/dist/server.js ./server.js
USER 1000
EXPOSE 4380
CMD ["node", "server.js"]
