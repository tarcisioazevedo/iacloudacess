# ──────────────────────────────────────────────
# School Access Platform — API Dockerfile
# Multi-stage, production-optimized for Swarm
# ──────────────────────────────────────────────

# ─── Stage 1: Install dependencies ────────────
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma/
# BuildKit cache mount: npm cache persiste entre builds, sem re-download em rebuild
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev --prefer-offline 2>/dev/null || \
    npm ci --omit=dev
RUN npx prisma generate
# Keep dev dependencies for tsx in a separate layer
RUN cp -r node_modules node_modules_prod
RUN --mount=type=cache,target=/root/.npm \
    npm ci --prefer-offline 2>/dev/null || \
    npm ci
RUN npx prisma generate
COPY index.html tsconfig.json vite.config.ts ./
COPY src ./src/
RUN npm run build

# ─── Stage 2: Production image ────────────────
FROM node:20-alpine AS production
WORKDIR /app

# Security: non-root user
RUN addgroup -g 1001 -S appgroup && \
    adduser -S appuser -u 1001 -G appgroup

# tini for proper PID 1 signal handling (graceful shutdown)
RUN apk add --no-cache tini curl

# Copy production deps + prisma client
COPY --from=deps /app/node_modules_prod ./node_modules
COPY --from=deps /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=deps /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=deps /app/node_modules/prisma ./node_modules/prisma

# Copy app code  
COPY package.json tsconfig.json ./
COPY prisma ./prisma/
COPY api ./api/
COPY --from=deps /app/dist ./dist

# We need tsx for running TypeScript directly
COPY --from=deps /app/node_modules/tsx ./node_modules/tsx
COPY --from=deps /app/node_modules/esbuild ./node_modules/esbuild
COPY --from=deps /app/node_modules/@esbuild ./node_modules/@esbuild
COPY --from=deps /app/node_modules/get-tsconfig ./node_modules/get-tsconfig
COPY --from=deps /app/node_modules/resolve-pkg-maps ./node_modules/resolve-pkg-maps

# Criar symlink .bin/tsx para que npx/entrypoint encontre o binário corretamente
RUN mkdir -p node_modules/.bin && \
    ln -sf ../tsx/dist/cli.mjs node_modules/.bin/tsx && \
    chmod +x node_modules/.bin/tsx

# Copy entrypoint script
COPY scripts/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Set ownership
RUN chown -R appuser:appgroup /app

USER appuser

# Health check for Swarm service mesh
HEALTHCHECK --interval=20s --timeout=5s --start-period=120s --retries=3 \
  CMD curl -f http://localhost:4000/api/health || exit 1

EXPOSE 4000

ENTRYPOINT ["tini", "--"]
CMD ["/entrypoint.sh"]
