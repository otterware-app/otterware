#!/usr/bin/env bash
set -euo pipefail
# Each heavy step takes its own slot (scripts/otterware/heavy.sh); see check-changed.mjs.
exec node scripts/otterware/check-changed.mjs "$@"
