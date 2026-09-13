#!/usr/bin/env bash
# Ambient machine snapshot for a measurement session (Phase 11 requirement).
set -u
echo "== ambient $(date -Is) =="
echo "uptime: $(uptime)"
echo "mem: $(free -m | awk 'NR==2{print "used_mb="$3" available_mb="$7}')"
echo "psi_mem: $(cat /proc/pressure/memory 2>/dev/null | tr '\n' ' ')"
vmstat 1 3 | tail -1 | awk '{print "vmstat: r="$1" b="$2" us="$13" sy="$14" id="$15" wa="$16}'
echo "kwin_cpu: $(ps -o %cpu= -C kwin_wayland | head -1)"
echo "wayland_compositor: $(ps -o args= -C kwin_wayland | head -1 | cut -c1-60)"
echo "loadavg: $(cat /proc/loadavg)"
