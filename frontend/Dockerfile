FROM oven/bun:1.4-alpine AS builder
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . /app
RUN bun run init-baseFiles
RUN bun run build:h5:prod
RUN echo "Builder Success"

FROM nginx:1.22-alpine
# 配置 nginx
COPY --from=builder /app/dist/build/h5 /usr/share/nginx/html/h5
COPY --from=builder /app/nginx.conf /etc/nginx/nginx.conf
EXPOSE 8080
# 启动 Nginx
CMD ["nginx", "-g", "daemon off;"]
