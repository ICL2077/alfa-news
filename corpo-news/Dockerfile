# ============================
# Stage 1: Builder
# ============================
FROM git.birlab.ru/actions/base-images/node:22-alpine@sha256:fa1fb405a117ff1b1155dee7a493348d785e25de19794f4d474452884f874d7b AS builder

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.34.8 --activate

COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma
COPY prisma7.config.ts ./

RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm exec prisma generate
RUN pnpm run build

RUN pnpm prune --prod

# ============================
# Stage 2: Runtime
# ============================
FROM git.birlab.ru/actions/base-images/node:22-alpine@sha256:fa1fb405a117ff1b1155dee7a493348d785e25de19794f4d474452884f874d7b AS runtime

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.34.8 --activate

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma7.config.ts ./
COPY --from=builder /app/package.json ./

COPY docker-entrypoint.sh ./
RUN chmod +x ./docker-entrypoint.sh

EXPOSE 3000

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "dist/main.js"]