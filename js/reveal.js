/* ============================================================
   reveal.js — scroll-triggered entrance choreography.

   CSS owns how a reveal looks ([data-reveal] in motion.css);
   this owns only *when* it fires and the stagger index.

   Anything inside [data-stagger] gets an incremental --i so a row
   of cards cascades instead of popping in together.
   ============================================================ */

const REDUCE = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function initReveal(root = document) {
  const targets = root.querySelectorAll('[data-reveal], [data-draw], [data-draw-y]');

  // Reduced motion (or no IO support): show everything immediately.
  if (REDUCE || !('IntersectionObserver' in window)) {
    targets.forEach((el) => el.classList.add('is-in'));
    return () => {};
  }

  // Assign stagger indices within each group.
  root.querySelectorAll('[data-stagger]').forEach((group) => {
    const step = Number(group.dataset.stagger) || 1;
    [...group.children].forEach((child, i) => {
      const el = child.matches('[data-reveal]') ? child : child.querySelector('[data-reveal]');
      if (el && !el.style.getPropertyValue('--i')) {
        el.style.setProperty('--i', String(i * step));
      }
    });
  });

  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-in');
        io.unobserve(entry.target);            // one-shot: no re-animation on scroll-up
      }
    },
    {
      // Fire slightly before the element is fully in view so the
      // motion completes as it arrives, rather than after.
      rootMargin: '0px 0px -12% 0px',
      threshold: 0.05,
    }
  );

  targets.forEach((el) => io.observe(el));

  /* ---- Safety nets -------------------------------------------------
     Reveal-on-scroll must never be the ONLY way content becomes visible.
     Without these, a full-page screenshot, a print, a crawler that does
     not scroll, or any hiccup in IO leaves most of the page blank. */

  const revealAll = () => {
    targets.forEach((el) => el.classList.add('is-in'));
    io.disconnect();
  };

  // 1. Anything already at or above the fold on load reveals immediately.
  requestAnimationFrame(() => {
    targets.forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.top < window.innerHeight * 0.95) el.classList.add('is-in');
    });
  });

  // 2. Printing reveals everything.
  if (window.matchMedia) {
    const mq = window.matchMedia('print');
    mq.addEventListener?.('change', (e) => e.matches && revealAll());
  }
  window.addEventListener('beforeprint', revealAll);

  // 3. Hard backstop. 2.5s is a deliberate trade: long enough that a user
  //    scrolling normally still meets each section as it animates in, short
  //    enough that screenshotters, crawlers and PDF exporters — which never
  //    scroll — capture a fully rendered page instead of empty panels.
  const backstop = setTimeout(revealAll, 2500);

  return () => { clearTimeout(backstop); io.disconnect(); };
}

/* ------------------------------------------------------------
   Count-up for the hero stats. Respects reduced motion by
   jumping straight to the final value.
   ------------------------------------------------------------ */
export function initCounters(root = document) {
  const els = root.querySelectorAll('[data-count]');
  if (!els.length) return () => {};

  const run = (el) => {
    const raw = el.dataset.count;                 // e.g. "40+", "$15M+", "150K+"
    const num = parseFloat(raw.replace(/[^0-9.]/g, ''));
    if (!Number.isFinite(num)) { el.textContent = raw; return; }

    const prefix = (raw.match(/^[^0-9.]*/) || [''])[0];
    const suffix = (raw.match(/[^0-9.]*$/) || [''])[0];
    const dur = 1500;
    const t0 = performance.now();

    const tick = (now) => {
      const p = Math.min((now - t0) / dur, 1);
      // expo-out matches --e-out so numbers decelerate like the motion
      const eased = 1 - Math.pow(2, -10 * p);
      const v = num * (p === 1 ? 1 : eased);
      const shown = num % 1 === 0 ? Math.round(v) : v.toFixed(1);
      el.textContent = `${prefix}${shown}${suffix}`;
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };

  if (REDUCE || !('IntersectionObserver' in window)) {
    els.forEach((el) => { el.textContent = el.dataset.count; });
    return () => {};
  }

  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        run(e.target);
        io.unobserve(e.target);
      }
    },
    { threshold: 0.6 }
  );
  els.forEach((el) => io.observe(el));
  return () => io.disconnect();
}

/* ------------------------------------------------------------
   Skill meters fill when scrolled into view.
   ------------------------------------------------------------ */
export function initMeters(root = document) {
  const fills = root.querySelectorAll('.meter-fill[data-level]');
  if (!fills.length) return () => {};

  const set = (el) => {
    el.style.transform = `scaleX(${Number(el.dataset.level) || 0})`;
  };

  if (REDUCE || !('IntersectionObserver' in window)) {
    fills.forEach(set);
    return () => {};
  }

  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        set(e.target);
        io.unobserve(e.target);
      }
    },
    { threshold: 0.4 }
  );
  fills.forEach((el) => io.observe(el));
  return () => io.disconnect();
}
