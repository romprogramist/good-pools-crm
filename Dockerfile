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

# NEXT_PUBLIC_* впекаются в client-bundle на этапе `next build`, не читаются
# в runtime. Передаём через build-arg из docker-compose.yml (см. args:).
ARG NEXT_PUBLIC_VAPID_PUBLIC_KEY=""
ENV NEXT_PUBLIC_VAPID_PUBLIC_KEY=$NEXT_PUBLIC_VAPID_PUBLIC_KEY

COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build
# Builder-образ используется в deploy.sh для запуска `prisma migrate deploy`
# и `tsx prisma/seeds/admin.ts` — в runner-стадии не все transitive deps
# (postgres-array и др.) присутствуют, бандлинг seed → .cjs хрупкий.

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
# prisma client + engines (.prisma/client/*.node) — нужны для runtime запросов
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

EXPOSE 3000
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]
