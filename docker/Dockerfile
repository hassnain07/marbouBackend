# ─── Stage 1: dependencies ────────────────────────────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app

# Install native build toolchain (sharp, argon2 require compilation).
RUN apk add --no-cache python3 make g++ libc6-compat

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

# ─── Stage 3: production ───────────────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# Only copy what is needed at runtime.
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./package.json

# Create a non-root user for security (NFR-SEC-01).
RUN addgroup -S marbou && adduser -S marbou -G marbou
USER marbou

EXPOSE 3000

# Run pending migrations, then start the server.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
