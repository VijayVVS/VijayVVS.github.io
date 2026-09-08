/* ============================================================
   sections.js — the section-level choreography.

   Built without GSAP on purpose: the site is zero-build and ships from
   GitHub Pages, and every effect here is a scroll-position -> transform
   mapping that does not need a 70KB timeline engine. Same scroll-progress
   pattern as the hero, so behaviour is consistent across the page.

   Pin budget: ui-ux-pro-max motion data warns "don't pin more than 1-2
   sections per page". The hero holds one. The horizontal rail holds the
   other. Nothing else pins.
   ============================================================ */

const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;
const FINE   = matchMedia('(hover: hover) and (pointer: fine)').matches;

/* ------------------------------------------------------------------
   1. HORIZONTAL RAIL — pin #2
   The section is a vertical runway; the stage pins and the track slides
   sideways. Scroll distance is derived from the track's real width so the
   mapping is exact at any viewport.
   ------------------------------------------------------------------ */
export function initRail() {
  const rail = document.querySelector('.rail');
  if (!rail) return () => {};
  const stage = rail.querySelector('.rail-stage');
  const track = rail.querySelector('.rail-track');
  if (!stage || !track) return () => {};

  let travel = 0;

  function measure() {
    // How far the track must slide for its last card to reach the right edge.
    travel = Math.max(track.scrollWidth - stage.clientWidth, 0);
    // Runway = one viewport to pin + the horizontal distance to cover.
    rail.style.height = `${window.innerHeight + travel}px`;
    if (REDUCE) {
      rail.style.height = '';
      track.style.transform = '';
    }
  }

  let x = 0, tx = 0, raf = 0, running = false;

  function frame() {
    if (!running) return;
    x += (tx - x) * 0.12;                       // easing gives it weight
    track.style.transform = `translate3d(${-x}px,0,0)`;
    // Parallax the card interiors slightly against the slide.
    const p = travel ? x / travel : 0;
    track.style.setProperty('--rail-p', p.toFixed(4));
    if (Math.abs(tx - x) > 0.2) raf = requestAnimationFrame(frame);
    else running = false;
  }

  function onScroll() {
    if (REDUCE || !travel) return;
    const r = rail.getBoundingClientRect();
    const prog = Math.min(Math.max(-r.top / travel, 0), 1);
    tx = prog * travel;
    if (!running) { running = true; raf = requestAnimationFrame(frame); }
  }

  // Fonts and images change the track width, so re-measure once settled.
  measure();
  if (document.fonts?.ready) document.fonts.ready.then(measure);
  addEventListener('load', measure);

  let rt;
  const onResize = () => { clearTimeout(rt); rt = setTimeout(() => { measure(); onScroll(); }, 150); };
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', onResize, { passive: true });
  onScroll();

  return () => {
    cancelAnimationFrame(raf);
    removeEventListener('scroll', onScroll);
    removeEventListener('resize', onResize);
    removeEventListener('load', measure);
  };
}

/* ------------------------------------------------------------------
   2. 3D TILT — cards lean toward the cursor.
   Pointer-fine only; touch gets nothing (there is no hover to key off)
   and reduced-motion gets nothing.
   ------------------------------------------------------------------ */
export function initTilt() {
  if (REDUCE || !FINE) return () => {};
  const els = document.querySelectorAll('[data-tilt]');
  const MAX = 9;                                 // degrees; more reads as a gimmick

  els.forEach((el) => {
    let raf = 0;
    const move = (e) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width  - 0.5;
        const py = (e.clientY - r.top)  / r.height - 0.5;
        el.style.setProperty('--rx', `${(-py * MAX).toFixed(2)}deg`);
        el.style.setProperty('--ry', `${( px * MAX).toFixed(2)}deg`);
        // move the specular sheen with the pointer
        el.style.setProperty('--gx', `${((px + 0.5) * 100).toFixed(1)}%`);
        el.style.setProperty('--gy', `${((py + 0.5) * 100).toFixed(1)}%`);
      });
    };
    const reset = () => {
      cancelAnimationFrame(raf);
      el.style.setProperty('--rx', '0deg');
      el.style.setProperty('--ry', '0deg');
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerleave', reset);
    el.addEventListener('blur', reset, true);
  });
  return () => {};
}

/* ------------------------------------------------------------------
   3. LOAD-PATH TIMELINE
   The spine draws downward as you scroll, and each node "takes load" —
   fills orange — as it is passed. It reads as a force travelling down a
   column line rather than a generic progress bar.
   ------------------------------------------------------------------ */
export function initLoadPath() {
  const tl = document.querySelector('.timeline');
  if (!tl) return () => {};
  const spine = tl.querySelector('.tl-spine');
  const items = [...tl.querySelectorAll('.tl-item')];
  if (!spine) return () => {};

  if (REDUCE) {
    spine.style.transform = 'scaleY(1)';
    items.forEach((i) => i.classList.add('loaded'));
    return () => {};
  }

  function onScroll() {
    const r = tl.getBoundingClientRect();
    const vh = window.innerHeight;
    // 0 when the timeline top hits 75% of the viewport, 1 when its bottom does
    const p = Math.min(Math.max((vh * 0.75 - r.top) / (r.height || 1), 0), 1);
    spine.style.transform = `scaleY(${p.toFixed(4)})`;
    const front = r.top + r.height * p;
    items.forEach((it) => {
      const ir = it.getBoundingClientRect();
      it.classList.toggle('loaded', ir.top <= front + 8);
    });
  }
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', onScroll, { passive: true });
  onScroll();
  return () => {
    removeEventListener('scroll', onScroll);
    removeEventListener('resize', onScroll);
  };
}

/* ------------------------------------------------------------------
   4. CUSTOM CURSOR — a survey crosshair.
   Pointer-fine only. The real cursor is NEVER hidden on interactive
   elements without a replacement; here the native cursor stays visible
   and this rides alongside it, so nothing is lost if the script fails.
   ------------------------------------------------------------------ */
export function initCursor() {
  if (REDUCE || !FINE) return () => {};

  const el = document.createElement('div');
  el.className = 'cursor';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = '<span class="cursor-h"></span><span class="cursor-v"></span><span class="cursor-ring"></span>';
  document.body.appendChild(el);

  let x = innerWidth / 2, y = innerHeight / 2, tx = x, ty = y, raf = 0;

  const loop = () => {
    x += (tx - x) * 0.22;
    y += (ty - y) * 0.22;
    el.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`;
    raf = requestAnimationFrame(loop);
  };
  const move = (e) => { tx = e.clientX; ty = e.clientY; };
  const over = (e) => {
    const hot = e.target.closest('a, button, [role="button"], .scroll-head, [data-tilt]');
    el.dataset.hot = hot ? 'true' : 'false';
  };

  addEventListener('pointermove', move, { passive: true });
  addEventListener('pointerover', over, { passive: true });
  addEventListener('pointerdown', () => (el.dataset.down = 'true'));
  addEventListener('pointerup', () => (el.dataset.down = 'false'));
  raf = requestAnimationFrame(loop);

  return () => {
    cancelAnimationFrame(raf);
    removeEventListener('pointermove', move);
    removeEventListener('pointerover', over);
    el.remove();
  };
}

/* ------------------------------------------------------------------
   5. SECTION INDEX — the oversized brutalist section number parallaxes
   against its heading as the section passes.
   ------------------------------------------------------------------ */
export function initGhostNumbers() {
  if (REDUCE) return () => {};
  const ghosts = [...document.querySelectorAll('.section-ghost')];
  if (!ghosts.length) return () => {};

  function onScroll() {
    const vh = innerHeight;
    for (const g of ghosts) {
      const r = g.getBoundingClientRect();
      if (r.bottom < -200 || r.top > vh + 200) continue;
      const p = (vh - r.top) / (vh + r.height);   // 0..1 across the viewport
      g.style.transform = `translate3d(0, ${((0.5 - p) * 90).toFixed(1)}px, 0)`;
    }
  }
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();
  return () => removeEventListener('scroll', onScroll);
}

/* ------------------------------------------------------------------
   6. PRELOADER
   Held only until fonts + first paint are ready, with a hard 2.5s cap so
   it can never become the reason someone never sees the page.
   ------------------------------------------------------------------ */
export function initPreloader() {
  const pre = document.querySelector('.preloader');
  if (!pre) return () => {};

  const done = () => {
    pre.dataset.done = 'true';
    document.body.classList.add('is-ready');
    setTimeout(() => pre.remove(), 900);
  };

  if (REDUCE) { done(); return () => {}; }

  const cap = setTimeout(done, 2500);
  const ready = document.fonts?.ready ?? Promise.resolve();
  ready.then(() => {
    // one extra frame so the first real paint lands under the curtain
    requestAnimationFrame(() => requestAnimationFrame(() => {
      clearTimeout(cap);
      setTimeout(done, 260);
    }));
  });
  return () => clearTimeout(cap);
}

/* ------------------------------------------------------------------
   DRAWING GALLERIES
   Crane gantry has 2 drawings, shopfront has 3. Keyboard operable,
   announces position, and works with the sheet collapsed or open.
   ------------------------------------------------------------------ */
export function initGalleries(root = document) {
  root.querySelectorAll('[data-gallery]').forEach((gal) => {
    const slides = [...gal.querySelectorAll('.gal-slide')];
    const dots   = [...gal.querySelectorAll('.gal-dot')];
    const prev   = gal.querySelector('.gal-nav.prev');
    const next   = gal.querySelector('.gal-nav.next');
    if (slides.length < 2) return;

    let i = 0;
    const show = (n) => {
      i = (n + slides.length) % slides.length;
      slides.forEach((s, k) => s.classList.toggle('is-active', k === i));
      dots.forEach((d, k) => {
        d.classList.toggle('is-active', k === i);
        d.setAttribute('aria-current', k === i ? 'true' : 'false');
      });
    };

    prev?.addEventListener('click', (e) => { e.stopPropagation(); show(i - 1); });
    next?.addEventListener('click', (e) => { e.stopPropagation(); show(i + 1); });
    dots.forEach((d, k) => d.addEventListener('click', (e) => { e.stopPropagation(); show(k); }));

    gal.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft')  { e.preventDefault(); show(i - 1); }
      if (e.key === 'ArrowRight') { e.preventDefault(); show(i + 1); }
    });
    show(0);
  });
  return () => {};
}
