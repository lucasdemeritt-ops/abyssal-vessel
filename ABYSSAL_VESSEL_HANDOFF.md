# Abyssal Vessel — Project Handoff

A handoff for picking up development of **Abyssal Vessel** in a fresh session (Claude Code, GitHub, or otherwise). Read this top to bottom once; it covers what the game is, how it's built, every system, the dev/test workflow, the current state, known issues, and the roadmap.

**Current version:** v4.0
**Format:** a single self-contained HTML file (`index.html`) — HTML + CSS + one inline `<script>`. No build step, no dependencies, no external assets. Open it in a browser and it runs. A committed headless test harness lives in `test/` (Node, no browser needed).

> **v4.0 added:** a multi-stage structure (Roadmap #1), guarded `localStorage` persistence with per-stage bests (Roadmap #2), an options/customization menu, a load-time content validator, and the committed test harness. See §4a, §5, and the "ADDING CONTENT" banner at the top of the script.

---

## 1. What the game is

A **deep-sea survivor-like** (the *Vampire Survivors* / *Magic Survival* genre) built for **mobile / touch** first. You pilot a modular abyssal vessel descending through the ocean. Weapons fire automatically; you only steer. You survive escalating waves, collect XP to level up and pick upgrades, find artifacts, and fuse maxed weapons into god-tier "evolutions."

**Tone:** awe, dread, discovery. Bioluminescent enemies in near-darkness, the vessel's flashlight glow, eldritch deep-sea horror. **No puns, no comedy.** Fonts: Cinzel (display) + Share Tech Mono / Spectral (body).

**Core loop:** descend through 5 depth zones (by elapsed time) → kill enemies → collect XP gems → level up → pick 1 of 3 upgrades (or skip/bank) → occasionally find a treasure chest with an artifact → max two weapons to unlock their evolution → push deeper. Currently endless ("survive as long as you can"); a multi-level structure is planned (see Roadmap).

---

## 2. How it's built / file layout

Everything lives in `index.html`:

- `<style>` — all CSS (title screen + stage selector, HUD, upgrade/artifact/stage-clear/options screens, error overlay).
- HTML body — canvas, HUD elements, title/game-over/upgrade/artifact/stage-clear/options screens (all toggled via `.hidden`).
- `<script>` — the entire game (~3900 lines). Rendering is **canvas 2D**. Opens with an "ADDING CONTENT" guide banner.

Plus `test/` (committed): `check.sh` (the gate), `mock-env.mjs` (fake DOM/canvas + virtual clock), `smoke.mjs` (headless playthrough), `README.md`.

There is **no module system**. The whole script is wrapped in an IIFE (see Architecture). All game state hangs off a single global object `G`.

> **Note on versioned copies:** during this project, each version was also saved to a fresh filename (`abyssal-vessel-v32.html`, etc.) to defeat an aggressive artifact-viewer cache. In a normal GitHub/Claude Code workflow you do **not** need this — just edit `abyssal-vessel.html` directly and reload. The canonical file is `abyssal-vessel.html`.

---

## 3. Architecture (read this before touching the loop)

### The single global state object `G`
Holds everything: `G.player`, and entity arrays `enemies`, `projectiles`, `enemyProjectiles`, `pickups`, `particles`, `effects`, `spires`, `voids`, `bursts`, `chests`, `orbiters`, `drones`, `mines`. Plus timers (`spawnT`, `bossT`, `chestT`), `cam`, `shake`, `state`, `t` (elapsed seconds), `zoneIdx`, `enemiesKilled`, `best`.

`G.state` is one of: `title`, `play`, `levelup`, `artifact`, `over`. The update half of the loop only runs when `state === 'play'`; render always runs.

### The game loop & the "trampoline" (IMPORTANT — this prevents a whole class of crashes)
The script is wrapped in `(function freshStart(){ ... })()`. Because the artifact host could re-run the script (remount), older versions suffered **"zombie loop" crashes**: a stale game loop from a previous script execution kept running and touched state that had been reset to `null` (the infamous `Cannot read properties of null (reading 'flashT')`).

The fix, still in place and **must be preserved**:
- A single **global trampoline driver** is installed exactly once (`window.__avDriverInstalled`). It calls only `window.__avLoop`, which always points at the newest loop body. Stale closures therefore can't execute.
- `freshStart()` cancels any prior RAF, bumps a generation counter (`window.__avGen`), tears down old state, and clears the error banner.
- The loop body is fully wrapped in try/catch; each subsystem runs via `safeCall(name, fn)` so one failing subsystem can't kill the frame.
- Every function that reads `G.player` guards against null: `updatePlayer`, `render`, `drawPlayer`, `damagePlayer`, `updateHUD` all early-return if `!G.player`.
- An on-screen error overlay (`#err-overlay`, shown via `window.__showErr`) surfaces real errors but ignores empty/phantom/resource errors.

**If you refactor the loop, keep the trampoline, the null guards, and `safeCall`.** They are load-bearing.

### Performance: spatial grid + hard caps
- `const grid` — a spatial hash (90px cells) rebuilt each frame from `G.enemies`. Anything doing proximity queries (weapon targeting, projectile/effect collisions, void/mine AoE) uses `grid.forEachInRadius(x,y,r,cb)` and `nearestEnemy(...)`. This turns O(n²) into ~O(n) and is why 320 enemies run cheaply.
- `const CAPS` hard-limits every entity array: `enemies 320, projectiles 400, enemyProjectiles 220, particles 280, pickups 240, effects 70, spires 40, voids 24, bursts 60, mines 60`.
- **`pushEffect(fx)`** enforces the effects cap (drops oldest when full). **Always use `pushEffect` instead of `G.effects.push`** — uncapped effects caused a real performance-crash because each damaging effect runs a grid query every frame. Damage numbers (`bursts`) and projectile arrays are also cap-checked.

Stress tested: fully-maxed loadout, screen-filling swarm, ~250µs–1.2ms median frame compute against a 16.7ms budget.

---

## 4. Game systems

### Controls
Floating joystick: touch anywhere becomes the anchor, drag to steer (so the thumb isn't over the action). Mouse works too (for desktop testing).

### Weapons — "schools" and levels
11 base weapons, each belonging to a **school**. Each has a `levels` array and `fire(w, p)`. **All base weapons max at level 4** (`maxLevel: 4`) — this was a deliberate rework so the power ceiling (old L5) is reached in 3 upgrades, making evolutions attainable. `fire` reads `this.levels[w.lvl - 1]`.

| id | name | school |
|---|---|---|
| sonar_pulse | Sonar Pulse | sonar |
| pressure_wave | Pressure Wave | pressure |
| bioelectric_arc | Bioelectric Arc | bioelectric |
| parasite_swarm | Parasite Swarm | parasite |
| coral_spire | Coral Spire | coral |
| voidwater_orb | Voidwater Cyclone | voidwater |
| torpedo_array | Torpedo Array | mechanical |
| thermal_vent | Thermal Vent | thermal |
| orbital_ring | Orbital Ring | orbital |
| drone_gun | Sentry Drone | drone |
| prox_mine | Proximity Mine | mine |

Some weapons maintain **persistent entities** rather than firing one-shot projectiles: `orbital_ring`→`G.orbiters` (shards circling the player, kept perfectly equidistant via shared phase + index), `drone_gun`→`G.drones` (autonomous turrets), `prox_mine`→`G.mines`, `voidwater_orb`→`G.voids` (drifting cyclones). Their `fire` reconciles entity count to match weapon level.

Weapons read **artifact bonuses** from `p.bonus` (see below) and per-school damage via `schoolMult(p, school)`.

### Evolutions (the combo system) — deterministic 1:1 (v4.0)
Max two specific weapons (both at L4) and the next level-up offers a gold **EVOLUTION** card. Data-driven via the `EVOLUTIONS` array (recipes) and evolution entries in `WEAPONS` (flagged `evolution: true`). **Evolving consumes BOTH source weapons** and grants the evolved one (which should be ~as strong as both combined, or a bit more). Evolutions are **school-aware**, so damage artifacts still boost them.

**The model is 1:1:** each unordered weapon pair maps to exactly one evolution, and each evolution has exactly one pair. (The old dual-path recipes — `orbital+coral` *or* `orbital+bioelectric` → Halo, etc. — were removed in v4.0 as arbitrary.) A weapon may still appear in several recipes with *different* partners, so it can have more than one distinct evolution. `validateContent()` rejects any duplicate pair or duplicate target, so a future recipe can't reintroduce the ambiguity.

8 evolutions, 8 recipes:

| evolution | recipe |
|---|---|
| resonance_collapse (Resonance Collapse) | sonar + pressure |
| arc_furnace (Arc Furnace) | bioelectric + thermal |
| drone_hive (Drone Hive) | parasite + torpedo |
| black_reef (Black Reef) | coral + voidwater |
| calling_depth (The Calling Depth) | sonar + voidwater |
| halo_array (Halo Array) | orbital + coral |
| swarm_fleet (Drone Fleet) | drone + torpedo |
| abyssal_minefield (Abyssal Minefield) | mine + thermal |

`getEvolution()` returns the first recipe whose two `from` weapons are both at `maxLevel` and whose `to` isn't already owned. `buildUpgradePool()` always includes an available evolution; `presentUpgrades()` always surfaces it (never lost in the random mix). Evolution apply removes **all** weapons in `from` (the old `replaces` field is gone).

> **Adding a new weapon later:** add it to `WEAPONS` with a `levels` array + `fire`, add its `school` to `SCHOOLS`, and add a recipe to `EVOLUTIONS` (unique pair, unique target) plus an evolved weapon. The system is fully data-driven; nothing else needs editing. See the "ADDING CONTENT" banner at the top of the script.

> **Design note (owner, v4.0):** the chosen direction is **deterministic 1:1** for now. A *choice-based* model (a combo unlocks a pick among several evolution directions, Magic-Survival style) was considered and deferred — the system is centralized in `getEvolution()`/`presentUpgrades()`, so it can be revisited without touching weapon code.

### Artifacts (18) — limited slots, found in chests
Rare. A treasure chest spawns roughly every ~38s (one at a time, after 25s), with an off-screen gold direction arrow when off-screen. Walking into it pauses the game (`state='artifact'`) and offers a **choice of 2** (plus "leave it" → heal 30). You have **4 slots** (`ARTIFACT_SLOTS`). When full, picking a new one opens a swap screen (replace one, or keep your loadout). Artifacts apply/remove reversibly (must be — slots are swappable). They write into `p.bonus`:

`projCount, projSpeed, projSize, pierce, orbCount, droneCount, sonarBursts, school{}` (per-school damage multipliers).

Artifact list (offense / defense / new-weapon / utility):
`munitions` (+1 projectile), `overclock` (proj speed), `swell` (proj size), `piercer` (+2 pierce), `capacitor` (sonar+bioelectric dmg), `bloom` (parasite+mechanical dmg), `reactor_relic`/Leviathan Heart (all dmg +25%, +40 hull), `ballast_relic`/Current Rider (speed + cdr), `aegis`/Aegis Membrane (absorb one hit, recharges), `carapace` (+60 hull + regen), `phase`/Phase Cloak (longer invuln), `gyroscope` (orbital dmg), `uplink` (drone dmg), `detonator` (mine dmg+size), `extra_shard`/Fractured Prism (+2 shards), `extra_drone`/Drone Bay (+1 drone), `resonator_relic`/Echo Chamber (+1 sonar wave), `retaliate_relic`/Counterstrike Core (screen-wide blast when hit, 6s cd).

### Passives (8) — ordinary upgrade-screen picks
`hull` (+25 max), `ballast` (+12% speed), `reactor` (+12% all dmg, max 4), `cooling` (−10% cd), `sensors` (+40% pickup range), `resonator` (+15% AoE), `glow` (+20% light), `regen` (+0.5 hp/s).

### Level-up + the Skip option
On reaching `xpToNext`, `levelUp()` increments level, raises the threshold (×1.45+1), records `_lastLevelCost`, and opens the upgrade screen. `presentUpgrades()` shows up to 3 cards plus a 4th muted **"Decline & Bank"** card. Skipping (`skipLevelUp()`) reverts the level/threshold and refunds **half** the spent XP toward the next level — lets you hold out for the abilities/combos you want. Selection is **weighted** toward weapons you've already invested in, and options you just skipped are downweighted so they don't repeat back-to-back. Enemy scaling is **time/zone based, not level based**, so skipping never affects difficulty.

### Enemies (11)
| id | name | notes |
|---|---|---|
| small_fish | Glassfin | basic |
| crab | Carapace | slow tank |
| jelly | Drift Bell | |
| squid | Inkmind | **ranged** — fires a bright, slow, very visible projectile |
| wreck_drone | Wreck Drone | red eye |
| tentacle | Reaching Arm | heavy hitter |
| eye_cluster | Witness Cluster | splits into Witness on death |
| small_eye | Witness | small, fast |
| anglerfish | Lanternjaw | boss |
| void_maw | Void Maw | teleporter (purple saucer) — re-blinks in **from off-screen only**, has an implosion death animation |
| leviathan | Leviathan Mote | boss |

Spawns are always **off-screen** at `sqrt(W²+H²)/2 + 70`, and avoid a rotating ~85° "safe arc" so the player is never fully encircled with no escape. Ranged enemies (squid) are capped at a few concurrent.

### Zones & scaling (time-based)
A **zone** is a depth band *within a run* (its enemy `pool` + `spawnRate`, advanced by elapsed time): Continental Shelf (→50s), Twilight Zone (→185s), Abyssal Ruins (→430s), Hadal Depths (→760s), The Mouth (∞). `currentZone()` reads `activeStage().zones || ZONES`.

Scaling is now **stage-aware** (see §4a) — the per-zone step and per-second ramp come from the active stage:

- Spawn pressure: `timeRamp = min(4.2, 1 + t/400)` then `× stage.spawnMult`; `burst = min(6, 1 + floor(t/140))`. Pressure keeps climbing into the very late game.
- `scaleHp = (1 + idx*0.45 + t*stage.hpRamp) * stage.difficulty`.
- `scaleDmg = (1 + idx*0.13 + t*stage.dmgRamp) * (1 + (stage.difficulty-1)*0.5)` — damage scales more gently than HP, so deeper stages get spongier/more crowded without one-shotting.
- Bosses spawn on a timer (`bossT`).

### Pickups / XP
XP gems drop from kills. Pickup magnet is intentionally **small** (base radius 48) and only pulls when you're genuinely close — collecting XP is a positioning decision. The Sensor Array passive widens it (+40%/level). Rare HP drops; bosses always drop HP. Pickups are pushed via **`pushPickup`** (cap-enforced; an XP gem that can't fit folds its value into the oldest gem so no progression is lost).

---

## 4a. Stages, persistence, options, validation (v4.0)

### Stages (the multi-level structure — Roadmap #1)
A **stage** is a whole run. The `STAGES` registry reuses the shared zone progression but layers on a difficulty envelope and a win condition. Each stage: `{ id, numeral, name, flavor, difficulty, spawnMult, hpRamp, dmgRamp, clearTime, endless, clearFlavor }`. Stage N starts harder than N-1.

- `activeStage()` → `STAGES[G.stageIdx]` (the active run *and* the title selection).
- **Win:** the loop's `safeCall('progress', …)` calls `stageClear()` when `!endless && G.t >= clearTime`. That records the best, unlocks the next stage, and shows the stage-clear screen (descend deeper / surface). The final stage is `endless`.
- **Stage select** lives on the title screen (`renderStageSelect()` / `selectStage(±1)`): prev/next, goal, per-stage best, and a "sealed" state for locked stages. `descendPressed()` refuses to start a locked stage.
- **States added:** `G.state` can now also be `'cleared'`. Flow states are `title / play / levelup / artifact / pause / cleared / over`.
- **To add a stage:** append to `STAGES`. Nothing else needs editing.

### Persistence (Roadmap #2)
`SAVE = { unlocked, best:{stageId:depth}, options:{} }`, key `abyssal_vessel_save_v1`. `loadSave()` / `persistSave()` wrap **all** `localStorage` access in try/catch — on failure (e.g. the old artifact sandbox) the game runs on the in-memory `SAVE` with no persistence. Real storage works on GitHub Pages. **Never let storage throw into the game.**

### Options / customization
`OPTIONS` (persisted in `SAVE.options`) is edited by a data-driven options screen built from `OPTION_SCHEMA` (toggle or cycle rows). Current options: screen shake, damage numbers, reduced motion, beam intensity, starting weapon. Render-time options are read live (`shake()`, `spawnHitParticles`, the flashlight `lightR`, damage-number rendering); per-run options apply in `applyOptionsToRun()` (starting weapon). **To add an option:** add a row to `OPTION_SCHEMA` and read `OPTIONS.<key>` where it matters.

### Content validation
`validateContent()` runs once at load and returns a list of problems (missing fields, unknown schools, evolution recipes pointing at non-existent/mis-flagged weapons, non-reversible artifacts, malformed stages, etc.). It's **non-fatal** — logs `console.warn`, exposed as `CONTENT_ISSUES`, and the smoke test asserts it's empty. Add a check here whenever you add a required field to a content table.

### Caps (now fully enforced on push)
`pushEffect`, **`pushPickup`**, **`pushParticle`** all enforce `CAPS`; enemy death-splits and boss spawns (`spawnEnemyAt` returns `null` at cap) respect the enemy cap. An idle/AFK player can no longer grow any array without bound.

---

## 5. Dev & test workflow

This project was built **without** a normal toolchain, so there's a manual but reliable cycle. In Claude Code with Node available, replicate it:

1. **Edit** the inline `<script>` in `index.html`.
2. **Run the gate** — extract → `node --check` → headless smoke test:
   ```bash
   bash test/check.sh
   ```
   The harness (now committed under `test/`) is the recreation of the dev tooling earlier handoffs described:
   - `test/mock-env.mjs` — fake DOM + a **strict** canvas mock that *throws* on the inputs a real browser rejects (negative/non-finite radii, out-of-range `globalAlpha`), plus a virtual clock (`performance`/`requestAnimationFrame`/`setTimeout`). It `vm`-evaluates the extracted script and drives frames manually.
   - `test/smoke.mjs` — boots title→play, drives ~10 min of game time, forces level-ups, exercises the stage-clear/unlock/persistence flow and death, and asserts: no surfaced errors, **caps hold**, the sanitizer holds, and `CONTENT_ISSUES` is empty.
   - The game cooperates via a **test seam**: when `window.__avExpose` is set before the script runs, it publishes `G`/`CAPS`/`WEAPONS`/`STAGES`/`SAVE`/`OPTIONS`/… on `window.__av`. Never set in production.
   > Still worth adding later: a fully-maxed `bound-test` (frame compute µs) and a `null-sabotage` probe. The mock in `mock-env.mjs` is the reusable base.
3. **Bump the version** in two places (subtitle + console log):
   ```bash
   sed -i "s/MK VII · vX.X/MK VII · vY.Y/; s/ABYSSAL VESSEL vX.X/ABYSSAL VESSEL vY.Y/" index.html
   ```
   The game logs `ABYSSAL VESSEL vX.X` to the console on load (plain text — do not re-add `%c` styling; it leaks markup on mobile consoles).
4. **Test in a real browser** on a phone or with mobile emulation.

**Golden rule:** never ship a change without `bash test/check.sh` passing. Several past crashes were brace-mismatches from text edits that silently broke function boundaries — `node --check` (step 1 of the gate) catches exactly those.

---

## 6. Current state & balance notes (as of v4.0)

Working well: the early game pace, the chest/artifact loop, weapon maxing at L4, the skip-to-bank option, evolutions being reachable, performance/stability.

> **v4.0 balance is unplaytested.** The stage difficulty curve (`difficulty`/`spawnMult`/`hpRamp`/`dmgRamp` per stage in `STAGES`) was set by reasoning, not play. Expect to tune it: the step between stages, and whether stage IV (endless) stays survivable long enough to feel like the payoff. All knobs are in the `STAGES` table.

Recent balance work has been an ongoing "tame the overpowered evolutions" pass:
- **Resonance Collapse** (v3.2): reworked from an instant 6-implosion carpet every 1.3s to a **sequential cascade** — smaller wave + 4 staggered implosions (~0.18s apart) on a 3.2s cooldown.
- **Voidwater / Calling Depth** (v3.1): base Voidwater is now **drifting cyclones** that emanate from the sub with a gentle, **escapable** pull (quadratic falloff — only the dead center grips; enemies at the rim break free). Calling Depth (the evolution) is now many **small, fast-decaying** vortexes scattered across the field, not a few huge permanent ones. This killed an invincibility exploit (sitting in the intersection of permanent voids).
- Power Reactor reduced to +12% × max 4 to curb multiplicative damage stacking.

**Design principle the owner cares about:** screen-wiping should be the payoff of a **whole stacked build at 15–20 min**, not a single evolution you rush. Rushing one combo *should* feel briefly overpowered as a reward, but enemies should eventually out-scale it.

---

## 7. Known issues / things to watch

- **Balance is unfinished.** Each evolution likely needs the same "smaller / slower / more deliberate" tuning pass Resonance Collapse and Calling Depth got. Play, find the next overpowered one, tune it down.
- **Repeated skipping** leaves `xpToNext` frozen (skip restores the prior threshold). Minor; revisit if it becomes exploitable.
- **Crash caveat:** a couple of late-game crashes were reported during development that the test harnesses could never reproduce; the working theory each time was either a stale viewer cache or an uncapped array (since fixed with `pushEffect`/caps and the trampoline). If a crash recurs, the **error banner text** (the subsystem name after `ERROR:` / `LOOP HALTED:`) is the fastest way to pin it — capture that first.
- The `setTimeout`-based staggered effects (sonar multi-wave, pressure-wave implosions, resonance cascade) run **outside** the loop's try/catch. They're guarded (`if (G.state !== 'play' || !G.player) return;`) — keep that guard on any new timed effect.

---

## 8. Roadmap (owner's stated direction, in priority order)

1. ✅ **Multi-level / stage system.** *Done in v4.0* — `STAGES` registry, escalating difficulty, survive `clearTime` to unlock the next, stage select + stage-clear screens. See §4a. (Tuning the difficulty curve across stages is ongoing — see §6/§7.)
2. ✅ **Per-level high scores.** *Done in v4.0* — per-stage bests in `SAVE.best`, persisted via guarded `localStorage` (works on GitHub Pages; in-memory fallback elsewhere). See §4a.
3. **More balance passes** on evolutions (see above), on individual weapons, and now **across stages** (is the difficulty step from stage to stage right? does stage IV stay survivable long enough to feel like a payoff?). The numbers are all in the `STAGES`/`WEAPONS`/`EVOLUTIONS` tables — easy to tune, best done from playtest feedback.
4. **Weapon-behavior variety / polish** — e.g. the swarm/drone-hive could have movement variations (spread in a radius, squiggly paths, splitting to different targets) instead of all swarming together. Texture/feel improvements.
5. **More weapons & artifacts** over time — the system is data-driven and designed to scale (each new weapon implies at least one new artifact and at least one evolution recipe).
6. **Background / environment variety** eventually — right now it's a readable blue-to-black gradient by depth; distinct themed levels (Atlantis, hadal trench, etc.) are a "someday" idea. The owner explicitly does **not** want to sacrifice the current high readability for texture prematurely.

---

## 9. Quick reference — key symbols in the script

- State: `G` (everything), `G.state` (`title/play/levelup/artifact/pause/cleared/over`), `G.t`, `G.player`, `G.bonus` (on player), `G.stageIdx`.
- Loop/safety: `freshStart()`, `loop()`, `window.__avLoop`, `window.__avDriverInstalled`, `window.__avGen`, `safeCall()`, `window.__showErr()`.
- Perf/caps: `grid` (+ `grid.forEachInRadius`, `nearestEnemy`), `CAPS`, `pushEffect()`, `pushPickup()`, `pushParticle()`.
- Data tables: `WEAPONS`, `SCHOOLS`, `EVOLUTIONS`, `ARTIFACTS` (+ `ARTIFACT_SLOTS`), `PASSIVES`, `ZONES`, `ENEMIES`, `STAGES`.
- Stages/persistence/options: `activeStage()`, `SAVE` (+ `loadSave`/`persistSave`), `OPTIONS` (+ `OPTION_SCHEMA`, `applyOptionsToRun`), `validateContent()`/`CONTENT_ISSUES`.
- Flow: `startGame()`, `gameOver()`, `stageClear()`, `renderStageSelect()`/`selectStage()`, `openOptions()`/`renderOptions()`, `returnToTitle()`, `spawnEnemy()`, `spawnBoss()`, `spawnChest()`, `killEnemy()`, `damageEnemy()`, `damagePlayer()`, `levelUp()`, `skipLevelUp()`, `buildUpgradePool()`, `presentUpgrades()`, `getEvolution()`, `openChest()`, `equipArtifact()`, `swapArtifact()`.
- Update fns (run via `safeCall` when `state==='play'`): `updatePlayer`, `updateEnemies`, `updateProjectiles`, `updateEffects`, `updateSpires`, `updateDeployables` (orbiters/drones/mines), `updatePickups`, `updateChests`, `updateParticles`, `ambientParticles`, `updateHUD`, then `render`. Also `progress` (stage-clear check) runs first.
- Test seam: `window.__avExpose` → `window.__av` (read refs for the headless harness; never set in production).

---

## 10. GitHub & deployment

- The game is at the repo root as **`index.html`**; the test harness is committed under **`test/`** (run `bash test/check.sh`).
- For a playable hosted build, **GitHub Pages** serves the single HTML file as-is. There, real `localStorage` works, so stage unlocks / per-stage bests / options persist (Roadmap #2). In a storage-less sandbox the game still runs (in-memory `SAVE`).
- To enable Pages: repo **Settings → Pages → Deploy from branch**, pick the branch + root, and it serves `index.html`.

— End of handoff —
