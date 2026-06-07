// Balance analysis for Abyssal Vessel.
//
// Cross-archetype weapon balancing can't be reduced to one perfect number, so
// this uses a documented, repeatable model and reports a COMPOSITE power score
// per weapon per level. The goal is not identical weapons — it's that no weapon
// is a clear outlier on overall output. Identity (cadence, range, area, single-
// vs multi-target) is preserved; we mostly move per-level `dmg`.
//
// Two axes, blended 50/50:
//   ST   = sustained damage to ONE focused target (the boss/tank axis)
//   AREA = sustained damage across a typical local cluster (the horde axis),
//          crediting AoE/multi-hit up to a capped cluster size.
// Persistent entities (spires/voids/orbiters/drones/mines/clouds) are scored at
// realistic steady-state uptime. All at cdr=1, area=1, no artifacts/bonuses.
//
// Run: node test/balance.mjs   (after `bash test/check.sh` has built nothing —
// it loads index.html directly via the mock env).

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createEnv, extractScript } from './mock-env.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const env = createEnv(extractScript(path.join(__dirname, '..', 'index.html')));
const W = env.av.WEAPONS;

const CLUSTER = 4;   // enemies a baseline (r~140) AoE hit splashes
const LINE = 5;      // enemies a piercing line/beam catches
const cap = (n, m) => Math.min(n, m);
// Wide-radius sweeps splash more than small ones; scale cluster credit by
// radius (capped) so big rings/auras aren't under-rated.
const areaTargets = (r) => Math.min(12, CLUSTER * Math.pow((r || 140) / 140, 1.5));

// effective cooldown at cdr=1
const cd = (def, s) => def.baseCD * (s.cdMult || 1);

// Per-weapon model: returns { st, area } sustained DPS for a level `s`.
// Each is documented inline. Keep these honest; tune game numbers, not these.
const MODEL = {
  // ring hits everything once per cast (radius-scaled splash)
  sonar_pulse:    (s, d) => ({ st: s.dmg / cd(d, s),                 area: s.dmg * areaTargets(s.radius) / cd(d, s) }),
  // `count` implosions; focus eats ~1, cluster eats count×splash
  pressure_wave:  (s, d) => ({ st: s.dmg / cd(d, s),                 area: s.dmg * cap(s.count * areaTargets(s.radius), 12) / cd(d, s) }),
  // chains to distinct targets: focus hit once, cluster = chains
  bioelectric_arc:(s, d) => ({ st: s.dmg / cd(d, s),                 area: s.dmg * s.chains / cd(d, s) }),
  // homing, pierce 1: ~2 converge on a focus, cluster = count
  parasite_swarm: (s, d) => ({ st: s.dmg * 2 / cd(d, s),             area: s.dmg * s.count / cd(d, s) }),
  // forward fan, pierce: ~1 torpedo on focus, cluster = count×pierce
  torpedo_array:  (s, d) => ({ st: s.dmg / cd(d, s),                 area: s.dmg * cap(s.count * s.pierce, 12) / cd(d, s) }),
  // aura around player; ticks×dmg per cast to everyone inside the whole burst
  thermal_vent:   (s, d) => ({ st: s.dmg * s.ticks / cd(d, s),       area: s.dmg * s.ticks * areaTargets(s.radius) / cd(d, s) }),
  // beams target distinct foes; focus = 1 beam, cluster = beams×line
  photophore_lance:(s, d) => ({ st: s.dmg / cd(d, s),               area: s.dmg * cap(s.beams * LINE, 12) / cd(d, s) }),
  // DoT cloud: dur/tickRate ticks of dmg per cast (focus in cloud); +slow utility (not scored)
  ink_plume:      (s, d) => { const ticks = s.dur / s.tickRate; return { st: s.dmg * ticks / cd(d, s) * 0.6, area: s.dmg * ticks * areaTargets(s.radius) / cd(d, s) * 0.6 }; },
  // persistent spires: steady alive ≈ count×dur/cd; in-range uptime 0.6; a focus is reachable by ≤3
  coral_spire:    (s, d) => { const alive = cap(s.count * s.dur / d.baseCD, s.count * 3); const per = s.dmg / s.fireCD * 0.6; return { st: cap(alive, 3) * per, area: alive * per }; },
  // persistent voids: steady alive ≈ count×dur/cd; ticks dmg every 0.2s in dmgR; escapable → 0.6 uptime
  voidwater_orb:  (s, d) => { const alive = cap(s.count * s.dur / d.baseCD, s.count * 3); const per = s.dmg / 0.2 * 0.6; return { st: cap(alive, 2) * per, area: alive * per * areaTargets(s.dmgR) / CLUSTER }; },
  // orbiters: always `count`; per-enemy contact ~every 0.6s; a focus meets ≤3
  orbital_ring:   (s, d) => { const per = s.dmg / 0.6; return { st: cap(s.count, 3) * per * 0.6, area: s.count * per }; },
  // drones: always `count`, each fires at nearest every fireRate; focus meets ≤3
  drone_gun:      (s, d) => { const per = s.dmg / s.fireRate; return { st: cap(s.count, 3) * per, area: s.count * per }; },
  // mines: `count` per drop every cd, each one blast in radius
  prox_mine:      (s, d) => ({ st: s.dmg / cd(d, s),                 area: s.dmg * cap(s.count * areaTargets(s.radius), 12) / cd(d, s) }),
};
// evolution models reuse base archetypes
MODEL.refraction_lattice = (s, d) => ({ st: s.dmg * 2 / cd(d, s), area: s.dmg * cap(s.beams * LINE, 14) / cd(d, s) });
MODEL.drowning_dark = (s, d) => { const ticks = s.dur / s.tickRate; return { st: s.dmg * ticks / cd(d, s) * 0.7, area: s.dmg * ticks * areaTargets(s.radius) / cd(d, s) * 0.7 }; };
MODEL.resonance_collapse = (s, d) => { const main = s.dmg / cd(d, s); const imp = s.implosionDmg * s.implosions / cd(d, s); return { st: main + imp, area: (main + imp) * CLUSTER }; };
MODEL.arc_furnace = MODEL.bioelectric_arc;
MODEL.drone_hive = MODEL.parasite_swarm;
MODEL.black_reef = MODEL.coral_spire;
MODEL.calling_depth = (s, d) => { const per = s.count * s.dmg / 0.2 * 0.6; return { st: cap(s.count, 2) * (s.dmg / 0.2) * 0.6, area: per * areaTargets(s.dmgR) / CLUSTER }; };
MODEL.halo_array = MODEL.orbital_ring;
MODEL.swarm_fleet = MODEL.drone_gun;
MODEL.abyssal_minefield = MODEL.prox_mine;

const composite = (m) => 0.5 * m.st + 0.5 * m.area;

function scoreOf(id, lvlIndex) {
  const def = W[id];
  const s = def.levels[lvlIndex];
  if (!s) return null;
  const m = MODEL[id](s, def);
  return { st: m.st, area: m.area, c: composite(m) };
}

// ---- Base weapons: composite per level + max-level spread ----
const base = Object.keys(W).filter(id => !W[id].evolution);
console.log('\nBASE WEAPONS — composite power by level (ST | AREA):');
const maxScores = [];
for (const id of base) {
  const cells = [];
  for (let l = 0; l < W[id].maxLevel; l++) {
    const sc = scoreOf(id, l);
    cells.push(sc ? `${sc.c.toFixed(0).padStart(4)}` : '   -');
  }
  const top = scoreOf(id, W[id].maxLevel - 1);
  maxScores.push({ id, c: top.c, st: top.st, area: top.area });
  console.log(`  ${id.padEnd(18)} L: ${cells.join(' ')}   max ST=${top.st.toFixed(0)} AREA=${top.area.toFixed(0)}`);
}
maxScores.sort((a, b) => b.c - a.c);
const cs = maxScores.map(m => m.c);
const med = cs.slice().sort((a, b) => a - b)[Math.floor(cs.length / 2)];
console.log('\nMAX-LEVEL composite, ranked:');
for (const m of maxScores) console.log(`  ${m.id.padEnd(18)} ${m.c.toFixed(0).padStart(5)}   (${(m.c / med * 100).toFixed(0)}% of median)`);
console.log(`\n  median=${med.toFixed(0)}  min=${Math.min(...cs).toFixed(0)}  max=${Math.max(...cs).toFixed(0)}  spread=${(Math.max(...cs) / Math.min(...cs)).toFixed(2)}x`);

// ---- Evolutions vs the sum of their two parents at max level ----
console.log('\nEVOLUTIONS vs sum of parents (target: 80-100% of parent sum):');
for (const r of env.av.EVOLUTIONS) {
  const evo = scoreOf(r.to, 0);
  const p0 = scoreOf(r.from[0], W[r.from[0]].maxLevel - 1);
  const p1 = scoreOf(r.from[1], W[r.from[1]].maxLevel - 1);
  const sum = p0.c + p1.c;
  console.log(`  ${r.to.padEnd(20)} ${evo.c.toFixed(0).padStart(5)} vs ${sum.toFixed(0).padStart(5)}  = ${(evo.c / sum * 100).toFixed(0)}%   [${r.from.join('+')}]`);
}
