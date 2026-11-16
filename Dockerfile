FROM node:24-alpine AS deps
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json package-lock.json ./
RUN npm ci

FROM node:24-alpine AS builder
WORKDIR /app
ARG STEAM_CALENDAR_VERSION=
ENV STEAM_CALENDAR_VERSION=${STEAM_CALENDAR_VERSION}
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN mkdir -p public data
RUN npm run build

FROM node:24-alpine AS runner
WORKDIR /app
ARG STEAM_CALENDAR_VERSION=
ENV STEAM_CALENDAR_VERSION=${STEAM_CALENDAR_VERSION}
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
ENV DB_SQLITE_PATH=/app/data/steam-calendar.sqlite
ENV APP_DEBUG=1

RUN mkdir -p .next/standalone .next/static public data docker && chown -R node:node /app

COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --chown=node:node docker/entrypoint.mjs ./docker/entrypoint.mjs

USER node
EXPOSE 3000
VOLUME ["/app/data"]
ENTRYPOINT ["node", "docker/entrypoint.mjs"]
CMD []
