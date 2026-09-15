"""Cold-launch screenshot harness for the V1 AMD-Vulkan first-frame probe.

Launches picoview.exe (via ShellExecuteW, argument list only), waits for the
window with the given title, captures it via Win32 PrintWindow
(PW_RENDERFULLCONTENT), reports frame statistics so a first-frame white
window is measurable rather than impressionistic, then closes the window
with WM_CLOSE.

Usage:
  python launch_capture.py --exe PATH [--image PATH] [--wait-ms 1500]
      [--title "PicoView probe"] [--out shot.png]

Exit code 0 on capture success; prints one JSON line with stats.
"""

import argparse
import ctypes
import ctypes.wintypes as wt
import json
import sys
import time

user32 = ctypes.windll.user32
gdi32 = ctypes.windll.gdi32

SW_SHOWNORMAL = 1
PW_RENDERFULLCONTENT = 0x00000002
WM_CLOSE = 0x0010


def wait_for_window(title: str, extra_ms: float):
    """Poll for a top-level visible window whose title starts with `title`.

    A freshly created window can briefly report a zero extent while it is
    still booting; only a sized, visible window counts as ready.
    """
    import ctypes.wintypes as wt

    deadline = time.perf_counter() + 20.0
    while time.perf_counter() < deadline:
        hwnd = user32.FindWindowW(None, title)
        if hwnd and user32.IsWindowVisible(hwnd):
            rect = wt.RECT()
            if user32.GetWindowRect(hwnd, ctypes.byref(rect)):
                if rect.right - rect.left > 0 and rect.bottom - rect.top > 0:
                    time.sleep(extra_ms / 1000.0)
                    return hwnd
        time.sleep(0.05)
    return None


def capture(hwnd: int, out_path: str):
    """PrintWindow the window into a PNG; return stats."""
    from PIL import Image

    class BITMAPINFOHEADER(ctypes.Structure):
        _fields_ = [
            ("biSize", ctypes.c_uint32),
            ("biWidth", ctypes.c_int32),
            ("biHeight", ctypes.c_int32),
            ("biPlanes", ctypes.c_uint16),
            ("biBitCount", ctypes.c_uint16),
            ("biCompression", ctypes.c_uint32),
            ("biSizeImage", ctypes.c_uint32),
            ("biXPelsPerMeter", ctypes.c_int32),
            ("biYPelsPerMeter", ctypes.c_int32),
            ("biClrUsed", ctypes.c_uint32),
            ("biClrImportant", ctypes.c_uint32),
        ]

    rect = wt.RECT()
    user32.GetWindowRect(hwnd, ctypes.byref(rect))
    w, h = rect.right - rect.left, rect.bottom - rect.top
    if w <= 0 or h <= 0:
        raise RuntimeError("window has no extent")

    hdc_window = user32.GetWindowDC(hwnd)
    hdc_mem = gdi32.CreateCompatibleDC(hdc_window)
    bitmap = gdi32.CreateCompatibleBitmap(hdc_window, w, h)
    gdi32.SelectObject(hdc_mem, bitmap)
    if not user32.PrintWindow(hwnd, hdc_mem, PW_RENDERFULLCONTENT):
        raise RuntimeError("PrintWindow failed")

    bmi = BITMAPINFOHEADER()
    bmi.biSize = ctypes.sizeof(BITMAPINFOHEADER)
    bmi.biWidth = w
    bmi.biHeight = -h
    bmi.biPlanes = 1
    bmi.biBitCount = 32
    bmi.biCompression = 0  # BI_RGB
    buf = ctypes.create_string_buffer(w * h * 4)
    gdi32.GetDIBits(hdc_mem, bitmap, 0, h, buf, ctypes.byref(bmi), 0)
    image = Image.frombuffer("RGBA", (w, h), buf.raw, "raw", "BGRA", 0, 1)
    image.save(out_path)
    small = image.convert("RGB").resize((64, 64))
    px = list(small.getdata())
    mean = tuple(round(sum(p[c] for p in px) / len(px), 1) for c in range(3))
    uniq = len(set(px))
    gdi32.DeleteObject(bitmap)
    gdi32.DeleteDC(hdc_mem)
    user32.ReleaseDC(hwnd, hdc_window)
    return w, h, mean, uniq


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--exe", required=True)
    ap.add_argument("--image")
    ap.add_argument("--wait-ms", type=int, default=1500)
    ap.add_argument("--title", default="PicoView probe")
    ap.add_argument("--out", default="shot.png")
    ap.add_argument("--cwd", default=".", help="working directory the exe runs in")
    args = ap.parse_args()

    verb = "open"
    # ShellExecuteW takes explicit, separate parameters — nothing is
    # interpreted by a shell here: verb, exe, parameter string, working dir.
    params = f'--title "{args.title}"'
    if args.image:
        params += f' "{args.image}"'
    code = ctypes.windll.shell32.ShellExecuteW(
        None, verb, args.exe, params, args.cwd, SW_SHOWNORMAL
    )
    if code <= 32:
        print(json.dumps({"error": f"ShellExecuteW failed: {code}"}))
        return 2

    hwnd = wait_for_window(args.title, args.wait_ms)
    if not hwnd:
        print(json.dumps({"error": "window never appeared"}))
        return 3

    try:
        w, h, mean, uniq = capture(hwnd, args.out)
    except Exception as exc:  # noqa: BLE001 — the probe reports, never crashes
        print(json.dumps({"error": str(exc)}))
        user32.PostMessageW(hwnd, WM_CLOSE, 0, 0)
        return 4

    print(
        json.dumps(
            {
                "wait_ms": args.wait_ms,
                "window": [w, h],
                "mean_rgb": list(mean),
                "unique_64x64": uniq,
                "out": args.out,
            }
        )
    )
    time.sleep(0.2)
    user32.PostMessageW(hwnd, WM_CLOSE, 0, 0)
    return 0


if __name__ == "__main__":
    sys.exit(main())
