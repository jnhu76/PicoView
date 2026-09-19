# PicoView Windows branding assets — provenance

## Origin

**User-provided local artwork.** No license, README, or generator metadata
exists in the supplied source directory. No third-party icon-library
attribution is claimed.

| Committed asset | Imported from (input only — not a build dependency) |
| --- | --- |
| `picoview-app.ico` | `C:\Users\fred1\source\icons\webapp\favicon.ico` (used verbatim, byte-identical, per owner instruction 2026-09-19) |
| `picoview-app-master.png` | `C:\Users\fred1\source\icons\mac\AppIcon.appiconset\icon-512@2x.png` (largest clean transparent export of the same artwork, kept as future re-derivation master) |

`C:\Users\fred1\source\icons` is campaign input only. A clean clone builds all
release artifacts from these committed files alone.

## picoview-app.ico inventory (verified from the binary)

Genuine multi-image ICO, all entries 32-bit RGBA (bpp=32):

| Entry | Format | Bytes |
| --- | --- | --- |
| 16×16 | BMP | 1 128 |
| 32×32 | BMP | 4 264 |
| 64×64 | BMP | 16 936 |
| 256×256 | BMP | 270 376 |

Deviation from the generic 9-size recommendation (16/20/24/32/40/48/64/128/256):
the owner-supplied file is used directly without regeneration, so 24/48/128
entries are absent. Windows scales 32→24 and 64→48 from the same artwork where
those sizes are requested (titlebar/taskbar/Explorer medium icons). Small-size
acceptance (16/32/64) visually verified: recognizable blue tile + picture/eye
identity, no clipping, no halo, no excess margin
(`docs/history/windows-release-hardening-1/` evidence).

## Single icon authority

`picoview-app.ico` feeds, via the EXE resource table (resource icon group 1):

- Explorer EXE icon
- titlebar / window icon (winit registers the class with `hIcon: 0`; Windows
  falls back to the module's first icon resource)
- taskbar / Alt-Tab icon (same fallback)
- ProgID `PicoView.Image` DefaultIcon (`{exe},0` in `native/src/associations.rs`)
- installer / uninstaller display icon (Inno Setup `SetupIconFile` /
  `UninstallDisplayIcon`)
- Start Menu shortcut icon

No duplicate icon definitions are maintained.
