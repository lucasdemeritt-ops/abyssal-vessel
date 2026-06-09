# Sprite assets — art spec

Drop-in art for the sprite layer (see the `SPRITES` registry in `index.html`).
The game renders procedurally by default; any entity with a `sprite:'<id>'`
draws from the matching PNG here, and **falls back to its vector drawing** if
the file is missing or fails to load. So you can add/replace art one file at a
time with zero risk.

## File format
- **PNG, transparent background.**
- **Animation = a horizontal strip:** frame 0 leftmost, frame N at `x = N * fw`.
  All frames the same `fw × fh`. A static sprite is just a 1-frame strip.
- **Pixel grid:** author on one consistent base. Recommended **24×24** for
  small creatures, **28×28** for mid, **32×32** for large/bosses. Keep a few
  px of padding inside the cell so glow/rotation don't clip.

## Conventions
- **Facing:** sprites that rotate to movement (`rotate:true`) must be drawn
  **nose pointing right (+x)**; angle 0 = facing right. Upright sprites use
  `rotate:false`.
- **Glow:** you can **bake the glow into the PNG** (preferred — lets us drop
  runtime `shadowBlur`, a net perf win) or leave it flat and we keep a
  procedural glow underneath. Tell me which per sprite.
- **Color:** match the existing palette where it helps cohesion — Glassfin
  cyan `#5be7ff`, Carapace orange `#ff9560`, vessel hull `#2a4a6a` / trim
  `#a8e3ff` / viewport `#f5e8c0`. Not mandatory.
- **No smoothing:** drawn with `imageSmoothingEnabled=false`, so pixel art
  stays crisp. Author at native size; don't pre-scale.

## Registering a sprite
Add an entry to `SPRITES` in `index.html`, then set `sprite:'<id>'` on the
`ENEMIES` entry (the player uses id `vessel`):

```js
glassfin: { src: 'assets/glassfin.png', fw: 24, fh: 24, frames: 4, fps: 7, scale: 1.5, rotate: true },
//          path to the PNG strip          cell size   #frames  anim  on-screen  rotate to
//                                                               speed   scale     heading
```
- `scale` multiplies native size for the on-screen draw (tune to match the
  creature's footprint; `radius` in the ENEMIES def is the hitbox, art can be
  a bit larger).

## Current placeholders (replace these)
| file           | id        | size  | frames | notes                          |
|----------------|-----------|-------|--------|--------------------------------|
| `glassfin.png` | glassfin  | 24×24 | 4      | animated swim wiggle, cyan     |
| `crab.png`     | crab      | 28×28 | 1      | static, orange                 |
| `vessel.png`   | vessel    | 28×28 | 1      | player sub, nose right         |

These are auto-generated throwaways from `node test/gen-sprites.mjs` — overwrite
the files with real art (keep the names, or rename and update `SPRITES.src`).
Visual check after adding art: `node test/shoot.mjs` → `test/shots/08-sprites.png`.
