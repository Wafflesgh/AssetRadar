# Dockerfile — Container image for Google Cloud Run. Cloud Build builds it automatically on
# every push to main (continuous deployment), so the app keeps the same URL after each update.
# Installs all dependencies (tsx runs server.ts), builds the React app into dist/, then serves
# it with the Express server in production mode on the port Cloud Run provides ($PORT, 8080).
FROM node:24-slim

WORKDIR /app

# Dependencies first so this layer is reused when only the source changes
COPY package.json package-lock.json .npmrc ./
RUN npm ci --no-audit --no-fund

COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

CMD ["./node_modules/.bin/tsx", "server.ts"]
