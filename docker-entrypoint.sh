#!/bin/sh
set -eu

if [ -n "${REPORT_STORAGE_DIR:-}" ]; then
  mkdir -p "$REPORT_STORAGE_DIR"
  chown -R node:node "$(dirname "$REPORT_STORAGE_DIR")"
fi

exec su-exec node:node node src/server.mjs
