#!/usr/bin/env python3
"""Percentile stats for LINUX-DESKTOP-STARTUP-CONTROL-1 (BENCHMARK nearest-rank).

Usage:
  pv-stats.py times  <csv> [<csv> ...]     # T1->T2 distribution per CSV
  pv-stats.py stages <samples-dir>         # A7EVENT stage medians from .err files

Nearest-rank percentile: P_k = x[ceil(k/100 * n)] over ascending sort (1-based).
IQR = P75 - P25 with the same rule.
"""
import csv
import math
import re
import sys
from pathlib import Path


def nearest_rank(sorted_vals, pct):
    if not sorted_vals:
        return None
    k = max(1, math.ceil(pct / 100 * len(sorted_vals)))
    return sorted_vals[k - 1]


def times(csvs):
    print("csv,n,p50,p95,min,max,iqr,na_count")
    for path in csvs:
        vals = []
        na = 0
        with open(path, newline="") as f:
            for row in csv.DictReader(f):
                v = row.get("ready_minus_t0_ms", "NA")
                if v == "NA":
                    na += 1
                else:
                    vals.append(int(v))
        s = sorted(vals)
        p50 = nearest_rank(s, 50)
        p95 = nearest_rank(s, 95)
        p25 = nearest_rank(s, 25)
        p75 = nearest_rank(s, 75)
        iqr = (p75 - p25) if (p75 is not None and p25 is not None) else None
        print(f"{path},{len(s)},{p50},{p95},{s[0] if s else None},{s[-1] if s else None},{iqr},{na}")


def stages(samples_dir):
    per_stage = {}
    rx = re.compile(r"A7EVENT,phase,([^,]+),(\d+)ms")
    n_files = 0
    for err in sorted(Path(samples_dir).glob("*.err")):
        found = False
        for line in err.read_text(errors="replace").splitlines():
            m = rx.match(line)
            if m:
                per_stage.setdefault(m.group(1), []).append(int(m.group(2)))
                found = True
        if found:
            n_files += 1
    print(f"files={n_files}")
    print("stage,n,p50,p95,min,max")
    for stage in sorted(per_stage):
        s = sorted(per_stage[stage])
        print(f"{stage},{len(s)},{nearest_rank(s, 50)},{nearest_rank(s, 95)},{s[0]},{s[-1]}")


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)
    if sys.argv[1] == "times":
        times(sys.argv[2:])
    elif sys.argv[1] == "stages":
        stages(sys.argv[2])
    else:
        print(__doc__)
        sys.exit(1)
