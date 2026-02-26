# Build stage — install all dependencies (including unpdf for statement upload) from lockfile
FROM node:20-alpine AS builder

WORKDIR /app

# Require lockfile so npm ci installs exact versions and all deps (avoids missing modules at build/runtime)
COPY package.json package-lock.json ./
RUN npm ci --include=dev

# Bump CACHE_BUST in Portainer stack env (e.g. 2, 3…) to force full rebuild when "Re-pull image" isn't available
ARG CACHE_BUST=1
RUN echo "Build cache bust: $CACHE_BUST"
COPY . .
RUN npm run build

# Run stage (minimal image)
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
