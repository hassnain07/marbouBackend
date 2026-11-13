# ─── Stage 1: dependencies ────────────────────────────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app

# Install native build toolchain (sharp, @node-rs/argon2 require compilation).
RUN apk add --no-cache python3 make g++ libc6-compat openssl

COPY package*.json ./
RUN npm ci --no-audit --no-fund

# ─── Stage 2: build ────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate the Prisma client and compile TypeScript.
RUN npx prisma generate
RUN npm run build

# ─── Stage 3: production runner ────────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app

# openssl is required by Prisma's migration engine at runtime.
RUN apk add --no-cache openssl

# Copy only runtime artefacts.
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./package.json

# Create a non-root user (NFR-SEC-01). The app and migration engine both run
# as this user, so /app must be owned by them before the USER switch.
RUN addgroup -S marbou && adduser -S marbou -G marbou \
    && chown -R marbou:marbou /app

USER marbou

EXPOSE 3000

# `prisma migrate deploy` applies any pending migrations, then the server
# starts. Both steps run as the non-root marbou user; the binary lives in
# node_modules/.bin which is on PATH.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
