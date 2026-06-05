# Abyssal Vessel

A deep-sea survivor-like (Vampire Survivors / Magic Survival genre) built for mobile/touch. Pilot a modular abyssal vessel through five depth zones, auto-fire weapons, collect XP, level up, fuse weapons into evolutions.

**Current version:** v3.2  
**Format:** Single self-contained HTML file — no build step, no dependencies. Open `index.html` in a browser and it runs.

## Play

Open `index.html` locally, or via GitHub Pages once enabled.

## Dev docs

All architecture, systems, dev workflow, known issues, and roadmap are in [`ABYSSAL_VESSEL_HANDOFF.md`](ABYSSAL_VESSEL_HANDOFF.md). Read that before touching any code.

## Quick dev cycle

```bash
# Extract and syntax-check the inline script
python3 -c "import re; h=open('index.html').read(); open('game.js','w').write(re.search(r'<script>(.*?)</script>', h, re.DOTALL).group(1))"
node --check game.js
```

Never ship without `node --check` passing.
