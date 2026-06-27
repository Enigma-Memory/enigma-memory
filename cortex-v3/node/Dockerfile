# syntax=docker/dockerfile:1

# ─────────────────────────────────────────────────────────────
# Enigma Cortex v3 — Off-Chain Memory Node
# Production-ready container image
# ─────────────────────────────────────────────────────────────

ARG NODE_VERSION=22

# ── Dependencies stage ───────────────────────────────────────
FROM node:${NODE_VERSION}-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force && mkdir -p node_modules

# ── Runtime stage ────────────────────────────────────────────
FROM node:${NODE_VERSION}-alpine AS runtime

ENV NODE_ENV=production
ENV PORT=3000
ENV CORTEX_NODE_PORT=3000

# Create a non-root user for the node process
RUN addgroup -g 10001 -S cortex && \
    adduser -u 10001 -S cortex -G cortex

WORKDIR /app

# Create writable data directory for the SQLite store
RUN mkdir -p /app/data && chown -R cortex:cortex /app/data

# Copy only what is needed to run
COPY --from=deps --chown=cortex:cortex /app/node_modules ./node_modules
COPY --chown=cortex:cortex src ./src
COPY --chown=cortex:cortex package.json ./

USER cortex

EXPOSE 3000

HEALTHCHECK --interval=30s \
            --timeout=3s \
            --start-period=5s \
            --retries=3 \
            CMD node -e "fetch('http://127.0.0.1:3000/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

CMD ["node", "src/server.mjs"]
