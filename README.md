# Abyssal Vessel

A deep-sea survivor-like (Vampire Survivors / Magic Survival genre) built for mobile/touch. Pilot a modular abyssal vessel through five depth zones, auto-fire weapons, collect XP, level up, fuse weapons into evolutions. Descend through escalating **stages**, each harder than the last.

**Current version:** v4.0  
**Format:** Single self-contained HTML file — no build step, no dependencies. Open `index.html` in a browser and it runs.

## Features

- **Stages** — pick a descent from the title screen; survive a stage's clear time to unlock the next. The final stage is endless.
- **Options menu** — screen shake, damage numbers, reduced motion, beam intensity, and starting weapon.
- **Persistence** — unlocked stages, per-stage bests and options persist via `localStorage` (e.g. on GitHub Pages); falls back to in-memory where storage isn't available.
- **Data-driven content** — weapons, evolutions, artifacts, passives, enemies and stages are plain tables; adding content is "append an entry" (see the ADDING CONTENT guide in `index.html` and the handoff doc).

## Play

Open `index.html` locally, or via GitHub Pages once enabled.

## Dev docs

All architecture, systems, dev workflow, known issues, and roadmap are in [`ABYSSAL_VESSEL_HANDOFF.md`](ABYSSAL_VESSEL_HANDOFF.md). Read that before touching any code.

## Quick dev cycle

```bash
# Full gate: extract -> node --check -> headless smoke test
bash test/check.sh
```

See [`test/README.md`](test/README.md) for what the harness covers. Never ship a change without `bash test/check.sh` passing.
