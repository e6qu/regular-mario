# Node comes from the Amazon ECR Public copy of Docker's official images,
# pinned to the same index digest Docker Hub serves: Docker Hub limits
# anonymous pulls per address, and the shared CI runners exhaust it.
FROM public.ecr.aws/docker/library/node:26.13.1-trixie-slim@sha256:abe7e5a82b61a8ef67b315b85497c9e65173387ccf2f4a029248184b8e020be5 AS base

# Freeze signed OS packages beyond the repository's three-day admission window.
# The archive signatures authenticate packages even during HTTP CA bootstrap.
ARG DEBIAN_SNAPSHOT=20261124T220000Z
RUN node -e 'const v=process.argv[1]; const match=/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(v); const time=match ? Date.parse(`${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}Z`) : NaN; if (!Number.isFinite(time) || Date.now()-time <= 3*86400000) throw new Error("Debian snapshot must be older than three days")' "$DEBIAN_SNAPSHOT" \
    && printf 'Types: deb\nURIs: http://snapshot.debian.org/archive/debian/%s\nSuites: trixie trixie-updates\nComponents: main\nSigned-By: /usr/share/keyrings/debian-archive-keyring.gpg\nCheck-Valid-Until: no\n\nTypes: deb\nURIs: http://snapshot.debian.org/archive/debian-security/%s\nSuites: trixie-security\nComponents: main\nSigned-By: /usr/share/keyrings/debian-archive-keyring.gpg\nCheck-Valid-Until: no\n' "$DEBIAN_SNAPSHOT" "$DEBIAN_SNAPSHOT" > /etc/apt/sources.list.d/debian.sources \
    && printf 'Acquire::Retries "3";\nAcquire::http::Timeout "30";\n' > /etc/apt/apt.conf.d/80-bounded-downloads \
    && timeout 180 apt-get update \
    && DEBIAN_FRONTEND=noninteractive timeout 180 apt-get upgrade -y \
    && rm -rf /var/lib/apt/lists/*

FROM base AS build
ARG GITHUB_SHA
WORKDIR /app
# Node 26 ships no corepack (removed after Node 24), so `corepack enable` exits
# 127 and the image could never build. Install the pinned pnpm directly -- the
# same version the workflows pin, so the lockfile is resolved by one resolver
# everywhere.
RUN npm install -g pnpm@10.33.3

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm run build:release && pnpm run build:server \
    && CI=true pnpm prune --prod --ignore-scripts

FROM base AS runtime
# Deployment runs Node directly. Package managers and development dependencies
# add no runtime capability and unnecessarily retain vulnerable tooling code.
RUN rm -rf /usr/local/lib/node_modules/npm /opt/yarn-v* \
    && rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/yarn /usr/local/bin/yarnpkg

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
