#!/usr/bin/env bash
# Per-boot startup for the deau Cloud Agent environment.
# Starts the local PostgreSQL daemon and waits until it is ready. The Next.js
# dev server is launched separately as a named terminal (see environment.json).
set -euo pipefail

PG_VERSION=16
PG_CLUSTER=main

echo "==> Starting PostgreSQL ${PG_VERSION}/${PG_CLUSTER}"
if ! sudo pg_lsclusters -h 2>/dev/null | awk '{print $4}' | grep -q online; then
  sudo pg_ctlcluster "${PG_VERSION}" "${PG_CLUSTER}" start || true
fi

echo "==> Waiting for PostgreSQL to accept connections"
for _ in $(seq 1 30); do
  if pg_isready -h localhost -p 5432 >/dev/null 2>&1; then
    echo "==> PostgreSQL is ready"
    exit 0
  fi
  sleep 1
done

echo "!! PostgreSQL did not become ready in time" >&2
exit 1
