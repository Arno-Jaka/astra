# syntax=docker/dockerfile:1

FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend

ARG VITE_API_PROXY_TARGET=http://localhost:8000
ARG VITE_WS_PROXY_TARGET=ws://localhost:8000
ARG VITE_TREK_TILE_BASE_URL=https://trek.nasa.gov/tiles/Mars/EQ
ARG VITE_TREK_IMAGERY_BASE_URL=https://trek.nasa.gov/mars/
ARG VITE_NASA_JET_DRILL_URL=https://images.nasa.gov/details/PIA22587

ENV VITE_API_PROXY_TARGET=${VITE_API_PROXY_TARGET}
ENV VITE_WS_PROXY_TARGET=${VITE_WS_PROXY_TARGET}
ENV VITE_TREK_TILE_BASE_URL=${VITE_TREK_TILE_BASE_URL}
ENV VITE_TREK_IMAGERY_BASE_URL=${VITE_TREK_IMAGERY_BASE_URL}
ENV VITE_NASA_JET_DRILL_URL=${VITE_NASA_JET_DRILL_URL}

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

FROM python:3.11-slim AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=10000

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends nginx gettext-base ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

COPY backend ./backend
COPY --from=frontend-build /app/frontend/dist ./frontend/dist
COPY docker/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 10000

CMD ["/entrypoint.sh"]
