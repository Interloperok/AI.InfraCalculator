# Многоэтапная сборка для React приложения
FROM node:18-alpine as build

# Устанавливаем рабочую директорию
WORKDIR /app

# Копируем package.json и package-lock.json
COPY package*.json ./

# Устанавливаем зависимости
RUN npm ci

# Копируем исходный код
COPY . .

# Build-time API base URL for CRA (`process.env.REACT_APP_API_URL`)
ARG REACT_APP_API_URL=""
ENV REACT_APP_API_URL=${REACT_APP_API_URL}

# Устанавливаем NODE_ENV=production для сборки
ENV NODE_ENV=production

# Production deploy host (957 MB RAM, 2 GB swap) hits a V8 heap-limit
# OOM at ~492 MB during `react-scripts build` since 2026-05-13 — Node 18's
# default max_old_space_size (~512 MB) is no longer enough for the
# accumulated bundle. Raise the heap to 768 MB (fits with margin on the
# production host) and skip source map generation (cuts memory ~30%;
# production rarely needs source maps — rebuild locally if debugging).
ENV NODE_OPTIONS=--max-old-space-size=768
ENV GENERATE_SOURCEMAP=false

# Собираем приложение для продакшена
RUN npm run build

# Serve the static SPA AND reverse-proxy /v1/* to the backend Service.
# `nginx:alpine` runs *.conf.template files in /etc/nginx/templates/
# through envsubst at container start, so referencing ${BACKEND_URL} in
# the template is enough.
FROM nginx:alpine

COPY --from=build /app/build /usr/share/nginx/html
COPY nginx.conf.template /etc/nginx/templates/default.conf.template

# Default for local docker run; in k8s the deployment overrides this.
ENV BACKEND_URL="http://localhost:8000"

EXPOSE 80
