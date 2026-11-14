#!/bin/sh
set -e

: "${PORT:=10000}"
export PORT

# Render nginx config from template
envsubst '${PORT}' < /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf

# Start backend
uvicorn app.main:app --host 127.0.0.1 --port 8000 --app-dir /app/backend &

# Start nginx in foreground
exec nginx -g 'daemon off;'
