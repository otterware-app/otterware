#!/usr/bin/env bash
# Runs one heavy command (typecheck, test, build) in one of a few machine-wide slots, so
# parallel agents share RAM. It never blocks an agent for long: if no slot frees up within
# OTTERWARE_HEAVY_WAIT seconds it gives up (exit 75: skip the local check and let CI run it),
# and a command that holds a slot longer than OTTERWARE_HEAVY_TIMEOUT seconds is stopped.
# Usage: `scripts/otterware/heavy.sh vp run --filter <pkg> typecheck` (one command per call).
set -uo pipefail
slots=${OTTERWARE_HEAVY_SLOTS:-2}
wait_limit=${OTTERWARE_HEAVY_WAIT:-90}
run_limit=${OTTERWARE_HEAVY_TIMEOUT:-600}
deadline=$((SECONDS + wait_limit))
while :; do
  for i in $(seq 1 "$slots"); do
    exec {fd}>"/tmp/otterware-heavy.$i.lock"
    if flock -n "$fd"; then
      timeout --kill-after=10 "$run_limit" "$@"
      status=$?
      [ "$status" -eq 124 ] && echo "heavy.sh: stopped after ${run_limit}s; leave this check to CI" >&2
      exit "$status"
    fi
    exec {fd}>&-
  done
  if [ "$SECONDS" -ge "$deadline" ]; then
    echo "heavy.sh: all $slots slots busy for ${wait_limit}s; skipped. Push and let CI run it." >&2
    exit 75
  fi
  sleep 2
done
