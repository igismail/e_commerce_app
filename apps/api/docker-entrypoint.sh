#!/bin/sh
set -eu

cd /workspace/apps/api
../../node_modules/.bin/prisma migrate deploy --schema prisma/schema.prisma
../../node_modules/.bin/prisma db seed --schema prisma/schema.prisma

exec node dist/main.js
