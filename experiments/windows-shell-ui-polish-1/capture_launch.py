"""Capture the PicoView HWND for launch corrective visual evidence."""
from __future__ import annotations

import ctypes
import subprocess
import sys
import tempfile
import time
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    Image = None

ROOT = Path(__file__).resolve().parents[2]
EXE = ROOT / "native" / "target" / "release" / "picoview.exe"
JPEG = ROOT / "test-media" / "color-fixture.jpg"
OUT = Path(__file__).resolve().parent / "launch-corrective"

user32 = ctypes.windll.user32
gdi32 = ctypes.windll.gdi32

DWMWA_EXTENDED_FRAME_BOUNDS = 9


class RECT(ctypes.Structure):
    _fields_ = [
        ("left", ctypes.c_long),
        ("top", ctypes.c_long),
        ("right", ctypes.c_long),
        ("bottom", ctypes.c_long),
    ]


def find_hwnd(pid: int) -> int | None:
    found: list[tuple[int, str, int]] = []

    @ctypes.WINFUNCTYPE(ctypes.c_bool, ctypes.c_void_p, ctypes.c_void_p)
    def enum(hwnd, _lparam):
        _, ep = ctypes.c_ulong(), ctypes.c_ulong()
        user32.GetWindowThreadProcessId(hwnd, ctypes.byref(ep))
        if ep.value == pid and user32.IsWindowVisible(hwnd):
            title = ctypes.create_unicode_buffer(256)
            user32.GetWindowTextW(hwnd, title, 256)
            r = RECT()
            user32.GetWindowRect(hwnd, ctypes.byref(r))
            area = max(0, r.right - r.left) * max(0, r.bottom - r.top)
            found.append((hwnd, title.value, area))
        return True

    user32.EnumWindows(enum, 0)
    # Prefer the titled product window over winit helper / wgpu dummy HWNDs.
    titled = [t for t in found if t[1] == "PicoView" and t[2] > 10_000]
    if titled:
        return titled[0][0]
    large = [t for t in found if t[2] > 10_000]
    if large:
        return large[0][0]
    return None


def capture_hwnd(hwnd: int, path: Path) -> tuple[int, int, int]:
    r = RECT()
    dwm = ctypes.windll.dwmapi
    hr = dwm.DwmGetWindowAttribute(
        hwnd, DWMWA_EXTENDED_FRAME_BOUNDS, ctypes.byref(r), ctypes.sizeof(r)
    )
    if hr != 0:
        user32.GetWindowRect(hwnd, ctypes.byref(r))
    w = max(1, r.right - r.left)
    h = max(1, r.bottom - r.top)
    # PrintWindow often misses D3D swapchain content; BitBlt the screen region
    # after the window is foregrounded.
    hwnd_dc = user32.GetDC(0)
    mem_dc = gdi32.CreateCompatibleDC(hwnd_dc)
    bmp = gdi32.CreateCompatibleBitmap(hwnd_dc, w, h)
    gdi32.SelectObject(mem_dc, bmp)
    gdi32.BitBlt(mem_dc, 0, 0, w, h, hwnd_dc, r.left, r.top, 0x00CC0020)  # SRCCOPY

    class BITMAPINFOHEADER(ctypes.Structure):
        _fields_ = [
            ("biSize", ctypes.c_uint32),
            ("biWidth", ctypes.c_long),
            ("biHeight", ctypes.c_long),
            ("biPlanes", ctypes.c_uint16),
            ("biBitCount", ctypes.c_uint16),
            ("biCompression", ctypes.c_uint32),
            ("biSizeImage", ctypes.c_uint32),
            ("biXPelsPerMeter", ctypes.c_long),
            ("biYPelsPerMeter", ctypes.c_long),
            ("biClrUsed", ctypes.c_uint32),
            ("biClrImportant", ctypes.c_uint32),
        ]

    bmi = BITMAPINFOHEADER()
    bmi.biSize = ctypes.sizeof(BITMAPINFOHEADER)
    bmi.biWidth = w
    bmi.biHeight = -h
    bmi.biPlanes = 1
    bmi.biBitCount = 32
    bmi.biCompression = 0
    buf = ctypes.create_string_buffer(w * h * 4)
    gdi32.GetDIBits(mem_dc, bmp, 0, h, buf, ctypes.byref(bmi), 0)
    if Image is not None:
        img = Image.frombuffer("RGBA", (w, h), buf, "raw", "BGRA", 0, 1)
        img.save(path)
        samples = [
            img.getpixel((w // 2, h // 2))[:3],
            img.getpixel((w // 2, h // 3))[:3],
            img.getpixel((w // 3, h // 2))[:3],
        ]
        avg = tuple(sum(c[i] for c in samples) // len(samples) for i in range(3))
    else:
        avg = (-1, -1, -1)
    gdi32.DeleteObject(bmp)
    gdi32.DeleteDC(mem_dc)
    user32.ReleaseDC(0, hwnd_dc)
    return w, h, avg  # type: ignore[return-value]


def run(label: str, args: list[str], cwd: str) -> None:
    print(f"== {label} ==")
    p = subprocess.Popen([str(EXE), *args], cwd=cwd)
    hwnd = None
    for _ in range(40):
        time.sleep(0.15)
        hwnd = find_hwnd(p.pid)
        if hwnd:
            break
    if not hwnd:
        print("NO_VISIBLE_WINDOW pid", p.pid)
        p.terminate()
        return
    # give first present + DWM composition a beat
    time.sleep(2.0)
    user32.SetForegroundWindow(hwnd)
    user32.BringWindowToTop(hwnd)
    time.sleep(0.8)
    path = OUT / f"{label}.png"
    w, h, avg = capture_hwnd(hwnd, path)
    print(f"{label}: hwnd={hwnd} client={w}x{h} avg_rgb={avg} -> {path}")
    p.terminate()
    try:
        p.wait(timeout=3)
    except subprocess.TimeoutExpired:
        p.kill()


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    run("empty-launch", [], "C:\\")
    run("image-launch", [str(JPEG)], tempfile.gettempdir())
    return 0


if __name__ == "__main__":
    sys.exit(main())
