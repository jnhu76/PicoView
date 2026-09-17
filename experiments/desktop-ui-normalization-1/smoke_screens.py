"""PR62 desktop UI normalization — Windows smoke screenshots (native)."""
from __future__ import annotations

import ctypes
import subprocess
import time
from ctypes import wintypes
from pathlib import Path

ROOT = Path(r"C:\Users\fred1\source\PicoView\.worktrees\ui-chrome-1")
EXE = ROOT / "native/target/release/picoview.exe"
JS = ROOT / "dist/picoview.js"
PAK = ROOT / "dist/picoview.pak"
MEDIA = ROOT / "experiments/real-viewer-closeout-1/smoke-media"
OUT = ROOT / "experiments/desktop-ui-normalization-1/screenshots"
HOLD = 2.5

user32 = ctypes.WinDLL("user32", use_last_error=True)
gdi32 = ctypes.WinDLL("gdi32", use_last_error=True)

user32.SetForegroundWindow.argtypes = [wintypes.HWND]
user32.GetForegroundWindow.restype = wintypes.HWND
user32.ShowWindow.argtypes = [wintypes.HWND, ctypes.c_int]
user32.GetWindowRect.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.RECT)]
user32.GetClientRect.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.RECT)]
user32.ClientToScreen.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.POINT)]
user32.GetDC.argtypes = [wintypes.HWND]
user32.GetDC.restype = wintypes.HDC
user32.ReleaseDC.argtypes = [wintypes.HWND, wintypes.HDC]
gdi32.CreateCompatibleDC.argtypes = [wintypes.HDC]
gdi32.CreateCompatibleDC.restype = wintypes.HDC
gdi32.CreateCompatibleBitmap.argtypes = [wintypes.HDC, ctypes.c_int, ctypes.c_int]
gdi32.CreateCompatibleBitmap.restype = wintypes.HBITMAP
gdi32.SelectObject.argtypes = [wintypes.HDC, wintypes.HGDIOBJ]
gdi32.SelectObject.restype = wintypes.HGDIOBJ
gdi32.BitBlt.argtypes = [
    wintypes.HDC, ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_int,
    wintypes.HDC, ctypes.c_int, ctypes.c_int, ctypes.c_uint,
]
gdi32.GetDIBits.argtypes = [
    wintypes.HDC, wintypes.HBITMAP, ctypes.c_uint, ctypes.c_uint,
    ctypes.c_void_p, ctypes.c_void_p, ctypes.c_uint,
]
user32.keybd_event.argtypes = [ctypes.c_ubyte, ctypes.c_ubyte, ctypes.c_uint, ctypes.c_void_p]
user32.IsWindowVisible.argtypes = [wintypes.HWND]
user32.IsWindowVisible.restype = wintypes.BOOL
user32.GetWindowThreadProcessId.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.DWORD)]
user32.EnumWindows.argtypes = [ctypes.c_void_p, wintypes.LPARAM]
user32.EnumWindows.restype = wintypes.BOOL


class BITMAPINFOHEADER(ctypes.Structure):
    _fields_ = [
        ("biSize", wintypes.DWORD),
        ("biWidth", ctypes.c_long),
        ("biHeight", ctypes.c_long),
        ("biPlanes", wintypes.WORD),
        ("biBitCount", wintypes.WORD),
        ("biCompression", wintypes.DWORD),
        ("biSizeImage", wintypes.DWORD),
        ("biXPelsPerMeter", ctypes.c_long),
        ("biYPelsPerMeter", ctypes.c_long),
        ("biClrUsed", wintypes.DWORD),
        ("biClrImportant", wintypes.DWORD),
    ]


def capture(hwnd: int, path: Path) -> None:
    rect = wintypes.RECT()
    if not user32.GetWindowRect(hwnd, ctypes.byref(rect)):
        raise RuntimeError("GetWindowRect failed")
    w = int(rect.right - rect.left)
    h = int(rect.bottom - rect.top)
    if w <= 0 or h <= 0:
        raise RuntimeError(f"bad window size {w}x{h}")
    hdc = user32.GetDC(0)
    memdc = gdi32.CreateCompatibleDC(hdc)
    bmp = gdi32.CreateCompatibleBitmap(hdc, w, h)
    old = gdi32.SelectObject(memdc, bmp)
    gdi32.BitBlt(memdc, 0, 0, w, h, hdc, int(rect.left), int(rect.top), 0x00CC0020)
    bmi = BITMAPINFOHEADER()
    bmi.biSize = ctypes.sizeof(BITMAPINFOHEADER)
    bmi.biWidth = w
    bmi.biHeight = -h
    bmi.biPlanes = 1
    bmi.biBitCount = 32
    bmi.biCompression = 0
    buf = ctypes.create_string_buffer(w * h * 4)
    bits = gdi32.GetDIBits(memdc, bmp, 0, h, buf, ctypes.byref(bmi), 0)
    gdi32.SelectObject(memdc, old)
    try:
        from PIL import Image  # type: ignore

        img = Image.frombuffer("RGBA", (w, h), buf.raw, "raw", "BGRA", 0, 1)
        img.convert("RGB").save(path)
    except Exception:
        path.write_bytes(buf.raw)
        path = path.with_suffix(".bgra")
        path.write_bytes(buf.raw)
    user32.ReleaseDC(0, hdc)
    print(f"saved {path} {w}x{h} bits={bits}")


def focus(hwnd: int) -> bool:
    user32.ShowWindow(hwnd, 9)
    time.sleep(0.25)
    user32.SetForegroundWindow(hwnd)
    time.sleep(0.35)
    return user32.GetForegroundWindow() == hwnd


def wait_hwnd(proc: subprocess.Popen, seconds: float = 8.0) -> int:
    deadline = time.time() + seconds
    while time.time() < deadline:
        proc.poll()
        hwnd = int(proc.MainWindowHandle or 0) if hasattr(proc, "MainWindowHandle") else 0
        # Popen has no MainWindowHandle; use tasklist-style poll via ctypes EnumWindows omitted —
        # PowerShell Start-Process path used below instead.
        time.sleep(0.2)
    return hwnd


def run_one(image: Path, label: str) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    log = OUT / f"{label}.log"
    args = [
        str(EXE),
        "--js", str(JS),
        "--pak", str(PAK),
        "--viewport", "960x640",
        str(image),
    ]
    print("launch", label, args)
    with open(log, "w", encoding="utf-8") as lf:
        proc = subprocess.Popen(
            args,
            stdout=lf,
            stderr=subprocess.STDOUT,
            cwd=str(ROOT / "native"),
        )
    try:
        # Find top-level window for this PID.
        pid = proc.pid
        hwnds: list[int] = []

        @ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
        def enum_proc(h, _l):
            lpdw = wintypes.DWORD()
            user32.GetWindowThreadProcessId(h, ctypes.byref(lpdw))
            if lpdw.value == pid and user32.IsWindowVisible(h):
                hwnds.append(int(h))
            return True

        user32.EnumWindows(enum_proc, 0)
        deadline = time.time() + 8
        while not hwnds and time.time() < deadline:
            time.sleep(0.25)
            hwnds.clear()
            user32.EnumWindows(enum_proc, 0)
            proc.poll()
            if proc.returncode is not None and not hwnds:
                raise RuntimeError(f"process exited {proc.returncode} before window")
        if not hwnds:
            raise RuntimeError("no visible window")
        hwnd = hwnds[0]
        print(f"pid={pid} hwnd={hwnd} focused={focus(hwnd)}")
        time.sleep(HOLD)
        capture(hwnd, OUT / f"{label}.png")
    finally:
        proc.kill()
        try:
            proc.wait(timeout=3)
        except Exception:
            pass
    print("done", label)


def main() -> None:
    for f in ("picoview.exe",):
        p = EXE if f == "picoview.exe" else ROOT / f
        if not p.exists():
            raise SystemExit(f"missing {p}")
    if not JS.exists() or not PAK.exists():
        raise SystemExit("missing guest artifacts")
    # Prefer real photo if present; else color fixture.
    candidates = [
        MEDIA / "A.jpg",
        MEDIA / "B.jpg",
        MEDIA / "D.jpg",
        ROOT / "test-media/real-screenshot.jpg",
        ROOT / "test-media/color-fixture.jpg",
    ]
    images = [p for p in candidates if p.exists()]
    if not images:
        raise SystemExit(f"no media under {MEDIA}")
    run_one(images[0], "A-image-ready")
    if len(images) > 1:
        run_one(images[1], "B-color-fixture")
    # Empty launch (no args image) — empty state.
    OUT.mkdir(parents=True, exist_ok=True)
    log = OUT / "C-empty.log"
    with open(log, "w", encoding="utf-8") as lf:
        proc = subprocess.Popen(
            [str(EXE), "--js", str(JS), "--pak", str(PAK), "--viewport", "960x640"],
            stdout=lf,
            stderr=subprocess.STDOUT,
            cwd=str(ROOT / "native"),
        )
    try:
        pid = proc.pid
        hwnds: list[int] = []

        @ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
        def enum_proc(h, _l):
            lpdw = wintypes.DWORD()
            user32.GetWindowThreadProcessId(h, ctypes.byref(lpdw))
            if lpdw.value == pid and user32.IsWindowVisible(h):
                hwnds.append(int(h))
            return True

        deadline = time.time() + 8
        while not hwnds and time.time() < deadline:
            time.sleep(0.25)
            hwnds.clear()
            user32.EnumWindows(enum_proc, 0)
        if not hwnds:
            raise RuntimeError("empty-state window missing")
        focus(hwnds[0])
        time.sleep(1.2)
        capture(hwnds[0], OUT / "C-empty.png")
    finally:
        proc.kill()
        try:
            proc.wait(timeout=3)
        except Exception:
            pass
    print("SMOKE_OK", OUT)


if __name__ == "__main__":
    main()
