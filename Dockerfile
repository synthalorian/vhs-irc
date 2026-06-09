# syntax=docker/dockerfile:1

# -------------------------------
# Stage 1: Build
# -------------------------------
FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies for native modules (sqlite3)
RUN apk add --no-cache python3 make g++

# Copy dependency manifests first for layer caching
COPY package.json package-lock.json ./
RUN npm ci

# Copy source and build
COPY . .
RUN npm run build

# -------------------------------
# Stage 2: Production
# -------------------------------
FROM node:20-alpine AS production

WORKDIR /app

# Install runtime dependencies for native modules
RUN apk add --no-cache sqlite-libs

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy built application and dependencies
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/package.json ./
COPY --from=builder --chown=nodejs:nodejs /app/public ./public

# Create data directory for SQLite and uploads
RUN mkdir -p /app/data/uploads && chown -R nodejs:nodejs /app/data

USER nodejs

EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/auth/me', (r) => r.statusCode === 401 ? process.exit(0) : process.exit(1))"

CMD ["node", "dist/src/server.js"]
