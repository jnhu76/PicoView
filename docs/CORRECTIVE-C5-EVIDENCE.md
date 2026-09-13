# Corrective C5 — 16 GiB Reference-Class Rerun (Evidence: BLOCKED)

Campaign: PICOVIEW-GATE-A-READMISSION-CORRECTIVE-CAMPAIGN-2
Ticket: PICOVIEW-ARCH-C5-REFERENCE-CLASS-RERUN (#29)
Date: 2026-09-13
Verdict: **BLOCKED_REFERENCE_CLASS_HARDWARE** — no 16 GiB reference-class
host is available in this environment; the forbidden substitutes (VM,
job-object memory caps) were not used, and the alternative path (an
explicit bounded equivalence decision) requires owner approval, which an
autonomous run cannot grant itself. RAM-sensitive numbers remain
architecture-host evidence only, referred to GATE-A2 with that caveat.

## 0. Hardware verification (the blocker, formally recorded)

Measured on the campaign host this session (`Win32_OperatingSystem`,
`Win32_ComputerSystem`, `Win32_VideoController`):

| Item | PRD reference class | This host | Verdict |
| --- | --- | --- | --- |
| Total physical RAM | 16 GiB | **28.92 GiB** (5.34 GiB free at measurement) | deviates |
| GPU | hardware-accelerated desktop GPU (PRD); the ticket frames this as discrete-class | **AMD Radeon(TM) Graphics, integrated** (shared memory, `AdapterRAM` ≈ 3 GiB aperture) | deviates |

The host deviates from the reference class on **both** axes. The "discrete-
class" reading is ticket #29's (owner authority) — the PRD text says
"hardware-accelerated desktop GPU" without the word discrete. The deviation
holds either way: the iGPU is not a minor variant, because integrated GPUs
share the memory bus with the CPU, so RAM-sensitive measurements (working-
set behavior, paging under decode bursts, five-process aggregate) are
structurally different from a discrete-card host, independent of the RAM
size.

## 1. Why no rerun and no substitute was attempted

- No physical or cloud 16 GiB + discrete-GPU Windows machine is reachable
  from this campaign (single architecture host, established in ARCH-A0 and
  reused by every A-phase and corrective measurement to date).
- The mission forbids the classic substitutes: a VM sized to 16 GiB (a
  hypervisor partition is not the reference-class memory system — guest
  paging, ballooning, and iGPU passthrough semantics differ) and a Job-
  Object memory cap (caps commit; it does not create a 16 GiB working-set
  environment, and paging behavior above the cap is exactly what the class
  defines).
- The ticket's alternative — "an explicit bounded equivalence decision
  approved by the owner" — is an authority action reserved to the owner.
  An autonomous campaign cannot approve its own equivalence; per the
  brake rules this is the defined BLOCKED stop for this ticket.

## 2. What this means for GATE-A2

- Every RAM-sensitive row C2–C4 produced (settled residency, 24 MP Fit,
  stress transient, five-process aggregate, idle working set) remains
  **architecture-host evidence**: measured on the 28.92 GiB iGPU host,
  valid for substrate-admission reasoning (mechanisms, regressions,
  paired deltas — all C2/C3/C4 paired comparisons are same-host and
  therefore unaffected), but **not** a claim of 16 GiB-class compliance.
- GATE-A2 must present those rows with exactly that caveat. The architecture
  question GATE-A2 answers (is the substrate admitted on paired, same-host
  evidence?) is answerable without the reference-class rerun; the product
  compliance question it must NOT answer is not, until C5 unblocks.
- Unblocking paths, for the tracker: (a) a physical 16 GiB + discrete-GPU
  Windows host for a rerun of the A7 suite plus the RAM-sensitive A4/A5
  rows (the C5 scope as written); or (b) a written owner-approved bounded
  equivalence decision (e.g. "same-host paired deltas plus a documented
  RAM-bound argument suffice for Phase B admission").

## 3. No code or measurement changes

This corrective introduces no code, no measurement, and no document
beyond this record. The campaign continues at C6/#31 per the mission
order; GATE-A2 will carry the C5 blocker forward in its verdict.

## 4. Review trail

One fresh-context adversarial review confirmed the blocker is real (both
class axes deviate), that no forbidden substitute was used, and that
parking the ticket as BLOCKED (rather than producing an unqualified
"equivalent" number) is the only truth-preserving outcome available to an
autonomous run.
