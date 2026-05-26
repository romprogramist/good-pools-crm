# syntax=docker/dockerfile:1.7

# Stage 1: deps — устанавливаем зависимости и генерируем Prisma Client
FROM node:22-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

# Stage 2: builder — production-сборка Next.js + bundle seed
FROM node:22-alpine AS builder
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
ENV NODE_OPTIONS="--max-old-space-size=1536"
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build
# Бандлим seed-скрипт в самодостаточный CJS (без tsx/dotenv/bcryptjs в runtime).
# Prisma Client и adapter-pg остаются external — их подложим в runner отдельно.
RUN npx esbuild prisma/seeds/admin.ts \
      --bundle \
      --platform=node \
      --target=node22 \
      --format=cjs \
      --outfile=prisma/seeds/admin.cjs \
      --external:@prisma/client \
      --external:@prisma/adapter-pg

# Stage 3: runner — минимальный образ для запуска
FROM node:22-alpine AS runner
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl tini
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Next.js standalone (содержит свои bundled node_modules + server.js)
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Prisma CLI для `prisma migrate deploy` + клиент/адаптер для seed
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma

# Bundled seed-скрипт (запускается через `node prisma/seeds/admin.cjs`)
COPY --from=builder /app/prisma/seeds/admin.cjs ./prisma/seeds/admin.cjs

EXPOSE 3000
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]
