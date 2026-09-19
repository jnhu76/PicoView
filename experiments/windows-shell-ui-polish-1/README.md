# Windows Shell + UI Polish 1 — Windows smoke

Date: 2026-09-18 (native Windows)
Binary: `native/target/release/picoview.exe`
Guest: `dist/picoview.js` + `dist/picoview.pak`
POCKETJS.lock: `24bab5e8df7d0bb7003ad55c8637e4ee9351f3cb`
Base: `bbda8db50a99d8c35380e8831670219b75f5e962`

## Media

Reuse the A/B/C(corrupt)/D smoke images of `../real-viewer-closeout-1/` — all
four were removed from the tree for the owner's privacy
[capture removed from current tree for owner privacy].

## Sequence

1. Launch the A good image (startup open) [capture removed from current tree
   for owner privacy]
2. Right / Right / Right → D via B, C(corrupt)
3. Left / Left → B
4. F5 refresh, R refresh
5. + / - / 0 / 1
6. Close; reopen with path containing a space
7. `--register-associations` / `--unregister-associations`
