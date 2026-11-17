# ---- 构建阶段 ----
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY vite.config.ts tsconfig.json ./
COPY web ./web
RUN npm run build

# ---- 运行阶段 ----
FROM node:24-alpine
ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/app/data
WORKDIR /app
COPY package.json ./
COPY server ./server
COPY --from=build /app/web/dist ./web/dist
RUN mkdir -p /app/data && addgroup -S 1g1g && adduser -S 1g1g -G 1g1g && chown -R 1g1g:1g1g /app/data
USER 1g1g
VOLUME /app/data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "server/index.mjs"]
