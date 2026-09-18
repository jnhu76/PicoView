"""Live Dynamic R1 resize smoke on native Windows (100% host).

Launches PicoView, resizes the client area via SetWindowPos, and captures
env_logger output that records Dynamic presentation geometry.
"""
from __future__ import annotations

import ctypes
import os
import subprocess
import sys
import time
from ctypes import wintypes

user32 = ctypes.windll.user32
kernel32 = ctypes.windll.kernel32

GWL_STYLE = -16
WS_OVERLAPPEDWINDOW = 0x00CF0000
WS_THICKFRAME = 0x00040000
WS_CAPTION = 0x00C00000
SWP_NOMOVE = 0x0002
SWP_NOZORDER = 0x0004
SWP_NOACTIVATE = 0x0010
SWP_SHOWWINDOW = 0x0040

user32.FindWindowW.argtypes = [wintypes.LPCWSTR, wintypes.LPCWSTR]
user32.FindWindowW.restype = wintypes.HWND
user32.GetClientRect.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.RECT)]
user32.GetClientRect.restype = wintypes.BOOL
user32.GetWindowRect.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.RECT)]
user32.GetWindowRect.restype = wintypes.BOOL
user32.GetWindowLongW.argtypes = [wintypes.HWND, ctypes.c_int]
user32.GetWindowLongW.restype = ctypes.c_long
user32.SetWindowPos.argtypes = [
    wintypes.HWND,
    wintypes.HWND,
    ctypes.c_int,
    ctypes.c_int,
    ctypes.c_int,
    ctypes.c_int,
    ctypes.c_uint,
]
user32.SetWindowPos.restype = wintypes.BOOL
user32.IsWindow.argtypes = [wintypes.HWND]
user32.IsWindow.restype = wintypes.BOOL


def find_window(title: str, timeout_s: float = 20.0) -> int:
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        hwnd = user32.FindWindowW(None, title)
        if hwnd:
            return hwnd
        time.sleep(0.2)
    raise RuntimeError(f"window not found: {title}")


def client_size(hwnd: int) -> tuple[int, int]:
    rc = wintypes.RECT()
    if not user32.GetClientRect(hwnd, ctypes.byref(rc)):
        raise RuntimeError("GetClientRect failed")
    return rc.right - rc.left, rc.bottom - rc.top


def set_client_size(hwnd: int, width: int, height: int) -> None:
    wr = wintypes.RECT()
    if not user32.GetWindowRect(hwnd, ctypes.byref(wr)):
        raise RuntimeError("GetWindowRect failed")
    cw, ch = client_size(hwnd)
    dw = (wr.right - wr.left) - cw
    dh = (wr.bottom - wr.top) - ch
    ok = user32.SetWindowPos(
        hwnd,
        0,
        0,
        0,
        width + dw,
        height + dh,
        SWP_NOMOVE | SWP_NOZORDER | SWP_NOACTIVATE,
    )
    if not ok:
        raise RuntimeError("SetWindowPos failed")


def wait_client_near(
    hwnd: int,
    expect_w: int,
    expect_h: int,
    timeout_s: float = 8.0,
    tol: int = 2,
) -> tuple[int, int]:
    deadline = time.time() + timeout_s
    last = (0, 0)
    while time.time() < deadline:
        last = client_size(hwnd)
        if abs(last[0] - expect_w) <= tol and abs(last[1] - expect_h) <= tol:
            return last
        time.sleep(0.15)
    raise RuntimeError(f"client size not near {expect_w}x{expect_h}, last={last}")


def main() -> int:
    # script lives at <worktree>/experiments/<campaign>/live_resize_smoke.py
    root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    exe = os.path.join(root, "native", "target", "release", "picoview.exe")
    if not os.path.isfile(exe):
        print(f"missing exe: {exe}", file=sys.stderr)
        return 2
    log_path = os.path.join(
        os.path.dirname(__file__), "r1-dynamic-resize-live-100pct.log"
    )
    env = os.environ.copy()
    env["RUST_LOG"] = "info"
    print(f"launch {exe}")
    print(f"log {log_path}")
    with open(log_path, "w", encoding="utf-8", errors="replace") as logf:
        proc = subprocess.Popen(
            [exe, "--title", "PicoView"],
            stdout=logf,
            stderr=subprocess.STDOUT,
            env=env,
            cwd=root,
        )
        try:
            hwnd = find_window("PicoView", 25.0)
            print(f"hwnd={hwnd}")
            time.sleep(2.0)
            # Boot state (default logical 960x640 requested; Dynamic derives live).
            boot = client_size(hwnd)
            print(f"boot client={boot[0]}x{boot[1]}")
            # A: resize to clearly different logical size @100% → 1200x800.
            set_client_size(hwnd, 1200, 800)
            got = wait_client_near(hwnd, 1200, 800)
            print(f"resize-A client={got[0]}x{got[1]}")
            time.sleep(1.5)
            # B: shrink to ~600x400.
            set_client_size(hwnd, 600, 400)
            got = wait_client_near(hwnd, 600, 400)
            print(f"resize-B client={got[0]}x{got[1]}")
            time.sleep(1.5)
        finally:
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()
                proc.wait(timeout=5)
    print(f"wrote {log_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
