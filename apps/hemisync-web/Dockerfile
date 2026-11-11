# hemisync-web, built from the repository root:
#   docker build -f apps/hemisync-web/Dockerfile \
#     --build-arg REGISTRY_HOST=… --build-arg REGISTRY_PROJECT_MIRROR=… .
# Base images come from the estate's Harbor mirror, pinned by digest (SEB images.list); there is
# no default registry, so an empty one fails the FROM loudly.
#
# The build bundles the server (dist/server.js) and the knowledge seed (dist/knowledge-seed.js),
# the workspace @psi/* packages and every library included. What the bundles still load at
# runtime is copied from the lockfile's production tree (`pnpm deploy --prod`, flat): hono,
# @hono/node-server and zod (left external), libsql's native binding for the platform, and
# @psi/ui (its datastar.js, read through import.meta.resolve). The last RUN imports both bundles
# from that pruned tree, so a module the list misses fails the build, not the pod.
ARG REGISTRY_HOST
ARG REGISTRY_PROJECT_MIRROR
FROM ${REGISTRY_HOST}/${REGISTRY_PROJECT_MIRROR}/docker.io/library/node:24-alpine@sha256:4eefa1bfce4197942661ef9148247d779ddf1bb0ee006d3294a467609de60724 AS build
WORKDIR /repo
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile --filter @psi/hemisync-web... \
 && pnpm --filter @psi/hemisync-web run build \
 && pnpm --filter @psi/hemisync-web --prod --config.node-linker=hoisted deploy --legacy /out
RUN mkdir -p /runtime/node_modules/@hono /runtime/node_modules/@libsql /runtime/node_modules/@psi \
 && cp -r /out/node_modules/hono /out/node_modules/zod /runtime/node_modules/ \
 && cp -r /out/node_modules/@hono/node-server /runtime/node_modules/@hono/ \
 && cp -r /out/node_modules/@libsql/linux-* /runtime/node_modules/@libsql/ \
 && cp -r /out/node_modules/@psi/ui /runtime/node_modules/@psi/ \
 && cp -r apps/hemisync-web/dist apps/hemisync-web/public /runtime/ \
 && cd /runtime \
 && NODE_ENV=test PSI_KNOWLEDGE_DB_URL=file:/tmp/smoke.db node --input-type=module \
      -e "await import('/runtime/dist/server.js'); await import('/runtime/dist/knowledge-seed.js');"

FROM ${REGISTRY_HOST}/${REGISTRY_PROJECT_MIRROR}/docker.io/library/node:24-alpine@sha256:4eefa1bfce4197942661ef9148247d779ddf1bb0ee006d3294a467609de60724
WORKDIR /app
ENV NODE_ENV=production \
    PORT=8080 \
    PSI_KNOWLEDGE_DB_URL=file:/app/.data/knowledge.db
COPY --from=build /runtime ./
# The knowledge database's directory: the Deployment mounts a volume here; without one (a local
# `docker run`) the image's own directory is writable by the runtime user (node, uid 1000).
RUN mkdir -p /app/.data && chown 1000:1000 /app/.data
USER 1000
EXPOSE 8080
CMD ["node", "dist/server.js"]
