# Build stage: install all workspace deps, build frontend + backend.
FROM docker.io/library/node:26-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY frontend/package.json frontend/
COPY backend/package.json backend/
RUN npm ci
COPY . .
RUN npm run build -w frontend -w backend

# Runtime stage: fresh prod-only install for the backend workspace,
# frontend build served by Express as static assets.
FROM docker.io/library/node:26-slim
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
COPY frontend/package.json frontend/
COPY backend/package.json backend/
RUN npm ci --omit=dev -w backend --ignore-scripts && npm cache clean --force
COPY --from=build /app/backend/dist backend/dist
COPY --from=build /app/frontend/dist backend/public
ENV STATIC_DIR=/app/backend/public PORT=3000
USER node
EXPOSE 3000
# Direct node exec (not npm) so SIGTERM reaches the process.
CMD ["node", "backend/dist/server.js"]
