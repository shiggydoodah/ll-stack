#!/bin/sh
set -e
node_modules/.bin/prisma migrate deploy --schema prisma/schema.prisma
exec node dist/main.js
