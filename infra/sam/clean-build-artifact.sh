#!/usr/bin/env bash
set -euo pipefail

TARGET="${1:-.aws-sam/build/ApiFunction}"

if [[ ! -d "$TARGET" ]]; then
  echo "Missing SAM build output: $TARGET" >&2
  exit 1
fi

rm -rf \
  "$TARGET/src" \
  "$TARGET/dist" \
  "$TARGET/docs" \
  "$TARGET/scripts" \
  "$TARGET/infra" \
  "$TARGET/index.html" \
  "$TARGET/vite.config.js" \
  "$TARGET/DEPLOY.md" \
  "$TARGET/README.md"

rm -rf \
  "$TARGET/node_modules/@vitejs" \
  "$TARGET/node_modules/vite" \
  "$TARGET/node_modules/react" \
  "$TARGET/node_modules/react-dom" \
  "$TARGET/node_modules/react-leaflet" \
  "$TARGET/node_modules/leaflet" \
  "$TARGET/node_modules/sharp" \
  "$TARGET/node_modules/@sentry/react" \
  "$TARGET/node_modules/concurrently" \
  "$TARGET/node_modules/@esbuild" \
  "$TARGET/node_modules/esbuild" \
  "$TARGET/node_modules/sqlite3" \
  "$TARGET/node_modules/sqlite" \
  "$TARGET/node_modules/date-fns" \
  "$TARGET/node_modules/rxjs" \
  "$TARGET/node_modules/lodash" \
  "$TARGET/node_modules/@sentry" \
  "$TARGET/node_modules/@sentry-internal" \
  "$TARGET/node_modules/@opentelemetry" \
  "$TARGET/node_modules/@prisma" \
  "$TARGET/node_modules/@fastify" \
  "$TARGET/node_modules/node-gyp" \
  "$TARGET/node_modules/tar"

rm -rf "$TARGET/node_modules/.bin"

du -sh "$TARGET"
(cd "$TARGET" && zip -qr /tmp/lambda-size-check.zip .)
echo -n "zip bytes: "
wc -c < /tmp/lambda-size-check.zip
