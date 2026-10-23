# Multi-stage: build the React app, then run the API which also serves it
FROM node:20-alpine AS web
WORKDIR /web
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM node:20-alpine
WORKDIR /srv/backend
COPY backend/package*.json ./
RUN npm ci --omit=dev
COPY backend/ ./
COPY --from=web /web/dist /srv/frontend/dist
ENV NODE_ENV=production PORT=4000
EXPOSE 4000
CMD ["node", "src/server.js"]
