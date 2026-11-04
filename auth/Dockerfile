FROM node:22-alpine AS build
WORKDIR /app

COPY libs ./libs
COPY auth ./auth

RUN cd libs && npm install && npm run build
RUN cd auth && npm install && npm run build
RUN cd libs && npm prune --omit=dev && cd ../auth && npm prune --omit=dev

FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000 \
    DB_HOST=floci \
    DB_PORT=17004 \
    DB_USER=restaurant \
    DB_PASSWORD=restaurant1234 \
    DB_NAME=auth \
    SERVICE_NAME=auth \
    USER_SERVICE_URL=http://floci:8080 \
    JWT_ACCESS_TOKEN_SECRET=restaurant-dev-access-secret-change-me \
    ACCESS_TOKEN_TTL_SECONDS=900 \
    REFRESH_TOKEN_TTL_SECONDS=604800

COPY --from=build /app/libs/package.json ./libs/package.json
COPY --from=build /app/libs/dist ./libs/dist
COPY --from=build /app/libs/node_modules ./libs/node_modules
COPY --from=build /app/auth/package.json ./auth/package.json
COPY --from=build /app/auth/node_modules ./auth/node_modules
COPY --from=build /app/auth/dist ./auth/dist

WORKDIR /app/auth
EXPOSE 3000

ENTRYPOINT ["node", "dist/main.js"]
