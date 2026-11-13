# Dockerfile — AssetRadar on Google Cloud Run: builds the front end, then runs server.ts in
# serverless mode (the hourly Cloud Scheduler job calls /api/cron/tick; SSE streams stay on, server/runtime.ts).
FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm ci
COPY . .
RUN npm run build
ENV NODE_ENV=production SERVERLESS=1
# Cloud Run sets PORT (8080); server.ts listens on it
CMD ["npx", "tsx", "server.ts"]
