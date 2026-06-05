// Headless browser environment mock for Abyssal Vessel.
//
// The game is a single self-contained index.html with one inline <script>.
// These tests extract that script and run it in Node against a fake DOM +
// canvas so we can catch crashes, cap violations and sanitizer regressions
// WITHOUT a real browser. See test/README.md.
//
// The canvas context mock is deliberately strict: it THROWS on the exact
// inputs a real browser rejects (negative / non-finite radii, out-of-range
// globalAlpha). The game wraps its raw context in a sanitizing Proxy, so if
// any bad value reaches us here, that Proxy has regressed.

import fs from 'node:fs';
import vm from 'node:vm';

const bad = (v) => typeof v !== 'number' || !isFinite(v);

function makeCtx() {
  const grad = { addColorStop() {} };
  const ctx = {
    // state we don't care about the value of, but must accept
    fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, lineCap: 'butt',
    font: '10px sans-serif', textAlign: 'left', shadowBlur: 0, shadowColor: '#000',
    _alpha: 1,
    get globalAlpha() { return this._alpha; },
    set globalAlpha(v) {
      if (bad(v) || v < 0 || v > 1) throw new Error('globalAlpha out of range: ' + v);
      this._alpha = v;
    },
    save() {}, restore() {}, beginPath() {}, closePath() {}, fill() {}, stroke() {},
    moveTo() {}, lineTo() {}, quadraticCurveTo() {}, fillText() {}, fillRect() {},
    translate() {}, rotate() {}, setTransform() {},
    arc(x, y, r) { if (bad(r) || r < 0) throw new Error('arc radius invalid: ' + r); },
    ellipse(x, y, rx, ry) {
      if (bad(rx) || rx < 0) throw new Error('ellipse rx invalid: ' + rx);
      if (bad(ry) || ry < 0) throw new Error('ellipse ry invalid: ' + ry);
    },
    createRadialGradient(x0, y0, r0, x1, y1, r1) {
      if (bad(r0) || r0 < 0) throw new Error('radialGradient r0 invalid: ' + r0);
      if (bad(r1) || r1 < 0) throw new Error('radialGradient r1 invalid: ' + r1);
      return grad;
    },
    createLinearGradient() { return grad; },
  };
  return ctx;
}

function makeElement(id) {
  const handlers = {};
  const el = {
    id, tagName: 'DIV', textContent: '', className: '',
    width: 0, height: 0,
    style: {},
    dataset: {},
    children: [],
    _html: '',
    get innerHTML() { return this._html; },
    set innerHTML(v) { this._html = v; if (v === '') this.children = []; },
    classList: {
      _set: new Set(),
      add(...c) { c.forEach(x => this._set.add(x)); },
      remove(...c) { c.forEach(x => this._set.delete(x)); },
      contains(c) { return this._set.has(c); },
      toggle(c) { this._set.has(c) ? this._set.delete(c) : this._set.add(c); },
    },
    appendChild(child) { this.children.push(child); return child; },
    getBoundingClientRect() { return { left: 0, top: 0, width: 800, height: 600 }; },
    setAttribute() {},
    addEventListener(type, fn) { (handlers[type] = handlers[type] || []).push(fn); },
    removeEventListener(type, fn) {
      if (handlers[type]) handlers[type] = handlers[type].filter(f => f !== fn);
    },
    getContext() { return makeCtx(); },
    // test helper: fire a synthetic event at this element
    _fire(type, ev = {}) { (handlers[type] || []).forEach(fn => fn(Object.assign({ preventDefault() {}, target: el }, ev))); },
  };
  return el;
}

// Builds a fresh sandboxed environment, evaluates the game script in it, and
// returns handles for driving the loop and inspecting state.
export function createEnv(scriptText) {
  const elements = {};
  const getEl = (id) => (elements[id] = elements[id] || makeElement(id));

  let now = 0;                 // virtual clock (ms)
  let rafQueue = [];           // requestAnimationFrame callbacks
  let timers = [];             // setTimeout queue {time, fn}
  let nextId = 1;
  const winHandlers = {};

  const win = {
    innerWidth: 800, innerHeight: 600, devicePixelRatio: 1,
    addEventListener(type, fn) { (winHandlers[type] = winHandlers[type] || []).push(fn); },
    removeEventListener() {},
    __avExpose: true,          // ask the game to expose internals for assertions
  };

  const documentMock = {
    getElementById: getEl,
    createElement: () => makeElement('created'),
    addEventListener(type, fn) { (winHandlers[type] = winHandlers[type] || []).push(fn); },
  };

  const sandbox = {
    window: win,
    document: documentMock,
    performance: { now: () => now },
    requestAnimationFrame: (fn) => { rafQueue.push(fn); return nextId++; },
    cancelAnimationFrame: () => {},
    setTimeout: (fn, ms) => { timers.push({ time: now + (ms || 0), fn }); return nextId++; },
    clearTimeout: () => {},
    console: { log() {}, warn() {}, error() {} },
    Math, Date, JSON, Object, Array, Set, Map, Infinity, NaN, isFinite, parseInt, parseFloat,
  };
  sandbox.window.requestAnimationFrame = sandbox.requestAnimationFrame;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(scriptText, sandbox, { filename: 'game.js' });

  // Advance the virtual clock by one frame, firing due timers then the RAF
  // driver (which re-queues itself, exactly like a browser).
  function frame(dtMs = 1000 / 60) {
    now += dtMs;
    let safety = 0;
    while (true) {
      const due = timers.filter(t => t.time <= now);
      if (!due.length) break;
      timers = timers.filter(t => t.time > now);
      due.sort((a, b) => a.time - b.time).forEach(t => { try { t.fn(); } catch (e) { throw e; } });
      if (++safety > 50) break;
    }
    const cbs = rafQueue; rafQueue = [];
    cbs.forEach(fn => fn(now));
  }

  return {
    win, document: documentMock, getEl, frame,
    get state() { return win.__av ? win.__av.G.state : null; },
    get av() { return win.__av; },
    fireOn(id, type, ev) { getEl(id)._fire(type, ev); },
  };
}

export function extractScript(htmlPath) {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const m = html.match(/<script>([\s\S]*?)<\/script>/);
  if (!m) throw new Error('No inline <script> found in ' + htmlPath);
  return m[1];
}
