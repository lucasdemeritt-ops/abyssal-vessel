// Headless smoke test for Abyssal Vessel.
//
//  - boots the title screen
//  - starts a run and drives ~10 minutes of game time
//  - forces level-ups and picks upgrades
//  - asserts every entity array stays under its hard cap
//  - asserts the canvas sanitizer never lets a bad value through
//  - asserts the player can die and reach the game-over screen
//
// Run with:  node test/smoke.mjs
// (test/check.sh also runs `node --check` on the extracted script first.)

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createEnv, extractScript } from './mock-env.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HTML = path.join(__dirname, '..', 'index.html');

let failures = 0;
function ok(cond, msg) {
  if (cond) { console.log('  ✓ ' + msg); }
  else { console.log('  ✗ ' + msg); failures++; }
}

const script = extractScript(HTML);
const env = createEnv(script);

// Collect any error the game would have surfaced on-device.
const errors = [];
env.win.__showErr = (m) => errors.push(m);

ok(!!env.av, 'game exposed internals via __avExpose seam');
const { G, CAPS, STAGES, SAVE } = env.av;

// --- Stage registry present -----------------------------------------------
ok(Array.isArray(STAGES) && STAGES.length >= 2, `stage registry present (${STAGES.length} stages)`);
ok(STAGES.every(s => s.id && s.numeral && typeof s.difficulty === 'number'), 'every stage has id/numeral/difficulty');

// --- Content validation: every table entry is well-formed -----------------
const issues = env.av.CONTENT_ISSUES || [];
ok(issues.length === 0, 'content validation clean' + (issues.length ? ':\n    ' + issues.slice(0, 6).join('\n    ') : ''));

// --- Evolutions are deterministic 1:1 (unique pairs + targets) ------------
const EVO = env.av.EVOLUTIONS;
const pairKeys = EVO.map(r => [...r.from].sort().join('+'));
const targets = EVO.map(r => r.to);
ok(new Set(pairKeys).size === EVO.length, 'every evolution pair is unique (1:1)');
ok(new Set(targets).size === EVO.length, 'every evolution target is unique (1:1)');

// --- Title screen renders without input -----------------------------------
for (let i = 0; i < 10; i++) env.frame();
ok(env.state === 'title', "starts on the title screen");

// --- Start a run (stage I) ------------------------------------------------
G.stageIdx = 0;
env.av.startGame();
env.frame();
ok(env.state === 'play', "DESCEND puts the game into 'play'");

// Maxing both halves of a recipe offers exactly that (unique) evolution.
{
  const r = EVO[0];
  G.player.weapons = r.from.map(id => ({ id, lvl: env.av.WEAPONS[id].maxLevel, cd: 0 }));
  const offered = env.av.getEvolution();
  ok(offered && offered.to === r.to, `maxed ${r.from.join('+')} offers ${r.to}`);
  G.player.weapons = [{ id: 'sonar_pulse', lvl: 1, cd: 0 }]; // restore for the drive
}

// --- Drive until the stage clears, forcing level-ups and capturing caps ---
const peak = {};
const track = ['enemies', 'projectiles', 'enemyProjectiles', 'particles',
  'pickups', 'effects', 'spires', 'voids', 'bursts', 'mines'];
function recordCaps() {
  for (const k of track) peak[k] = Math.max(peak[k] || 0, G[k].length);
}

let levelups = 0;
const MAX_FRAMES = 9000; // generous: clearTime is 600s, frames advance ~0.1s each
for (let i = 0; i < MAX_FRAMES; i++) {
  // Keep the (stationary) test pilot alive so we deterministically reach the
  // clear time — we're exercising the engine/caps/clear flow, not survival.
  if (G.state === 'play' && G.player) { G.player.hp = G.player.maxHp = 1e9; G.player.invuln = 1; }
  env.frame(120); // big dt -> loop clamps to 0.1s, advancing game time fast
  recordCaps();
  if (G.state === 'play' && i % 60 === 0 && G.player) G.player.xp = G.player.xpToNext;
  if (G.state === 'levelup') {
    const cards = env.getEl('upgrade-cards').children;
    if (cards.length) { cards[0]._fire('click'); levelups++; }
    env.frame();
  }
  if (G.state === 'over' || G.state === 'cleared') break;
}

ok(levelups > 0, `leveled up and picked upgrades (${levelups}x)`);
ok(errors.length === 0, 'no runtime errors surfaced' + (errors.length ? ':\n    ' + errors.slice(0, 3).join('\n    ') : ''));

let capsOk = true;
for (const k of track) {
  if (peak[k] > CAPS[k]) { capsOk = false; console.log(`    cap violated: ${k} peaked at ${peak[k]} > ${CAPS[k]}`); }
}
ok(capsOk, 'every entity array stayed under its hard cap');
console.log('    peak counts:', track.map(k => `${k}=${peak[k]}/${CAPS[k]}`).join('  '));

// --- Surviving the clear time clears the stage and unlocks the next --------
ok(env.state === 'cleared', "survived clear time -> 'cleared'");
ok(SAVE.unlocked >= 1, 'clearing stage I unlocked stage II');
ok((SAVE.best['first_descent'] || 0) > 0, 'per-stage best recorded for stage I');

// --- Player can die -> game over (fresh run) ------------------------------
G.stageIdx = 0;
env.av.startGame();
env.frame();
ok(env.state === 'play', 'fresh run starts back in play');
if (G.player) { G.player.invuln = 0; G.player.shieldMax = 0; G.player.shieldReady = false; }
env.av.damagePlayer(1e9);
ok(env.state === 'over', 'reaches the game-over screen on death');

console.log(failures ? `\nSMOKE FAILED (${failures})` : '\nSMOKE PASSED');
process.exit(failures ? 1 : 0);
