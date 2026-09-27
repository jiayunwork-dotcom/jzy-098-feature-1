# syntax=docker/dockerfile:1

# ---- 阶段 1：构建前端静态资源 ----
FROM node:20-alpine AS web-build
WORKDIR /app
# 先复制 workspace 清单以利用层缓存
COPY package.json package-lock.json* ./
COPY frontend/package.json ./frontend/
COPY backend/package.json ./backend/
RUN npm ci || npm install
COPY frontend ./frontend
RUN npm run build --workspace frontend

# ---- 阶段 2：构建后端 TypeScript ----
FROM node:20-alpine AS server-build
WORKDIR /app
COPY package.json package-lock.json* ./
COPY frontend/package.json ./frontend/
COPY backend/package.json ./backend/
RUN npm ci || npm install
COPY backend ./backend
RUN npm run build --workspace backend

# ---- 阶段 3：运行时（只保留生产依赖 + 构建产物） ----
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY package.json package-lock.json* ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/
RUN npm ci --omit=dev || npm install --omit=dev

COPY --from=server-build /app/backend/dist ./backend/dist
COPY --from=web-build /app/frontend/dist ./frontend/dist

EXPOSE 3000
# 容器内后端同时提供 API 与前端静态页面
CMD ["node", "backend/dist/index.js"]
