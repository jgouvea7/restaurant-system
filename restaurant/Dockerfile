FROM node:22-alpine AS build
WORKDIR /app

COPY aws ./aws
COPY libs ./libs
COPY restaurant ./restaurant

RUN cd aws && npm install && npm run build
RUN cd libs && npm install && npm run build
RUN cd restaurant && npm install && npm run build
RUN cd aws && npm prune --omit=dev && cd ../libs && npm prune --omit=dev && cd ../restaurant && npm prune --omit=dev

FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000 \
    DB_HOST=floci \
    DB_PORT=17002 \
    DB_USER=restaurant \
    DB_PASSWORD=restaurant1234 \
    DB_NAME=restaurants \
    AWS_ENDPOINT_URL=http://floci:4566 \
    AWS_DEFAULT_REGION=us-east-1 \
    AWS_ACCESS_KEY_ID=restaurant \
    AWS_SECRET_ACCESS_KEY=secretkeyrestaurant

COPY --from=build /app/aws/package.json ./aws/package.json
COPY --from=build /app/aws/dist ./aws/dist
COPY --from=build /app/aws/node_modules ./aws/node_modules
COPY --from=build /app/libs/package.json ./libs/package.json
COPY --from=build /app/libs/dist ./libs/dist
COPY --from=build /app/libs/node_modules ./libs/node_modules
COPY --from=build /app/restaurant/package.json ./restaurant/package.json
COPY --from=build /app/restaurant/node_modules ./restaurant/node_modules
COPY --from=build /app/restaurant/dist ./restaurant/dist

WORKDIR /app/restaurant
EXPOSE 3000

ENTRYPOINT ["node", "dist/main.js"]
