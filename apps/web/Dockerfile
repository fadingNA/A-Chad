# A-Chad web (Vite build → static nginx). Build context = repo root.
FROM node:22-slim AS build

WORKDIR /repo

COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY packages/ui/package.json ./packages/ui/
RUN npm install

COPY apps/web ./apps/web
COPY packages ./packages

# Vite inlines these at build time. The browser (on the host) reaches the
# gateway via the published host port, so this is a host URL, not a service name.
ARG VITE_API_URL=http://localhost:8787
ARG VITE_USE_GATEWAY=true
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_USE_GATEWAY=$VITE_USE_GATEWAY

RUN npm run build -w web

FROM nginx:alpine
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 80
