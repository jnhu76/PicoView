import ctypes
import subprocess
import time
from pathlib import Path

ROOT = Path(r"C:\Users\fred1\source\PicoView\.worktrees\windows-shell-ui-polish-1")
EXE = ROOT / "native" / "target" / "release" / "picoview.exe"
user32 = ctypes.windll.user32
p = subprocess.Popen([str(EXE)], cwd="C:\\")
time.sleep(3.0)


class RECT(ctypes.Structure):
    _fields_ = [
        ("left", ctypes.c_long),
        ("top", ctypes.c_long),
        ("right", ctypes.c_long),
        ("bottom", ctypes.c_long),
    ]


@ctypes.WINFUNCTYPE(ctypes.c_bool, ctypes.c_void_p, ctypes.c_void_p)
def enum(hwnd, _):
    _, ep = ctypes.c_ulong(), ctypes.c_ulong()
    user32.GetWindowThreadProcessId(hwnd, ctypes.byref(ep))
    if ep.value == p.pid:
        r = RECT()
        user32.GetWindowRect(hwnd, ctypes.byref(r))
        vis = user32.IsWindowVisible(hwnd)
        cls = ctypes.create_unicode_buffer(256)
        user32.GetClassNameW(hwnd, cls, 256)
        title = ctypes.create_unicode_buffer(256)
        user32.GetWindowTextW(hwnd, title, 256)
        print(
            f"hwnd={hwnd} vis={vis} size={r.right - r.left}x{r.bottom - r.top} "
            f"class={cls.value!r} title={title.value!r}"
        )
    return True


user32.EnumWindows(enum, 0)
p.terminate()
p.wait(timeout=3)
