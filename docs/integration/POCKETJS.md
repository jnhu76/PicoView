# PocketJS Integration Contract

Status: **CURRENT INTEGRATION AUTHORITY (human-facing)**  
Machine provenance: [`POCKETJS.lock`](../../POCKETJS.lock)  
Architecture cross-repo rule: [`docs/ARCHITECTURE.md`](../ARCHITECTURE.md) §21

This document explains how PicoView consumes PocketJS. It does not replace Product/Architecture authority and does not duplicate PocketJS’s own architecture docs.

---

## Ownership

| Concern | Owner |
| --- | --- |
| Generic GUI / runtime / rendering mechanisms | **PocketJS** |
| PresentationGeometry, RenderSignature, BlitSet / BlitFilter, UiRenderer, texture/resource substrate | **PocketJS** |
| Product host, CurrentItem, Windows shell, file dialog, associations, BrowseSession | **PicoView** |
| Product minimum client size, embedded guest, product/platform workarounds | **PicoView** |

Rule of thumb: **generic mechanism → PocketJS; product semantics → PicoView.** PicoView-specific adapter/glue may remain on the PicoView side. Do not hide a PicoView-only fork of generic PocketJS capability.

---

## Source location

```text
third_party/pocketjs
```

PicoView builds against this in-tree snapshot. Cargo PocketJS crates are **path dependencies** into that directory.

---

## Upstream

```text
jnhu76/pocketjs
```

Generic runtime/graphics capability is developed and reviewed in PocketJS first.

---

## Integration branch

```text
integration/picoview-desktop
```

PicoView-specific dependency advancement freezes reviewed commits on this branch — not on `jnhu76/pocketjs` main and not on `pocket-stack/pocketjs` main.

---

## Current provenance

Recorded in `POCKETJS.lock`:

```text
revision = 24638737473cc7cd85202ba15adba511b79d9980
branch_hint = integration/picoview-desktop
source_path = third_party/pocketjs
integration_method = git-subtree-squash
```

`POCKETJS.lock` `revision` is the exact upstream provenance authority for the imported snapshot. Do not advance it except through the update flow below.

---

## Why subtree

- A normal `git clone` of PicoView already contains the required PocketJS source
- No submodule initialization
- No build-time download of PocketJS
- PicoView remains buildable against in-tree source
- Reviewable integration history via deliberate `git subtree pull` commits + lock updates

This is **not** a git submodule and **not** a remote Cargo git dependency.

---

## Update flow

A normal PicoView clone contains `third_party/pocketjs` source but **does not**
define a git remote named `pocketjs`. Remote bootstrap is part of the update
flow, not an optional precondition.

### 0. Bootstrap / verify the `pocketjs` remote

```bash
git remote get-url pocketjs
```

- **Remote missing** (fresh clone, or never configured):

  ```bash
  git remote add pocketjs git@github.com:jnhu76/pocketjs.git
  ```

  Equivalent HTTPS URL `https://github.com/jnhu76/pocketjs.git` is acceptable
  only if that is the clone’s deliberate auth path; identity must still be
  `jnhu76/pocketjs`.

- **Remote exists, URL wrong** (not `jnhu76/pocketjs`): **STOP.** Do not
  silently re-point another remote. Repair identity before continuing.

### 1–7. Reviewed import

1. Develop and review the generic PocketJS change upstream (`jnhu76/pocketjs`).
2. Integrate the reviewed commit onto `integration/picoview-desktop`.
3. Fetch and verify the exact integration SHA (human review of the tip):

   ```bash
   git fetch pocketjs integration/picoview-desktop
   git rev-parse pocketjs/integration/picoview-desktop
   ```

4. Import into PicoView:

   ```bash
   git subtree pull --prefix=third_party/pocketjs pocketjs integration/picoview-desktop --squash
   ```

5. Update `POCKETJS.lock` `revision` to that exact SHA.
6. Verify tree/provenance (lock matches imported tip; path deps still resolve).
7. Run PicoView tests (and PocketJS tests under `third_party/pocketjs` when relevant).

Open a focused PicoView PR for the subtree + lock change. Do not mix unrelated product semantics into that PR.

The update flow alone may require a `pocketjs` remote. Day-to-day **builds**
never do: path dependencies resolve from `third_party/pocketjs` in-tree.

---

## Hard rules

- No manual `cp`/`rsync` source updates into or out of `third_party/pocketjs`
- No hidden PicoView-only generic PocketJS fork
- No direct Cargo git dependency for these PocketJS crates
- No git submodule for PocketJS
- All PocketJS crates resolve from `third_party/pocketjs` paths
- `POCKETJS.lock` `revision` changes only when a deliberate subtree import lands
- Historical campaign PocketJS pins are research/history only and never silently replace the snapshot

Product-specific Product/Image policy stays in PicoView. A module boundary, legacy uniformity, or another device backend’s representation is not a reason to bypass this contract.
