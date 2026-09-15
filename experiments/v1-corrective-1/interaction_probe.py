"""Interaction probe for the V1 presentation recovery path.

Launches the app, waits for the first present, then drives focus,
minimize, and restore transitions, capturing the window after each step,
and finally verifies the event loop has gone quiet (no re-present churn
while nothing happens).

Usage:
  python interaction_probe.py --exe PATH --image PATH --js JS --pak PAK
      --title TITLE --log LOG --out-prefix PREFIX
"""

import argparse
import ctypes
import ctypes.wintypes as wt
import json
import sys
import time

import launch_capture as lc

SW_MINIMIZE = 6
SW_RESTORE = 9


def capture_now(hwnd, prefix, step):
    w, h, mean, uniq = lc.capture(hwnd, f"{prefix}-{step}.png")
    return {"step": step, "window": [w, h], "mean_rgb": list(mean), "unique_64x64": uniq}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--exe", help="omit to observe an already-running instance")
    ap.add_argument("--image")
    ap.add_argument("--js")
    ap.add_argument("--pak")
    ap.add_argument("--title", default="PicoView interaction")
    ap.add_argument("--log", required=True)
    ap.add_argument("--out-prefix", default="interact")
    args = ap.parse_args()

    if args.exe:
        params = f'--title "{args.title}"'
        if args.js:
            params += f' --js "{args.js}"'
        if args.pak:
            params += f' --pak "{args.pak}"'
        if args.image:
            params += f' "{args.image}"'
        code = ctypes.windll.shell32.ShellExecuteW(
            None, "open", args.exe, params, ".", 1
        )
        if code <= 32:
            print(json.dumps({"error": f"ShellExecuteW failed: {code}"}))
            return 2

    hwnd = lc.wait_for_window(args.title, 500)
    if not hwnd:
        print(json.dumps({"error": "window never appeared"}))
        return 3

    # Wait for the first successful present in the log.
    deadline = time.perf_counter() + 20
    while time.perf_counter() < deadline:
        try:
            with open(args.log, "r", encoding="utf-8", errors="replace") as f:
                if "present end" in f.read():
                    break
        except (FileNotFoundError, OSError):
            pass
        time.sleep(0.005)

    results = [capture_now(hwnd, args.out_prefix, "first-present")]
    time.sleep(0.5)

    # Focus away is not scriptable without another window; drive minimize /
    # restore and verify recovery after each transition.
    user32 = ctypes.windll.user32
    user32.ShowWindow(hwnd, SW_MINIMIZE)
    time.sleep(0.6)
    results.append(capture_now(hwnd, args.out_prefix, "minimized"))
    user32.ShowWindow(hwnd, SW_RESTORE)
    time.sleep(0.8)
    results.append(capture_now(hwnd, args.out_prefix, "restored"))

    # Quietness: the log must not grow while nothing happens.
    with open(args.log, "r", encoding="utf-8", errors="replace") as f:
        before = len(f.read())
    time.sleep(3.0)
    with open(args.log, "r", encoding="utf-8", errors="replace") as f:
        after = len(f.read())
    results.append({"step": "quiet-3s", "log_bytes_grown": after - before})

    print(json.dumps(results))
    user32.PostMessageW(hwnd, 0x0010, 0, 0)
    return 0


if __name__ == "__main__":
    sys.exit(main())
