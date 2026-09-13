#!/bin/bash
# CROSS-OS-NORMALIZED-DESKTOP-STARTUP-1 — Linux batch runner.
# Usage: norm-run.sh <A|B|C> <N> <OUTDIR>
set -u
ARM=$1; N=$2; OUT=$3
BASE=$HOME/Source/pocketjs-norm/hosts/desktop/target/release
mkdir -p "$OUT"

# Normalized policy — identical to the Windows runner.
export NORMTRACE=1
export POCKET_GPU_BACKEND=VULKAN
export POCKET_FORCE_SCALE=1.0
export POCKETJS_DIST=$HOME/Source/pocketjs-norm-dist-linux
export WAYLAND_DISPLAY=wayland-0
export XDG_RUNTIME_DIR=/run/user/1000
export WINIT_UNIX_BACKEND=wayland

case $ARM in
  A) BIN=$BASE/examples/norm-a; ARGS=();;
  B) BIN=$BASE/examples/norm-b; ARGS=();;
  C) BIN=$BASE/pocket-desktop-host;
     ARGS=(--app picoview-a6-main --viewport 720x480 --density 1 --quit-after 30);;
  *) echo "bad arm"; exit 2;;
esac

i=0
while [ "$i" -lt "$N" ]; do
  if pgrep -x cargo >/dev/null || pgrep -x rustc >/dev/null || pgrep -x dnf >/dev/null; then
    echo "run-$i SKIPPED_BUSY_BUILD"; sleep 5; continue
  fi
  f="$OUT/run-$(printf '%03d' "$i").log"
  NORMTRACE_RUN=$i timeout 15 "$BIN" ${ARGS+"${ARGS[@]}"} 2> "$f"
  echo "WALL_EXIT_RC=$?" >> "$f"
  sleep 0.5
  i=$((i+1))
done
echo "BATCH-DONE arm=$ARM n=$N outdir=$OUT"
