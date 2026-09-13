#!/usr/bin/env bash
# Harness for scratch CONTROL A/B binaries (Phase 13).
# Same timing contract as pv-run-samples.sh but no host app args:
#   pv-run-control.sh BIN N TAG OUTDIR
set -u
BIN="$1"; N="$2"; TAG="$3"; OUTDIR="$4"
export XDG_RUNTIME_DIR=/run/user/1000
export WAYLAND_DISPLAY=wayland-0
export DISPLAY=:0
XAUTH=$(ls /run/user/1000/xauth_* 2>/dev/null | head -1)
export XAUTHORITY=${XAUTH:-}
mkdir -p "$OUTDIR/samples-$TAG"
CSV="$OUTDIR/run-$TAG.csv"
echo "sample,t0_ns,ready_epoch_ms,ready_minus_t0_ms,exit_code" > "$CSV"
for i in $(seq 1 "$N"); do
  O="$OUTDIR/samples-$TAG/$i.out"; E="$OUTDIR/samples-$TAG/$i.err"
  T0=$(date +%s%N)
  "$BIN" > "$O" 2> "$E" &
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
