# ==========================================
# Multi-stage Dockerfile for Coolify
# Builds Frontend + Backend into a single lightweight container
# ==========================================

# 1. Build Stage for Frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm install

COPY frontend/ ./
RUN npm run build

# 2. Runtime Stage for Backend + App
FROM node:20-alpine
WORKDIR /app

# Install python and make for better-sqlite3 build on alpine
RUN apk add --no-cache python3 make g++

COPY backend/package*.json ./backend/
WORKDIR /app/backend
RUN npm install --production

COPY backend/ ./
COPY --from=frontend-builder /app/frontend/dist ../frontend/dist

# Persistent directory for SQLite
VOLUME ["/app/backend/data"]

ENV PORT=4000
ENV NODE_ENV=production
ENV DATA_DIR=/app/backend/data

EXPOSE 4000

CMD ["node", "server.js"]
