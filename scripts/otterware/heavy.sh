#!/usr/bin/env bash
# Runs one heavy command (typecheck, test, build) in one of a few machine-wide slots, so
# parallel agents share RAM without one long run blocking everyone. Hold a slot for one
# command only: `scripts/otterware/heavy.sh vp run --filter <pkg> typecheck`.
set -uo pipefail
slots=${OTTERWARE_HEAVY_SLOTS:-2}
while :; do
  for i in $(seq 1 "$slots"); do
    exec {fd}>"/tmp/otterware-heavy.$i.lock"
    if flock -n "$fd"; then
      "$@"
      exit $?
    fi
    exec {fd}>&-
  done
  sleep 2
done
