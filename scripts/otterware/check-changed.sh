#!/usr/bin/env bash
set -euo pipefail
exec flock /tmp/otterware-heavy.lock node scripts/otterware/check-changed.mjs "$@"
