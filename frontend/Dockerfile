FROM node:24-alpine AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
RUN npm ci --no-audit --no-fund

FROM dependencies AS development
COPY frontend frontend
EXPOSE 5173
CMD ["npm", "run", "dev", "-w", "frontend"]

FROM dependencies AS build
COPY frontend frontend
RUN npm run build -w frontend

FROM nginxinc/nginx-unprivileged:stable-alpine AS production
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/frontend/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 CMD wget -q -O /dev/null http://127.0.0.1:8080/
