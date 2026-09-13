# LINUX-DESKTOP-STARTUP-CONTROL-1 — source identity manifest

## Transferred source identity
- PicoView (guest canonical source) repo HEAD at transfer: 7ca2989 (main, 2026-09-13);
  guest/ content last changed 2342ae5 (C3), identical between C4 merge ab86b4d and
  HEAD (`git diff --stat ab86b4d HEAD -- guest/` empty). Guest materialized from
  `git archive HEAD guest` of the PicoView checkout at C:\Users\fred1\source\PicoView.
- PocketJS campaign base (GATE/ARCH frozen baseline):
  a5a85356e172db8a32aefa983ee1259f60406f69
- PocketJS effective candidate (Windows campaign HEAD, C4 #28):
  a46eb7e055ef443f5efecdac1cc447a3c1941805 (branch picoview-c4-present-pacing)
- Patch range: a5a85356e172..a46eb7e055ef = 16 commits (linear; campaign base is the
  merge-base).
- Transfer method: `git bundle` (complete history), bundle sha256 (first 20):
  b5694356008424bfd35b; cloned to
  ~/Source/pocketjs-linux-startup-control/pocketjs-control on the Linux host;
  `git rev-parse HEAD` after clone = a46eb7e055ef443f5efecdac1cc447a3c1941805 (verified).
- Effective tree content check on Windows source machine: `git status --short` showed
  only untracked scratch (evidence/, guest/, dist/ ignored); committed tree = a46eb7e0.

## Guest build (Linux)
- Resolution: `bun tools/pocket.ts check --manifest guest/pocket.json --target linux-app`
  → "linux-app satisfies pocket.json capabilities" (truthful official CLI resolution;
  no target-id faking).
- Plan: .pocket/linux-app/plan.json — target.id=linux-app, hostAbi=4,
  rasterDensity=1, planHash sha256:41938adf3c4302f5bd1f09331686ede7bddafc175f023d6877cb3494c2fbd527.
  (Windows campaign plan was target windows-app, rasterDensity 2,
  sha256:99f70f33a3badacf8d51f2e685a1372e9a5947175ac3d347e2258f0b3f851a7a.)
- PAK: dist/picoview-a6-main.pak 78,576 bytes (4 entries) + picoview-a6-main.js
  357,826 bytes.

## Host build (Linux)
- Command: `cd hosts/desktop && cargo build --release` (profile: release, debug=false).
- Toolchain: rustc 1.98.1 (48a229cea 2026-09-01) stable-x86_64-unknown-linux-gnu,
  cargo 1.98.1 — same rustc version as the Windows campaign (1.98.1 msvc).
- Binary: hosts/desktop/target/release/pocket-desktop-host, 19,833,664 bytes,
  sha256 (first 16): dc7dd1d5f6d3880e.
- JS toolchain: bun 1.4.2 (installed for this experiment; host had none).

## Oracle instrumentation
- Scratch branch `pv-oracle-scratch` (local to the Linux clone, never pushed):
  env-gated `pv_oracle_delay(kind)` sleeps injected at 3 sites (helper + main
  thread pre-window `CRIT` + runtime thread pre-boot `GUEST`). Reverted after
  Phase 14 (`git checkout -- hosts/desktop/src/main.rs` + rebuild; final tree
  verified clean at a46eb7e0).
