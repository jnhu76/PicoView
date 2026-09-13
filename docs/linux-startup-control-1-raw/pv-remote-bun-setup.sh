#!/usr/bin/env bash
# LINUX-DESKTOP-STARTUP-CONTROL-1: remote tooling bootstrap (bun install).
# Runs ON the Linux control host. No credentials involved.
set -euo pipefail
if command -v bun >/dev/null 2>&1; then
  echo "bun already: $(bun --version)"
  exit 0
fi
curl -fsSL https://bun.sh/install -o /tmp/bun-install.sh
bash /tmp/bun-install.sh
echo "installed: $(~/.bun/bin/bun --version)"
