#!/usr/bin/env python3
"""CROSS-OS-NORMALIZED-DESKTOP-STARTUP-1 — thread-lane DAG reconciliation.

Usage: python3 dag_reconcile.py < run.log
Reads ONE sample's NORMTRACE lines from STDIN (no path arguments), prints
the per-lane marker timeline, the critical-path decomposition, and the
reconciliation against E190 - E00. Pure analysis; no side effects.
"""
import re
import sys

LINE = re.compile(r"^NORMTRACE,run=([^,]*),thread=([^,]*),event=([^,]*),us=(\d+)$")

LANES = {
    "main": "MAIN/EVENT-LOOP",
    "pocket-gpu-instance": "GPU-INSTANCE",
    "pocket-runtime": "RUNTIME/QUICKJS",
}

# Serial critical-path segments for arm C (one thread waits on another).
SEGMENTS = [
    ("entry+eventloop+window (E00->E21)", "E00_MAIN_ENTRY", "E21_WINDOW_CREATE_END"),
    ("gpu-instance wait (E21->E40)", "E21_WINDOW_CREATE_END", "E40_SURFACE_CREATE_BEGIN"),
    ("gpu setup on main (E40->E73)", "E40_SURFACE_CREATE_BEGIN", "E73_SURFACE_CONFIG_END"),
    ("first-output wait (E73->E122)", "E73_SURFACE_CONFIG_END", "E122_WAKE_RECEIVED"),
    ("redraw+present (E122->E190)", "E122_WAKE_RECEIVED", "E190_FIRST_USABLE_PRESENT_SUBMITTED"),
]


def main():
    events = {}
    threads = {}
    label = sys.argv[1] if len(sys.argv) > 1 else "stdin"
    for line in sys.stdin:
        m = LINE.match(line.strip())
        if m:
            _r, thread, event, us = m.groups()
            events[event] = int(us)
            threads[event] = thread

    origin = events["E00_MAIN_ENTRY"]
    print(f"=== LANES (us from E00) — {label} ===")
    for thread in ("main", "pocket-gpu-instance", "pocket-runtime"):
        lane = [(us - origin, ev) for ev, us in events.items() if threads[ev] == thread]
        lane.sort()
        print(f"[{LANES[thread]}]")
        for dt, ev in lane:
            print(f"  {dt:>8} {ev}")

    print("=== CRITICAL-PATH RECONCILIATION ===")
    total = 0
    for name, b, e in SEGMENTS:
        if b not in events or e not in events:
            print(f"  {name}: MISSING ({b} or {e})")
            continue
        seg = events[e] - events[b]
        total += seg
        print(f"  {name}: {seg} us")
    end_to_end = events["E190_FIRST_USABLE_PRESENT_SUBMITTED"] - origin
    print(f"  serial critical-path sum: {total} us")
    print(f"  E190 - E00 (measured):    {end_to_end} us")
    print(f"  residual (overlap/noise): {end_to_end - total} us")


if __name__ == "__main__":
    main()
