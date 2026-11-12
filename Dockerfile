FROM node:22-alpine AS tools
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx prisma generate

FROM tools AS builder
ARG NEXT_PUBLIC_TEAM_LOGOS_ENABLED=false
ENV NEXT_PUBLIC_TEAM_LOGOS_ENABLED=$NEXT_PUBLIC_TEAM_LOGOS_ENABLED
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup -S -g 1001 nodejs && adduser -S -u 1001 -G nodejs nextjs
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
RUN mkdir -p /app/uploads/avatars /app/.next/cache && touch /app/.env && chown -R nextjs:nodejs /app/uploads /app/.next/cache /app/.env
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
