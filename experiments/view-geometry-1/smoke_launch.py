"""Quick launch smoke for view-geometry-1."""
import subprocess
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
EXE = ROOT / "native" / "target" / "release" / "picoview.exe"
JPEG = ROOT / "test-media" / "color-fixture.jpg"


JS = ROOT / "dist" / "picoview.js"
PAK = ROOT / "dist" / "picoview.pak"


def run(label, args, cwd):
    p = subprocess.Popen(
        [str(EXE), "--js", str(JS), "--pak", str(PAK), *args],
        cwd=cwd,
    )
    time.sleep(2.5)
    alive = p.poll() is None
    print(f"{label}: alive={alive} pid={p.pid}")
    if alive:
        p.terminate()
        try:
            p.wait(timeout=3)
        except subprocess.TimeoutExpired:
            p.kill()
    return alive


ok = True
ok &= run("empty C:\\", [], "C:\\")
ok &= run("image TEMP", [str(JPEG)], tempfile.gettempdir())
print("SMOKE", "PASS" if ok else "FAIL")
raise SystemExit(0 if ok else 1)
