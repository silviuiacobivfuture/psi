# One recipe for psi's Hono sites. Built from the repository root:
#   podman build -f deploy/site.Dockerfile --build-arg APP=psizone-web --build-arg REGISTRY_HOST=… \
#     --build-arg REGISTRY_PROJECT_MIRROR=… -t <registry>/psi/psizone-web:<tag> .
# The sites use only psi's own packages: .dockerignore leaves out the bundle installer, so the hook stands down.
#
# LAYERED SO A CODE CHANGE PUSHES MEGABYTES, NOT THE APP. The image was one layer of 514 MB (third-party
# node_modules ~420, psi's packages 24, the app 47), new on every build and re-uploaded whole. The same
# `pnpm deploy` output now leaves in three layers, on the estate's mirror of the base image:
#   1. third-party node_modules;   2. psi's packages (node_modules/@psi);   3. the app (dist/, public/, …).
# Layers 1 and 2 are REPRODUCIBLE: every mtime pinned to 0 and pnpm's timestamped .modules.yaml left out,
# laid out from / so no directory this build creates is in them. Unchanged inputs give the same bytes, the
# same digest, and the registry already has the blob: nothing is uploaded. Layer 3 keeps real mtimes
# (packages/delivery/src/site-assets.tsx makes ETags from them).
ARG REGISTRY_HOST
ARG REGISTRY_PROJECT_MIRROR
FROM ${REGISTRY_HOST}/${REGISTRY_PROJECT_MIRROR}/docker.io/library/node:24-alpine AS build
ARG APP
RUN corepack enable
ENV npm_config_store_dir=/pnpm-store
WORKDIR /repo
COPY . .
RUN --mount=type=cache,id=pnpm-store,target=/pnpm-store pnpm install --frozen-lockfile --filter "@psi/${APP}..."
RUN pnpm --filter "@psi/${APP}" build
RUN --mount=type=cache,id=pnpm-store,target=/pnpm-store \
    pnpm --config.node-linker=hoisted --filter "@psi/${APP}" deploy --prod --legacy /out
RUN cp -r "apps/${APP}/dist" /out/ && if [ -d "apps/${APP}/public" ]; then cp -r "apps/${APP}/public" /out/; fi \
 && mkdir -p /layers/deps/app /layers/psi/app/node_modules \
 && mv /out/node_modules/@psi /layers/psi/app/node_modules/@psi \
 && rm -f /out/node_modules/.modules.yaml && mv /out/node_modules /layers/deps/app/node_modules \
 && find /layers -exec touch -h -d @0 {} +

FROM ${REGISTRY_HOST}/${REGISTRY_PROJECT_MIRROR}/docker.io/library/node:24-alpine
ENV NODE_ENV=production PORT=3000
COPY --from=build /layers/deps/ /
COPY --from=build /layers/psi/ /
WORKDIR /app
COPY --from=build /out /app
# The knowledge base writes .data/ (libSQL); in the cluster a volume mounts there.
RUN mkdir -p /app/.data && chown node:node /app/.data
USER node
EXPOSE 3000
CMD ["node", "dist/server.js"]
