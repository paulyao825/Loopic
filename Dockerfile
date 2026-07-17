# Loopic — single container serving API + built web UI.
# Used for the Akash deployment (deploy/akash.sdl.yaml) and works on any
# container host (AWS ECS/App Runner included).
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci
COPY . .
RUN npm run build -w web

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY server/package.json server/
RUN npm ci -w server --omit=dev && npm cache clean --force
COPY server server
COPY loopic.config.json ./
COPY --from=build /app/web/dist web/dist

EXPOSE 4000
CMD ["npx", "tsx", "server/src/server.ts"]
