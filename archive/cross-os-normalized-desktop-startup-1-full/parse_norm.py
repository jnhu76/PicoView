#!/usr/bin/env python3
"""CROSS-OS-NORMALIZED-DESKTOP-STARTUP-1 shared parser (both hosts).

Usage: python3 parse_norm.py <A|B|C>
Run INSIDE a batch directory containing run-*.log files. Writes
summary.json + summary-stages.csv into the current directory (constant
file names; the arm is recorded inside the JSON body). No path arguments.

Percentile convention: linear interpolation between closest ranks
(numpy 'linear'), on MICROSECOND integers from the single monotonic origin.
"""
import glob
import json
import os
import re
import sys
from pathlib import Path

LINE = re.compile(
    r"^NORMTRACE,run=([^,]*),thread=([^,]*),event=([^,]*),us=(\d+)$"
)

# Own-duration BEGIN/END stage pairs (experiment-local vocabulary).
STAGES = [
    ("window_create", "E20_WINDOW_CREATE_BEGIN", "E21_WINDOW_CREATE_END"),
    ("gpu_instance", "E30_GPU_INSTANCE_BEGIN", "E31_GPU_INSTANCE_END"),
    ("surface_create", "E40_SURFACE_CREATE_BEGIN", "E41_SURFACE_CREATE_END"),
    ("adapter", "E50_ADAPTER_BEGIN", "E51_ADAPTER_END"),
    ("device", "E60_DEVICE_BEGIN", "E61_DEVICE_END"),
    ("surface_caps", "E70_SURFACE_CAPS_BEGIN", "E71_SURFACE_CAPS_END"),
    ("surface_config", "E72_SURFACE_CONFIG_BEGIN", "E73_SURFACE_CONFIG_END"),
    ("runtime_boot", "E80_RUNTIME_THREAD_BEGIN", "E89_RUNTIME_BOOT_DONE"),
    ("asset_read", "E81_ASSET_READ_BEGIN", "E82_ASSET_READ_END"),
    ("ui_surface", "E83_UI_SURFACE_BEGIN", "E84_UI_SURFACE_END"),
    ("quickjs", "E85_QUICKJS_BEGIN", "E86_QUICKJS_END"),
    ("guest_eval", "E87_GUEST_EVAL_BEGIN", "E88_GUEST_EVAL_END"),
    ("renderer_acquire", "E90_RENDERER_BEGIN", "E91_RENDERER_READY"),
    ("first_tick", "E100_FIRST_TICK_BEGIN", "E102_SURFACE_TICK_DONE"),
    ("render", "E110_RENDER_BEGIN", "E113_RENDER_QUEUE_SUBMIT"),
    # REVIEW-1 FIX: the once-semantics of E131 are consumed by the
    # compositor's initial (frameless) redraw callback on arm C, which can
    # precede the runtime's E130 — so E130->E131 is only a delivery duration
    # when it is POSITIVE (arms A/B). The meaningful arm-C delivery segment
    # is request -> present-path entry, which crosses the handler boundary:
    ("redraw_delivery", "E130_REQUEST_REDRAW", "E131_REDRAW_CALLBACK"),
    ("request_to_present", "E130_REQUEST_REDRAW", "E140_GET_TEXTURE_BEGIN"),
    ("surface_acquire", "E140_GET_TEXTURE_BEGIN", "E141_GET_TEXTURE_END"),
    ("blit_ensure", "E150_BLIT_BEGIN", "E151_BLIT_END"),
    ("present_encode", "E160_PRESENT_ENCODE_BEGIN", "E161_PRESENT_ENCODE_END"),
    ("present_call", "E180_PRESENT_BEGIN", "E181_PRESENT_RETURN"),
]

ENDPOINT = {
    "A": "E199_ARM_ENDPOINT",
    "B": "E190_FIRST_USABLE_PRESENT_SUBMITTED",
    "C": "E190_FIRST_USABLE_PRESENT_SUBMITTED",
}


def pct(sorted_vals, p):
    """Linear-interpolation percentile on a pre-sorted list."""
    if not sorted_vals:
        return None
    if len(sorted_vals) == 1:
        return float(sorted_vals[0])
    k = (len(sorted_vals) - 1) * p
    f = int(k)
    c = min(f + 1, len(sorted_vals) - 1)
    return float(sorted_vals[f] + (sorted_vals[c] - sorted_vals[f]) * (k - f))


def stats(us_values):
    s = sorted(us_values)
    if not s:
        return {"p50_us": None, "p95_us": None, "min_us": None,
                "max_us": None, "iqr_us": None, "n": 0}
    return {
        "p50_us": round(pct(s, 0.50)),
        "p95_us": round(pct(s, 0.95)),
        "min_us": s[0],
        "max_us": s[-1],
        "iqr_us": round(pct(s, 0.75) - pct(s, 0.25)),
        "n": len(s),
    }


def parse_log(path):
    events = {}
    thread_of = {}
    config = None
    wall = None
    text = Path(path).read_text(encoding="utf-8", errors="replace")
    for line in text.splitlines():
        line = line.strip()
        if line.startswith("BENCHMARK_CONFIG"):
            try:
                config = json.loads(line[len("BENCHMARK_CONFIG "):])
            except json.JSONDecodeError:
                config = {"raw": line}
            continue
        m = LINE.match(line)
        if m:
            _run, thread, event, us = m.groups()
            if event not in events:
                events[event] = int(us)
                thread_of[event] = thread
            continue
        if line.startswith("WALL_SPAWN_EXIT_MS=") or line.startswith(
            "WALL_EXIT_RC="
        ):
            wall = line
    return events, thread_of, config, wall


def _config_uniformity(configs):
    """True iff every run's BENCHMARK_CONFIG agrees on all normalized fields."""
    NORMALIZED_KEYS = [
        "arm", "host_abi", "pocketjs_sha", "pocketjs_tree", "app",
        "logical_viewport", "raster_density", "force_scale",
        "gpu_backend_policy", "pocket_gpu_backend_env", "power_preference",
        "present_mode", "desired_maximum_frame_latency",
        "force_fallback_adapter", "quit_after_ticks",
    ]
    drift = {}
    first = configs[sorted(configs)[0]]
    for key in NORMALIZED_KEYS:
        vals = {json.dumps(c.get(key), sort_keys=True) for c in configs.values()}
        if len(vals) > 1:
            drift[key] = sorted(vals)
    gpu_variants = set()
    for c in configs.values():
        gpu = c.get("gpu")
        if isinstance(gpu, dict):
            gpu_variants.add(
                json.dumps(
                    {k: gpu.get(k) for k in
                     ("adapter_backend", "present_mode",
                      "desired_maximum_frame_latency", "alpha_mode",
                      "surface_format")},
                    sort_keys=True,
                )
            )
        else:
            gpu_variants.add(json.dumps(gpu))
    return {"uniform": not drift and len(gpu_variants) == 1,
            "drift": drift,
            "gpu_policy_variants": len(gpu_variants)}


def main():
    if len(sys.argv) != 2 or sys.argv[1] not in ENDPOINT:
        raise SystemExit("usage: parse_norm.py <A|B|C>")
    arm = sys.argv[1]
    endpoint = ENDPOINT[arm]
    workdir = Path(os.getcwd())

    runs = {}
    invalid = []
    configs = {}
    for path in sorted(workdir.glob("run-*.log")):
        rid_match = re.search(r"run-(\d+)\.log$", path.name)
        if not rid_match:
            continue
        run_id = rid_match.group(1)
        events, thread_of, config, wall = parse_log(path)
        if config:
            configs[run_id] = config
        reasons = []
        if "E00_MAIN_ENTRY" not in events:
            reasons.append("no E00")
        if endpoint not in events:
            reasons.append(f"no endpoint {endpoint}")
        if reasons:
            invalid.append({"run": run_id, "reasons": reasons, "wall": wall})
            continue
        runs[run_id] = {"events": events, "thread": thread_of, "wall": wall}

    endpoints = [
        r["events"][endpoint] - r["events"]["E00_MAIN_ENTRY"]
        for r in runs.values()
    ]
    stages_out = {}
    for name, begin, end in STAGES:
        own, completion = [], []
        inverted = 0
        for r in runs.values():
            ev = r["events"]
            if begin in ev and end in ev:
                # REVIEW-1 FIX: a once-marked END consumed before its BEGIN
                # (arm-C compositor callback) is not a duration; exclude it.
                if ev[end] < ev[begin]:
                    inverted += 1
                    continue
                own.append(ev[end] - ev[begin])
                completion.append(ev[end] - ev["E00_MAIN_ENTRY"])
        stages_out[name] = {
            "own_us": stats(own),
            "completion_from_E00_us": stats(completion),
            "excluded_end_before_begin": inverted,
        }

    point_events = sorted({e for r in runs.values() for e in r["events"]})
    completion_table = {}
    for event in point_events:
        vals = [
            r["events"][event] - r["events"]["E00_MAIN_ENTRY"]
            for r in runs.values()
            if event in r["events"]
        ]
        completion_table[event] = stats(vals)

    summary = {
        "arm": arm,
        "workdir": str(workdir),
        "n_valid": len(runs),
        "n_invalid": len(invalid),
        "invalid_runs": invalid,
        "endpoint_event": endpoint,
        "endpoint_E00_us": stats(endpoints),
        "stages": stages_out,
        "event_completion_from_E00_us": completion_table,
        "benchmark_config_run0": (
            configs[sorted(configs)[0]] if configs else None
        ),
        "guest_ids": sorted(
            {c.get("guest") for c in configs.values() if c.get("guest")}
        ),
        # REVIEW-1 FIX: uniformity audit across every run's config line —
        # per-run drift (e.g. a single llvmpipe fallback) must not silently
        # enter percentiles.
        "config_uniform": len(configs) == 0 or _config_uniformity(configs),
    }
    (workdir / "summary.json").write_text(
        json.dumps(summary, indent=2, sort_keys=True), encoding="utf-8"
    )

    rows = ["stage,own_p50_us,own_p95_us,completion_p50_us,completion_p95_us,n"]
    for name in stages_out:
        st = stages_out[name]
        rows.append(
            f"{name},{st['own_us']['p50_us']},{st['own_us']['p95_us']},"
            f"{st['completion_from_E00_us']['p50_us']},"
            f"{st['completion_from_E00_us']['p95_us']},{st['own_us']['n']}"
        )
    (workdir / "summary-stages.csv").write_text(
        "\n".join(rows) + "\n", encoding="utf-8"
    )
    print(
        f"PARSED arm={arm} valid={len(runs)} invalid={len(invalid)} "
        f"-> summary.json"
    )


if __name__ == "__main__":
    main()
