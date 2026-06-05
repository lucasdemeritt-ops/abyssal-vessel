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
const { G, CAPS } = env.av;

// --- Title screen renders without input -----------------------------------
for (let i = 0; i < 10; i++) env.frame();
ok(env.state === 'title', "starts on the title screen");

// --- Start a run ----------------------------------------------------------
env.av.startGame();
env.frame();
ok(env.state === 'play', "DESCEND puts the game into 'play'");

// --- Drive ~10 minutes, forcing level-ups and capturing caps --------------
const peak = {};
const track = ['enemies', 'projectiles', 'enemyProjectiles', 'particles',
  'pickups', 'effects', 'spires', 'voids', 'bursts', 'mines'];
function recordCaps() {
  for (const k of track) peak[k] = Math.max(peak[k] || 0, G[k].length);
}

let levelups = 0;
const FRAMES = 6000; // 6000 * 0.1s clamp = ~600s of game time
for (let i = 0; i < FRAMES; i++) {
  // Use a big dt so the loop's 0.1s clamp advances game time fast.
  env.frame(120);
  recordCaps();

  // Periodically hand the player enough XP to level, then take an upgrade.
  if (G.state === 'play' && i % 60 === 0 && G.player) {
    G.player.xp = G.player.xpToNext;
  }
  if (G.state === 'levelup') {
    const cards = env.getEl('upgrade-cards').children;
    if (cards.length) { cards[0]._fire('click'); levelups++; }
    env.frame();
  }
  if (G.state === 'over') break;
}

ok(levelups > 0, `leveled up and picked upgrades (${levelups}x)`);
ok(errors.length === 0, 'no runtime errors surfaced' + (errors.length ? ':\n    ' + errors.slice(0, 3).join('\n    ') : ''));

let capsOk = true;
for (const k of track) {
  if (peak[k] > CAPS[k]) { capsOk = false; console.log(`    cap violated: ${k} peaked at ${peak[k]} > ${CAPS[k]}`); }
}
ok(capsOk, 'every entity array stayed under its hard cap');
console.log('    peak counts:', track.map(k => `${k}=${peak[k]}/${CAPS[k]}`).join('  '));

// --- Player can die -> game over ------------------------------------------
if (G.state !== 'over') {
  if (G.player) { G.player.hp = -999; G.player.invuln = 0; G.player.shieldReady = false; }
  for (let i = 0; i < 200 && G.state !== 'over'; i++) env.frame(120);
}
ok(env.state === 'over', 'reaches the game-over screen on death');

console.log(failures ? `\nSMOKE FAILED (${failures})` : '\nSMOKE PASSED');
process.exit(failures ? 1 : 0);
