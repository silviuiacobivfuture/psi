# psizone-web's image, built by CI (.github/workflows/apps.yml: -f apps/psizone-web/Dockerfile, context = repo root).
# The shared recipe for psi's Node site apps is deploy/site.Dockerfile; this is it with the app named.
# One recipe for psi's Hono sites. Built from the repository root:
#   podman build -f deploy/site.Dockerfile --build-arg APP=psizone-web -t <registry>/psi/psizone-web:<tag> .
# The sites use only psi's own packages: .dockerignore leaves out the bundle installer, so the hook stands down.
FROM docker.io/library/node:24-alpine AS build
ARG APP=psizone-web
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile --filter "@psi/${APP}..."
RUN pnpm --filter "@psi/${APP}" build
RUN pnpm --config.node-linker=hoisted --filter "@psi/${APP}" deploy --prod --legacy /out
RUN cp -r "apps/${APP}/dist" /out/ && if [ -d "apps/${APP}/public" ]; then cp -r "apps/${APP}/public" /out/; fi

FROM docker.io/library/node:24-alpine
ENV NODE_ENV=production PORT=3000
WORKDIR /app
COPY --from=build /out /app
# The knowledge base writes .data/ (libSQL); in the cluster a volume mounts there.
RUN mkdir -p /app/.data && chown node:node /app/.data
USER node
EXPOSE 3000
CMD ["node", "dist/server.js"]
