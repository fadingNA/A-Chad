# A-Chad gateway (Fastify + AI SDK). Build context = repo root.
FROM node:22-slim

WORKDIR /repo

# Install workspace deps first (cached unless a manifest changes).
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY packages/ui/package.json ./packages/ui/
RUN npm install

# App source.
COPY apps/api ./apps/api

WORKDIR /repo/apps/api
ENV PORT=8787
EXPOSE 8787
CMD ["npm", "run", "start"]
