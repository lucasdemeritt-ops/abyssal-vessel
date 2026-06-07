// Render the real game in headless Chromium and capture the new v4.0 screens.
// Output PNGs into test/shots/. Run: node test/shoot.mjs
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
function loadPlaywright() {
  try { return require('playwright'); } catch {}
  try {
    const groot = execSync('npm root -g', { encoding: 'utf8' }).trim();
    return require(path.join(groot, 'playwright'));
  } catch (e) { throw new Error('playwright not found: ' + e.message); }
}
const { chromium } = loadPlaywright();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const outDir = path.join(__dirname, 'shots');
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
// Phone-ish portrait viewport (the game's target form factor).
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });

const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

// Turn on the test seam (window.__av) before the game script runs.
await page.addInitScript(() => { window.__avExpose = true; });
await page.goto('file://' + path.join(root, 'index.html'));
await page.waitForTimeout(800); // let title/render settle

async function shot(name) {
  const f = path.join(outDir, name + '.png');
  await page.screenshot({ path: f });
  console.log('  ' + name + '.png');
}

// 1) Title + stage selector (stage I)
await shot('01-title');

// 2) Stage selector advanced to a locked, deeper stage
await page.click('#stage-next');
await page.click('#stage-next');
await page.waitForTimeout(250);
await shot('02-stage-locked');

// 3) Options screen
await page.click('#stage-prev'); await page.click('#stage-prev');
await page.click('#options-btn');
await page.waitForTimeout(250);
await shot('03-options');
await page.click('#options-done-btn');

// 4) Live gameplay — start stage I and let it run a bit with some auto-combat
await page.click('#start-btn');
await page.waitForTimeout(200);
// nudge the vessel so it moves through enemies (synth pointer drag from center)
await page.mouse.move(195, 480);
await page.mouse.down();
await page.mouse.move(230, 430, { steps: 8 });
await page.waitForTimeout(2600);
await page.mouse.move(160, 520, { steps: 8 });
await page.waitForTimeout(2600);
await page.mouse.up();
await shot('04-gameplay');

// 5) Level-up screen — force XP over the threshold via the test seam, then
// wait for the upgrade screen to actually open.
await page.evaluate(() => { const p = window.__av.G.player; p.xp = p.xpToNext + 1; });
await page.waitForFunction(() => window.__av.G.state === 'levelup', { timeout: 5000 });
await page.waitForSelector('#upgrade-screen:not(.hidden)');
await page.waitForTimeout(200);
await shot('05-levelup');

// 6) Stage-clear screen — resume play, jump the run clock past clear time, and
// wait for the clear overlay to reveal (it has a ~600ms reveal delay).
await page.evaluate(() => {
  const av = window.__av;
  document.getElementById('upgrade-screen').classList.add('hidden');
  av.G.state = 'play';
  av.G.t = av.activeStage().clearTime + 1;
});
await page.waitForFunction(() => !document.getElementById('stage-clear-screen').classList.contains('hidden'), { timeout: 5000 });
await page.waitForTimeout(150);
await shot('06-stage-clear');

// 7) New weapons firing — fresh run, equip the batch at max, let combat run.
await page.evaluate(() => {
  const av = window.__av;
  av.G.stageIdx = 0; av.startGame();
  av.G.player.weapons = [
    { id: 'photophore_lance', lvl: 4, cd: 0 },
    { id: 'ink_plume', lvl: 4, cd: 0 },
  ];
});
await page.mouse.move(195, 480); await page.mouse.down();
await page.mouse.move(220, 450, { steps: 6 });
await page.waitForTimeout(3500);
await page.mouse.up();
await shot('07-new-weapons'); // ink cloud + both new weapon icons in the HUD

await browser.close();
if (errors.length) { console.log('PAGE ERRORS:\n  ' + errors.join('\n  ')); process.exit(1); }
console.log('OK — shots in test/shots/');
