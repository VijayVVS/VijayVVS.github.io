/* ============================================================
   nav.js — scrollspy, mobile drawer, magnetic buttons, unroll.
   All keyboard-accessible; all state mirrored in ARIA.
   ============================================================ */

const REDUCE = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---- Sticky nav border + scrollspy -------------------------- */
export function initNav() {
  const nav = document.querySelector('.nav');
  const links = [...document.querySelectorAll('.nav-link[href^="#"]')];
  const sections = links
    .map((l) => document.querySelector(l.getAttribute('href')))
    .filter(Boolean);

  const onScroll = () => {
    if (nav) nav.dataset.scrolled = String(window.scrollY > 24);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  if (!sections.length || !('IntersectionObserver' in window)) return () => {};

  // Track which sections are on screen; the topmost visible one wins.
  const visible = new Set();
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) visible.add(e.target);
        else visible.delete(e.target);
      }
      const top = [...visible].sort(
        (a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top
      )[0];
      links.forEach((l) => {
        const on = top && l.getAttribute('href') === `#${top.id}`;
        // aria-current is the accessible signal; CSS keys off it too.
        if (on) l.setAttribute('aria-current', 'true');
        else l.removeAttribute('aria-current');
      });
    },
    { rootMargin: '-45% 0px -50% 0px', threshold: 0 }
  );
  sections.forEach((s) => io.observe(s));

  return () => { io.disconnect(); window.removeEventListener('scroll', onScroll); };
}

/* ---- Mobile drawer ------------------------------------------ */
export function initDrawer() {
  const toggle = document.querySelector('.nav-toggle');
  const drawer = document.querySelector('.nav-links');
  if (!toggle || !drawer) return () => {};

  let lastFocus = null;

  const open = () => {
    lastFocus = document.activeElement;
    // One list serves both layouts, so it is never `hidden` — on desktop CSS
    // shows it inline; on mobile [data-open] turns it into the drawer. That
    // removes the 5 duplicate links that were always unfocusable.
    document.body.dataset.nav = 'open';
    toggle.setAttribute('aria-expanded', 'true');
    document.body.dataset.locked = 'true';
    // move focus into the drawer for keyboard/AT users
    drawer.querySelector('a')?.focus();
  };
  const close = () => {
    delete document.body.dataset.nav;
    toggle.setAttribute('aria-expanded', 'false');
    delete document.body.dataset.locked;
    lastFocus?.focus?.();
  };
  const isOpen = () => toggle.getAttribute('aria-expanded') === 'true';

  toggle.addEventListener('click', () => (isOpen() ? close() : open()));
  drawer.addEventListener('click', (e) => { if (e.target.closest('a')) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && isOpen()) close(); });

  // Trap focus inside the drawer while it's open.
  drawer.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab' || !isOpen()) return;
    const f = [...drawer.querySelectorAll('a')].filter((el) => el.offsetParent !== null);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  close();
  return () => {};
}

/* ---- The scroll / unroll interaction ------------------------ */
export function initUnroll() {
  const units = document.querySelectorAll('.scroll-unit');
  units.forEach((unit) => {
    const head  = unit.querySelector('.scroll-head');
    const sheet = unit.querySelector('.scroll-sheet');
    if (!head || !sheet) return;

    // Wire up ARIA so this behaves like a real disclosure widget.
    const id = sheet.id || `sheet-${Math.random().toString(36).slice(2, 8)}`;
    sheet.id = id;
    head.setAttribute('aria-expanded', 'false');
    head.setAttribute('aria-controls', id);

    head.addEventListener('click', () => {
      const open = unit.dataset.open === 'true';
      unit.dataset.open = String(!open);
      head.setAttribute('aria-expanded', String(!open));

      /* Bring the DRAWING into view, not just the unit.
         Opening a project used to leave its drawing below the fold, so you
         had to scroll to find the thing you just asked to see. Park the
         unit's header just under the nav and the drawing follows on screen. */
      if (!open) {
        setTimeout(() => {
          const r = unit.getBoundingClientRect();
          const navH = 84;
          const wantTop = navH + 12;
          // only move if it is not already sitting well
          if (r.top < navH || r.top > innerHeight * 0.45) {
            const y = window.scrollY + r.top - wantTop;
            window.scrollTo({ top: y, behavior: REDUCE ? 'auto' : 'smooth' });
          }
        }, 300);
      }
    });
  });
  return () => {};
}

/* ---- Magnetic buttons --------------------------------------- */
// Subtle: the control leans toward the cursor, then springs back.
// Skipped entirely on touch (no hover) and under reduced motion.
export function initMagnetic() {
  if (REDUCE || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return () => {};

  const els = document.querySelectorAll('.magnetic');
  const STRENGTH = 0.28;
  const RANGE = 70;

  els.forEach((el) => {
    const move = (e) => {
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      if (Math.hypot(dx, dy) > RANGE + Math.max(r.width, r.height) / 2) {
        el.style.setProperty('--mx', '0px');
        el.style.setProperty('--my', '0px');
        return;
      }
      el.style.setProperty('--mx', `${dx * STRENGTH}px`);
      el.style.setProperty('--my', `${dy * STRENGTH}px`);
    };
    const reset = () => {
      el.style.setProperty('--mx', '0px');
      el.style.setProperty('--my', '0px');
    };
    window.addEventListener('pointermove', move, { passive: true });
    el.addEventListener('pointerleave', reset);
    el.addEventListener('blur', reset);
  });
  return () => {};
}

/* ---- Smooth anchor scrolling with focus handoff -------------- */
// Native smooth scroll doesn't move focus, which strands keyboard users.
export function initAnchors() {
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    const id = a.getAttribute('href');
    if (!id || id === '#') return;
    const target = document.querySelector(id);
    if (!target) return;

    e.preventDefault();

    const go = () => {
      target.scrollIntoView({ behavior: REDUCE ? 'auto' : 'smooth', block: 'start' });
      // Native smooth scroll does not move focus, which strands keyboard users.
      target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
      history.pushState(null, '', id);
    };

    // Same-document view transition where supported; plain jump otherwise.
    if (!REDUCE && document.startViewTransition) document.startViewTransition(go);
    else go();
  });
  return () => {};
}
