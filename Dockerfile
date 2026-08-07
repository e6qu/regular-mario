FROM node:26-bookworm-slim AS build

WORKDIR /app
# Node 26 ships no corepack (removed after Node 24), so `corepack enable` exits
# 127 and the image could never build. Install the pinned pnpm directly -- the
# same version the workflows pin, so the lockfile is resolved by one resolver
# everywhere.
RUN npm install -g pnpm@10.33.3

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm run build:release && pnpm run build:server

FROM node:26-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/dist ./dist
COPY --from=build /app/server-dist ./server-dist

# Drop to the unprivileged user the node image already provides. The server
# binds 8080, above the privileged range, and writes nothing outside /tmp, so it
# has no reason to run as root -- and a public, untrusted-input service is the
# last place to leave root on by default.
USER node

EXPOSE 8080
CMD ["node", "server-dist/main.js"]
