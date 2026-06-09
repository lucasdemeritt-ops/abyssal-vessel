// Generate placeholder sprite PNGs into assets/ (dev tool).
// Real art will replace these files; this just exercises the load+animate path.
// Uses headless Chromium's canvas to author + export PNGs.
// Run: node test/gen-sprites.mjs
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
function loadPlaywright() {
  try { return require('playwright'); } catch {}
  const groot = execSync('npm root -g', { encoding: 'utf8' }).trim();
  return require(path.join(groot, 'playwright'));
}
const { chromium } = loadPlaywright();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const assets = path.join(__dirname, '..', 'assets');
fs.mkdirSync(assets, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage();

// Each sprite is authored as a horizontal strip of `frames` cells of `cell`px.
// Crude on purpose — placeholders. Drawn pixel-ish (no smoothing).
const dataUrls = await page.evaluate(() => {
  const out = {};
  const make = (frames, cell, drawFrame) => {
    const c = document.createElement('canvas');
    c.width = cell * frames; c.height = cell;
    const x = c.getContext('2d');
    x.imageSmoothingEnabled = false;
    for (let f = 0; f < frames; f++) { x.save(); x.translate(f * cell, 0); drawFrame(x, f, cell); x.restore(); }
    return c.toDataURL('image/png');
  };
  // Glassfin — 4-frame swimming wiggle, cyan
  out.glassfin = make(4, 24, (x, f, s) => {
    const wob = Math.sin(f / 4 * Math.PI * 2) * 2;
    x.fillStyle = '#5be7ff';
    x.beginPath(); x.ellipse(s * 0.45, s / 2, s * 0.28, s * 0.18, 0, 0, Math.PI * 2); x.fill();
    x.beginPath(); x.moveTo(s * 0.2, s / 2); x.lineTo(s * 0.05, s / 2 - 5 + wob); x.lineTo(s * 0.05, s / 2 + 5 + wob); x.closePath(); x.fill();
    x.fillStyle = '#012'; x.beginPath(); x.arc(s * 0.6, s / 2, 1.6, 0, Math.PI * 2); x.fill();
  });
  // Carapace (crab) — static, orange tank
  out.crab = make(1, 28, (x, f, s) => {
    x.fillStyle = '#ff9560';
    x.beginPath(); x.ellipse(s / 2, s * 0.55, s * 0.34, s * 0.26, 0, 0, Math.PI * 2); x.fill();
    x.strokeStyle = '#ff9560'; x.lineWidth = 3; x.lineCap = 'round';
    x.beginPath(); x.moveTo(s * 0.25, s * 0.4); x.lineTo(s * 0.12, s * 0.25); x.stroke();
    x.beginPath(); x.moveTo(s * 0.75, s * 0.4); x.lineTo(s * 0.88, s * 0.25); x.stroke();
    x.fillStyle = '#200'; x.beginPath(); x.arc(s * 0.42, s * 0.5, 1.6, 0, 7); x.arc(s * 0.58, s * 0.5, 1.6, 0, 7); x.fill();
  });
  // Vessel (player sub) — static, facing +x (right). angle 0 == nose right.
  out.vessel = make(1, 28, (x, f, s) => {
    const cy = s / 2;
    x.fillStyle = '#2a4a6a'; x.strokeStyle = '#a8e3ff'; x.lineWidth = 1.5;
    x.beginPath();
    x.moveTo(s * 0.78, cy - 6); x.quadraticCurveTo(s * 0.94, cy, s * 0.78, cy + 6);
    x.lineTo(s * 0.3, cy + 7); x.quadraticCurveTo(s * 0.12, cy, s * 0.3, cy - 7);
    x.closePath(); x.fill(); x.stroke();
    x.strokeStyle = '#a8e3ff'; // fins
    x.beginPath(); x.moveTo(s * 0.42, cy - 7); x.lineTo(s * 0.5, cy - 12); x.lineTo(s * 0.58, cy - 7);
    x.moveTo(s * 0.42, cy + 7); x.lineTo(s * 0.5, cy + 12); x.lineTo(s * 0.58, cy + 7); x.stroke();
    x.fillStyle = '#f5e8c0'; x.beginPath(); x.arc(s * 0.66, cy, 2.5, 0, 7); x.fill(); // viewport
  });
  return out;
});

for (const [name, url] of Object.entries(dataUrls)) {
  const b64 = url.split(',')[1];
  fs.writeFileSync(path.join(assets, name + '.png'), Buffer.from(b64, 'base64'));
  console.log('  assets/' + name + '.png');
}
await browser.close();
console.log('done');
