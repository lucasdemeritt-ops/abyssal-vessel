# Tests

Abyssal Vessel ships as a single self-contained `index.html`. These tests let
us validate changes headlessly (no browser) before shipping.

## Run everything

```bash
bash test/check.sh
```

This does three things, and is the **golden-rule gate** — never ship a change
without it passing:

1. Extracts the inline `<script>` from `index.html` into `game.js` (gitignored).
2. `node --check game.js` — catches brace/syntax breakage (the #1 cause of past
   regressions from text edits).
3. Runs `test/smoke.mjs` — boots the game, plays ~10 minutes of game time,
   forces level-ups and picks upgrades, then kills the player.

## What the smoke test asserts

- The title → play → level-up → game-over flow works.
- **No runtime errors** are surfaced (it hooks `window.__showErr`, the same
  channel the on-device error banner uses).
- **Every entity array stays under its hard `CAPS` limit.**
- The **canvas sanitizer holds**: `test/mock-env.mjs` mocks a 2D context that
  *throws* on the exact inputs a real browser rejects (negative/non-finite
  radii, out-of-range `globalAlpha`). If a bad value reaches it, the game's
  sanitizing Proxy has regressed.

## How it works

`test/mock-env.mjs` builds a fake DOM + canvas + a virtual clock (`performance`,
`requestAnimationFrame`, `setTimeout`), evaluates the extracted script in a
`vm` sandbox, and drives frames manually.

The game cooperates via a **test seam**: when `window.__avExpose` is set
*before* the script runs, it publishes read references to core state and the
content registries on `window.__av` (`G`, `CAPS`, `WEAPONS`, `STAGES`, …). In
the shipped game `__avExpose` is never set, so the seam is a no-op.

## Adding tests

Import `createEnv`/`extractScript` from `mock-env.mjs`, then drive the game via
`env.frame(dtMs)`, fire UI events with `env.fireOn(id, 'click')`, and assert
against `env.av` (the `__av` seam).

## Visual smoke (screenshots)

`test/shoot.mjs` renders the *real* game in headless Chromium (via Playwright)
at phone size and captures the title, stage selector, options, gameplay,
level-up and stage-clear screens into `test/shots/` (gitignored).

```bash
node test/shoot.mjs
```

It resolves Playwright from a global install if it isn't a local dependency,
and needs the Chromium browser (`npx playwright install chromium`). Optional —
not part of `check.sh`. Handy for eyeballing UI changes without a device.

