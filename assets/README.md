# Sprite assets — art spec

Drop-in art for the sprite layer (see the `SPRITES` registry in `index.html`).
The game renders procedurally by default; any entity with a `sprite:'<id>'`
draws from the matching PNG here, and **falls back to its vector drawing** if
the file is missing or fails to load. So you can add/replace art one file at a
time with zero risk.

## File format
- **PNG, transparent background.**
- **Simple animation = one horizontal strip:** frame 0 leftmost, frame N at
  `x = N * fw`. All frames the same `fw × fh`. A static sprite is a 1-frame strip.
- **Animation states = a grid:** each **row** is a clip (idle / move / hit /
  death), each **column** a frame. Declare it with `anims` in `SPRITES`
  (`{ row, frames, fps, loop }` per clip). State is auto-picked per entity each
  frame: **death > hit > move > idle**. `loop:false` holds the last frame.
  A row may have fewer real frames than the widest row — just set that clip's
  `frames` and leave the extra cells transparent. See `glassfin.png` (4 rows).
- **Death clips:** if a sprite has a `death` clip, that creature lingers as an
  inert corpse for the clip's length, then vanishes. No death clip ⇒ it pops
  instantly (current behavior). So death art is purely additive.
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

## Every entity is pre-wired — art is a one-line drop-in
All enemies already carry a `sprite:` field and a `SPRITES` descriptor sized to
their hitbox. The three below have placeholder art; the rest have `src:''`
(pending) and render as vectors until you set `src`. **To add art:** author the
PNG to the listed grid and set `SPRITES.<id>.src` (bump `frames`/`fps` or add
`anims` if animated). Nothing else to touch.

| id            | entity          | grid  | scale | rotate | status            |
|---------------|-----------------|-------|-------|--------|-------------------|
| `vessel`      | player sub      | 28×28 | 1.2   | yes    | placeholder       |
| `glassfin`    | Glassfin        | 24×24 | 1.5   | yes    | placeholder (4-row anim) |
| `crab`        | Carapace        | 28×28 | 1.5   | no     | placeholder       |
| `small_eye`   | Witness         | 24×24 | 1.0   | no     | **pending**       |
| `squid`       | Inkmind         | 28×28 | 1.4   | no     | **pending**       |
| `jelly`       | Drift Bell      | 28×28 | 1.7   | no     | **pending**       |
| `eye_cluster` | Witness Cluster | 28×28 | 1.7   | no     | **pending**       |
| `wreck_drone` | Wreck Drone     | 28×28 | 1.8   | no     | **pending**       |
| `tentacle`    | Reaching Arm    | 28×28 | 2.0   | no     | **pending**       |
| `void_maw`    | Void Maw        | 32×32 | 1.9   | no     | **pending**       |
| `anglerfish`  | Lanternjaw      | 32×32 | 2.2   | yes    | **pending**       |
| `leviathan`   | Leviathan Mote  | 40×40 | 2.4   | no     | **pending** (boss)|

`scale` is `on-screen px = grid · scale`, pre-set to ≈4×hitbox-radius to match
the current vector footprint — tune to taste. `rotate:true` ⇒ draw nose-right.

The placeholders are auto-generated throwaways from `node test/gen-sprites.mjs`
— overwrite the files with real art (keep the names, or rename + update `src`).
Visual check after adding art: `node test/shoot.mjs` → `test/shots/08-sprites.png`.
