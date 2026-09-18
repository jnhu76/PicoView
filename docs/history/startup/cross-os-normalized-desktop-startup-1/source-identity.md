# CROSS-OS-NORMALIZED-DESKTOP-STARTUP-1 — SOURCE IDENTITY

## Product / campaign repos

| repo | remote | branch | HEAD | tree |
|---|---|---|---|---|
| PicoView | git@github.com:jnhu76/PicoView.git | main (at freeze) | 491d0a5e277345b2b400e8b7f0647a0057ea59bb | 53ba7c2f83126a96ff7ac218894e41f615c89c61 |
| PocketJS | https://github.com/pocket-stack/pocketjs | picoview-c4-present-pacing (local) | e15674db1ca9179732c22e5a9a191ba21ebf3e70 | f09cf9fa116d3fa92d64f49fec7edf1d088d059e |

- PocketJS effective identity = campaign candidate
  `a46eb7e055ef443f5efecdac1cc447a3c1941805` (C4, tree
  d12b28b7f0246c5ae1a032af55182113ec2ce86d) + measurement-only series
  `50e3ed8e` (E-series instrumentation) + `e15674db` (BENCHMARK_CONFIG →
  stderr). Tree equivalence between BOTH hosts established by git bundle
  transfer and verified by `git rev-parse HEAD^{tree}` on each side.

## Toolchains

| host | OS | toolchain |
|---|---|---|
| Linux (reference, 192.168.31.75) | Fedora 44 KDE Plasma (Wayland/kwin), kernel 7.1.9-200.fc44.x86_64 | rustc 1.98.1 (48a229cea), stable-x86_64-unknown-linux-gnu; bun 1.4.2 |
| Windows (target, local) | Windows 11 Pro build 26200 | rustc 1.98.1 (48a229cea), stable-x86_64-pc-windows-msvc (campaign baseline) |

## Guest (arm C)

- Source: PicoView `guest/main.octane.tsx` (+ app.octane.tsx, pocket.json)
  @ PicoView 491d0a5. sha256:
  - main.octane.tsx `d36eb4ecd7e9d9e65f6c40d83a3372031d878a436858bdb2d4d5c35ed887e8b9`
  - app.octane.tsx `cd3f1d3e24bd836c2b098bcbdfdf54ce26b24f7d38c0dc4dd3a4413dd610eef3`
  - pocket.json `81e139b14f4703dde5c30304da127c20529a2c12bba91c8c0fbadeb59accdc70`
  (byte-identical on both hosts)
- Artifacts built ON LINUX (bun 1.4.2, bun.lock @ e15674db) via the official
  per-target path `bun tools/pocket.ts compile --target <T> --manifest
  guest/pocket.json --project-root .`:
  - windows-app bundle (runs on Windows): js `cf73383f…` 357,862 B, pak
    `3059416e…` 304,944 B — the pak is BYTE-IDENTICAL to the historical
    Windows-built artifact (determinism cross-check).
  - linux-app bundle (runs on Linux): js `1121043d…` 357,860 B, pak
    `fc5c957a…` 78,576 B.
- The js delta = 2 bytes of embedded target id. The pak delta = per-target
  official plan glyph density (windows-app plan rasterDensity 2 → @2x baked
  glyphs; linux-app → @1x). RUNTIME raster density is pinned to 1 on BOTH
  hosts (`--density 1` + `POCKET_FORCE_SCALE=1.0`; verified per-run in
  BENCHMARK_CONFIG `raster_density: 1`).
- The pre-experiment Windows `dist/picoview-a6-main.js` (345,215 B) was
  found STALE (older dependency resolution) and RETIRED; both hosts run
  single-toolchain-state bundles.

## Host binaries

Both hosts: `cargo build --release` of `pocket-desktop-host` (+ examples
`norm-a`, `norm-b`) from the SAME tree; each binary self-identifies in
every run's BENCHMARK_CONFIG (`pocketjs_sha` = e15674db…,
`pocketjs_tree` = f09cf9fa…).
