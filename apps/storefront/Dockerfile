FROM node:22-bookworm-slim AS dependencies
WORKDIR /workspace
COPY package.json ./
COPY package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/storefront/package.json apps/storefront/package.json
RUN npm ci --include-workspace-root

FROM node:22-bookworm-slim AS build
WORKDIR /workspace
ENV NEXT_TELEMETRY_DISABLED=1
ARG NEXT_PUBLIC_API_URL=http://localhost:3001/api/v1
ARG NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
ARG NEXT_PUBLIC_WEB_URL=http://localhost:3000
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=${NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY}
ENV NEXT_PUBLIC_WEB_URL=${NEXT_PUBLIC_WEB_URL}
COPY --from=dependencies /workspace/node_modules ./node_modules
COPY package.json ./
COPY package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/storefront/package.json apps/storefront/package.json
COPY apps/storefront apps/storefront
RUN npm run build --workspace @commerce/storefront

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
WORKDIR /workspace
COPY --from=build --chown=node:node /workspace/apps/storefront/.next/standalone ./
COPY --from=build --chown=node:node /workspace/apps/storefront/.next/static ./apps/storefront/.next/static
COPY --from=build --chown=node:node /workspace/apps/storefront/public ./apps/storefront/public
USER node
EXPOSE 3000
CMD ["node", "apps/storefront/server.js"]
