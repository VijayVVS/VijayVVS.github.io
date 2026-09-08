/* ============================================================
   hero-truss.js — the hero background.

   Not a generic particle field. This is a pin-jointed truss:
   nodes connected by members, with load pulses that travel along
   the members and briefly light them up, the way a force diagram
   animates when you step through a load case.

   Design notes:
   - Nodes settle toward an anchor (their "as-designed" position) with
     spring damping, so mouse interaction deflects the structure and
     it recovers — a deflection/rebound, not a swarm.
   - Members render at an opacity proportional to their axial strain,
     so the structure visibly "takes load".
   - Devicepixel-ratio aware, pauses when off-screen or on hidden tab,
     and does nothing at all under prefers-reduced-motion.
   ============================================================ */

export function initTruss(canvas) {
  if (!canvas) return () => {};

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) return () => {};

  const css = getComputedStyle(document.documentElement);
  const ACCENT = (css.getPropertyValue('--accent') || '#c4712e').trim();
  const LINE   = (css.getPropertyValue('--steel') || '#64748b').trim();

  let W = 0, H = 0, dpr = 1;
  let nodes = [], members = [], pulses = [];
  let raf = 0, running = false, t = 0;
  const pointer = { x: -9999, y: -9999, active: false };

  /* ---- Build ------------------------------------------------ */
  // A slightly irregular grid reads as a structure rather than wallpaper.
  function build() {
    nodes = []; members = [];
    const colGap = Math.max(120, Math.min(190, W / 8));
    const rowGap = Math.max(110, Math.min(170, H / 5));
    const cols = Math.ceil(W / colGap) + 2;
    const rows = Math.ceil(H / rowGap) + 2;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        // stagger alternate rows -> triangulation instead of a square grid
        const jitterX = (r % 2) * colGap * 0.5;
        const ax = c * colGap + jitterX - colGap;
        const ay = r * rowGap - rowGap;
        // tiny deterministic wobble so it doesn't look machine-perfect
        const wob = Math.sin(r * 12.9898 + c * 78.233) * 9;
        nodes.push({
          ax: ax + wob, ay: ay + wob * 0.6,
          x: ax + wob,  y: ay + wob * 0.6,
          vx: 0, vy: 0,
          r: r, c: c,
          seed: (r * 31 + c * 17) % 100,
        });
      }
    }

    // Connect each node to near neighbours -> members
    const maxLen = colGap * 1.15;
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dx = nodes[i].ax - nodes[j].ax;
        const dy = nodes[i].ay - nodes[j].ay;
        const len = Math.hypot(dx, dy);
        if (len < maxLen) {
          members.push({ a: i, b: j, rest: len, strain: 0 });
        }
      }
    }
  }

  /* ---- Load pulses ------------------------------------------ */
  // Every so often, send a pulse walking from member to member.
  function spawnPulse() {
    if (!members.length || pulses.length > 5) return;
    pulses.push({
      m: (Math.random() * members.length) | 0,
      p: 0,                       // 0..1 along the member
      speed: 0.006 + Math.random() * 0.008,
      life: 1,
      hops: 3 + ((Math.random() * 4) | 0),
    });
  }

  function stepPulse(pu) {
    pu.p += pu.speed;
    if (pu.p < 1) return true;
    // hop to a member sharing the node we just arrived at
    pu.hops -= 1;
    if (pu.hops <= 0) return false;
    const cur = members[pu.m];
    if (!cur) return false;
    const at = cur.b;
    const candidates = [];
    for (let i = 0; i < members.length; i++) {
      if (i === pu.m) continue;
      if (members[i].a === at || members[i].b === at) candidates.push(i);
    }
    if (!candidates.length) return false;
    pu.m = candidates[(Math.random() * candidates.length) | 0];
    pu.p = 0;
    return true;
  }

  /* ---- Sizing ------------------------------------------------ */
  function resize() {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2); // cap: 3x costs a lot for no gain
    W = rect.width;
    H = rect.height;
    canvas.width  = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    build();
  }

  /* ---- Physics ----------------------------------------------- */
  function update() {
    t += 1;

    for (const n of nodes) {
      // spring back to the anchor position
      let fx = (n.ax - n.x) * 0.018;
      let fy = (n.ay - n.y) * 0.018;

      // slow ambient drift so the structure breathes when idle
      fx += Math.cos((t + n.seed * 7) * 0.006) * 0.012;
      fy += Math.sin((t + n.seed * 5) * 0.005) * 0.012;

      // pointer deflects the structure
      if (pointer.active) {
        const dx = n.x - pointer.x;
        const dy = n.y - pointer.y;
        const d2 = dx * dx + dy * dy;
        const R = 190;
        if (d2 < R * R && d2 > 0.01) {
          const d = Math.sqrt(d2);
          const push = (1 - d / R) * 2.4;
          fx += (dx / d) * push;
          fy += (dy / d) * push;
        }
      }

      n.vx = (n.vx + fx) * 0.90;   // damping
      n.vy = (n.vy + fy) * 0.90;
      n.x += n.vx;
      n.y += n.vy;
    }

    // axial strain per member -> drives its opacity
    for (const m of members) {
      const a = nodes[m.a], b = nodes[m.b];
      const len = Math.hypot(a.x - b.x, a.y - b.y);
      const strain = Math.abs(len - m.rest) / m.rest;
      m.strain += (strain - m.strain) * 0.2;   // smooth
    }

    if (t % 42 === 0) spawnPulse();
    pulses = pulses.filter(stepPulse);
  }

  /* ---- Render ------------------------------------------------ */
  function draw() {
    ctx.clearRect(0, 0, W, H);

    // members
    ctx.lineWidth = 1;
    for (const m of members) {
      const a = nodes[m.a], b = nodes[m.b];
      const load = Math.min(m.strain * 9, 1);
      const alpha = 0.22 + load * 0.6;
      ctx.strokeStyle = load > 0.22 ? hexA(ACCENT, alpha) : hexA(LINE, alpha);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }

    // pulses travelling the members
    for (const pu of pulses) {
      const m = members[pu.m];
      if (!m) continue;
      const a = nodes[m.a], b = nodes[m.b];
      const x = a.x + (b.x - a.x) * pu.p;
      const y = a.y + (b.y - a.y) * pu.p;

      const g = ctx.createRadialGradient(x, y, 0, x, y, 26);
      g.addColorStop(0, hexA(ACCENT, 0.55));
      g.addColorStop(1, hexA(ACCENT, 0));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, 26, 0, Math.PI * 2); ctx.fill();

      ctx.fillStyle = hexA(ACCENT, 0.95);
      ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI * 2); ctx.fill();
    }

    // nodes — small squares, like a joint marker on a drawing
    for (const n of nodes) {
      const disp = Math.hypot(n.x - n.ax, n.y - n.ay);
      const lit = Math.min(disp / 26, 1);
      const s = 1.6 + lit * 1.6;
      ctx.fillStyle = lit > 0.12 ? hexA(ACCENT, 0.25 + lit * 0.6) : hexA(LINE, 0.4);
      ctx.fillRect(n.x - s / 2, n.y - s / 2, s, s);
    }
  }

  function frame() {
    if (!running) return;
    update();
    draw();
    raf = requestAnimationFrame(frame);
  }

  /* ---- Lifecycle --------------------------------------------- */
  function start() { if (!running && !reduce) { running = true; raf = requestAnimationFrame(frame); } }
  function stop()  { running = false; cancelAnimationFrame(raf); }

  const onMove = (e) => {
    const rect = canvas.getBoundingClientRect();
    pointer.x = e.clientX - rect.left;
    pointer.y = e.clientY - rect.top;
    pointer.active = true;
  };
  const onLeave = () => { pointer.active = false; };
  const onVis = () => (document.hidden ? stop() : start());

  resize();

  if (reduce) {
    // Draw one static frame so the hero isn't empty, then stop.
    update(); draw();
    return () => {};
  }

  // Only animate while the hero is actually on screen.
  const io = new IntersectionObserver(
    ([entry]) => (entry.isIntersecting ? start() : stop()),
    { threshold: 0 }
  );
  io.observe(canvas);

  let rt;
  const onResize = () => { clearTimeout(rt); rt = setTimeout(resize, 150); };

  window.addEventListener('resize', onResize, { passive: true });
  window.addEventListener('pointermove', onMove, { passive: true });
  window.addEventListener('pointerleave', onLeave, { passive: true });
  document.addEventListener('visibilitychange', onVis);

  return () => {
    stop(); io.disconnect();
    window.removeEventListener('resize', onResize);
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerleave', onLeave);
    document.removeEventListener('visibilitychange', onVis);
  };
}

/* Accepts #rgb / #rrggbb and returns rgba() at the given alpha. */
function hexA(hex, a) {
  let h = String(hex).trim().replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  if (Number.isNaN(n)) return `rgba(196,113,46,${a})`;
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}
