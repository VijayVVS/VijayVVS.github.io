/* ============================================================
   main.js — entry point. Wires the modules together.

   Loaded as <script type="module" defer>, so it runs after the
   document is parsed. Everything degrades: if this file fails to
   load, the .no-js rules in motion.css reveal all content anyway.
   ============================================================ */

import { initTruss } from './hero-truss.js';
import { initScene3D } from './scene-3d.js';
import { initReveal, initCounters, initMeters } from './reveal.js';
import { initNav, initDrawer, initUnroll, initMagnetic, initAnchors } from './nav.js';
import { initRail, initTilt, initLoadPath, initCursor, initGhostNumbers, initPreloader, initGalleries } from './sections.js';

const teardown = [];

function boot() {
  // Signals to CSS that JS is alive — flips the no-js fallbacks off.
  document.documentElement.classList.remove('no-js');

  // Hero: prefer the WebGL erection sequence; fall back to the 2D truss if
  // WebGL is unavailable, the CDN is blocked, or the module fails to load.
  const gl2d = document.getElementById('truss-canvas');
  const gl3d = document.getElementById('stage-3d');
  initScene3D(gl3d).then((h) => {
    if (h) {
      teardown.push(h.destroy);
      document.body.dataset.hero = '3d';
    } else {
      document.body.dataset.hero = '2d';
      teardown.push(initTruss(gl2d));
    }
  }).catch(() => {
    document.body.dataset.hero = '2d';
    teardown.push(initTruss(gl2d));
  });
  teardown.push(initReveal());
  teardown.push(initCounters());
  teardown.push(initMeters());
  teardown.push(initNav());
  teardown.push(initDrawer());
  teardown.push(initUnroll());
  teardown.push(initMagnetic());
  teardown.push(initAnchors());

  // Section-level choreography
  teardown.push(initPreloader());
  teardown.push(initRail());
  teardown.push(initTilt());
  teardown.push(initLoadPath());
  teardown.push(initGhostNumbers());
  teardown.push(initCursor());
  teardown.push(initGalleries());

  // Trigger the hero line-mask entrance on the next frame so the
  // transition has a start state to animate from.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => document.body.classList.add('is-loaded'));
  });

  // Set the footer year from the clock rather than hardcoding it.
  const y = document.getElementById('year');
  if (y) y.textContent = String(new Date().getFullYear());
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}

// Clean up on navigation away (matters for bfcache restores).
window.addEventListener('pagehide', () => {
  teardown.forEach((fn) => { try { fn && fn(); } catch (_) {} });
});
