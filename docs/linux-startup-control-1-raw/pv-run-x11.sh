#!/usr/bin/env bash
# X11/XWayland variant of pv-run-samples.sh: identical timing contract, but the
# host connects through XWayland (winit x11 backend) instead of native Wayland.
#   pv-run-x11.sh BIN N TAG OUTDIR [ENV=VAL ...] [-- app-arg ...]
set -u
BIN="$1"; N="$2"; TAG="$3"; OUTDIR="$4"; shift 4
ENVV=()
while [ "$#" -gt 0 ] && [ "$1" != "--" ]; do
  ENVV+=("$1"); shift
done
[ "${1:-}" = "--" ] && shift
APPEXTRA=("$@")
export XDG_RUNTIME_DIR=/run/user/1000
unset WAYLAND_DISPLAY
export DISPLAY=:0
XAUTH=$(ls /run/user/1000/xauth_* 2>/dev/null | head -1)
export XAUTHORITY=${XAUTH:-}
export POCKETJS_DIST="$HOME/Source/pocketjs-linux-startup-control/pocketjs-control/dist"
mkdir -p "$OUTDIR/samples-$TAG"
CSV="$OUTDIR/run-$TAG.csv"
echo "sample,t0_ns,ready_epoch_ms,ready_minus_t0_ms,exit_code" > "$CSV"
for i in $(seq 1 "$N"); do
  O="$OUTDIR/samples-$TAG/$i.out"; E="$OUTDIR/samples-$TAG/$i.err"
  T0=$(date +%s%N)
  if [ "${#ENVV[@]}" -gt 0 ]; then
    env "${ENVV[@]}" "$BIN" --app picoview-a6 --quit-after 40 --announce-ready "${APPEXTRA[@]}" > "$O" 2> "$E" &
  else
    "$BIN" --app picoview-a6 --quit-after 40 --announce-ready "${APPEXTRA[@]}" > "$O" 2> "$E" &
  fi
  PID=$!
  ( sleep 20; kill -9 "$PID" 2>/dev/null ) & WD=$!
  wait "$PID"; RC=$?
  kill "$WD" 2>/dev/null; wait "$WD" 2>/dev/null
  READY=$(grep -a '^READY ' "$O" 2>/dev/null | tail -1 | awk '{print $2}')
  if [ -n "${READY:-}" ]; then
    T0_MS=$((T0 / 1000000))
    DELTA=$((READY - T0_MS))
  else
    DELTA="NA"
  fi
  echo "$i,$T0,${READY:-NA},${DELTA},${RC}" >> "$CSV"
done
echo "== batch $TAG done =="
tail -4 "$CSV"
