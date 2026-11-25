FROM node:22-bookworm-slim AS build

WORKDIR /workspace
COPY package.json ./
COPY package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/storefront/package.json apps/storefront/package.json
RUN npm ci --include-workspace-root

COPY apps/api apps/api
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build?schema=public \
  npm run db:generate --workspace @commerce/api
RUN npm run build --workspace @commerce/api
RUN npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /workspace
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY --from=build --chown=node:node /workspace/node_modules ./node_modules
COPY --from=build --chown=node:node /workspace/package.json ./package.json
COPY --from=build --chown=node:node /workspace/apps/api/package.json ./apps/api/package.json
COPY --from=build --chown=node:node /workspace/apps/api/prisma.config.ts ./apps/api/prisma.config.ts
COPY --from=build --chown=node:node /workspace/apps/api/prisma ./apps/api/prisma
COPY --from=build --chown=node:node /workspace/apps/api/dist ./apps/api/dist
COPY --chown=node:node apps/api/docker-entrypoint.sh ./apps/api/docker-entrypoint.sh
RUN chmod 755 ./apps/api/docker-entrypoint.sh
USER node
EXPOSE 3001
CMD ["./apps/api/docker-entrypoint.sh"]
