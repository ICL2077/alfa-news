#!/bin/sh
set -e

echo "Running prisma generate..."
pnpm exec prisma generate

echo "Running prisma migrate deploy..."
pnpm exec prisma migrate deploy

echo "Starting application..."
exec "$@"