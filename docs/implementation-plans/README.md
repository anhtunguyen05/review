# Implementation plans

This folder contains execution details for the phases listed in
`docs/12_IMPLEMENTATION_ROADMAP.md`.

## Convention

- one file per roadmap phase: `phase-0.md`, `phase-1.md`, and so on;
- the roadmap remains the concise phase sequence and high-level acceptance
  criteria;
- each phase plan owns scope lock, task breakdown, dependency order, decisions,
  verification gates, and implementation evidence;
- update the relevant phase plan after implementation rather than expanding the
  roadmap with execution detail;
- keep later-phase work explicitly out of the current plan.

## Plans

- [Phase 0](phase-0.md) — repository bootstrap, completed;
- [Phase 1](phase-1.md) — PR range and OCR vertical slice, implemented locally; provider publication remains out of scope.
- [Phase 2](phase-2.md) — GitHub context resolution and idempotent summary/inline publication.
- [Phase 3](phase-3.md) — Jev screening adapter and direct-file local screening; GitHub publication, impact discovery, and adaptive OCR scope remain out of scope.
- [Phase 4](phase-4.md) — structural JS/TS impact discovery; adaptive OCR scope remains out of scope.

- [Phase 5](phase-5.md) - adaptive, budgeted OCR scope with persisted selection and exclusion reasons.
- [Phase 6](phase-6.md) - grounded intent and deterministic semantic impact discovery.
- [Phase 7](phase-7.md) - post-review verification, correlation, and duplicate consolidation.
- [Phase 8](phase-8.md) - checkpointed incremental review with safe full fallback.
