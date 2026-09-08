/* ============================================================
   hero-3d.js — WebGL hero: a steel frame that erects itself.

   The concept: rather than an abstract 3D object, the hero builds a
   real portal-framed industrial bay in true construction sequence —
   pad foundations, columns, rafters, purlins, then bracing — driven
   by scroll position. The camera orbits as it goes.

   It reads as a drawing coming off the board and standing up.

   Everything degrades:
     - no WebGL / context lost  -> caller falls back to the 2D truss
     - prefers-reduced-motion   -> renders one finished static frame
     - hero off screen / tab hidden -> loop parks
   ============================================================ */

const CDN = 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

export async function initHero3D(canvas) {
  if (!canvas) return null;

  // Cheap capability probe before we pay for a 600KB module.
  try {
    const test = document.createElement('canvas');
    const gl = test.getContext('webgl2') || test.getContext('webgl');
    if (!gl) return null;
  } catch { return null; }

  let THREE;
  try {
    THREE = await import(/* @vite-ignore */ CDN);
  } catch {
    return null;                       // offline or CDN blocked -> 2D truss
  }

  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const css = getComputedStyle(document.documentElement);
  const val = (n, f) => (css.getPropertyValue(n) || f).trim();

  const ACCENT = new THREE.Color(val('--accent', '#c3490a'));
  // Light ground: the frame must read as DARK ink on a pale sheet, like a
  // drawing, not as lit metal in a dark room. Steel goes near-slate and the
  // lighting flips from dramatic rim-light to flat, even, technical light.
  const STEEL  = new THREE.Color(val('--steel-dark', '#475569'));
  const GROUND = new THREE.Color(val('--page-bg', '#f8fafc'));

  /* ---- Scene ------------------------------------------------- */
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(GROUND, 30, 78);

  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);

  const renderer = new THREE.WebGLRenderer({
    canvas, antialias: true, alpha: true, powerPreference: 'high-performance',
  });
  renderer.setClearColor(0x000000, 0);

  /* ---- Lights ------------------------------------------------ */
  // Even, high ambient — a drawing office, not a night site.
  scene.add(new THREE.AmbientLight(0xffffff, 1.35));

  const key = new THREE.DirectionalLight(0xffffff, 1.1);
  key.position.set(9, 14, 7);
  scene.add(key);

  // Cool fill from below-left stops the undersides going muddy on white.
  const fill = new THREE.DirectionalLight(0xdbe4ee, 0.7);
  fill.position.set(-10, 3, -8);
  scene.add(fill);

  /* ---- Ground grid (the drawing sheet) ----------------------- */
  const grid = new THREE.GridHelper(70, 35, ACCENT, 0x94a3b8);
  grid.material.transparent = true;
  grid.material.opacity = 0.5;
  grid.position.y = -0.01;
  scene.add(grid);

  /* ---- Structure definition ----------------------------------
     A three-bay portal frame. Members are declared in the order a
     steel erector would actually build them, and `seq` is the slot
     in the erection sequence.                                     */
  const BAYS = 3, SPAN = 9, HEIGHT = 5.2, PITCH = 1.9, BAY = 5;
  const members = [];
  const add = (seq, type, a, b, size) => members.push({ seq, type, a, b, size });

  const zAt = (i) => (i - (BAYS) / 2) * BAY;

  for (let i = 0; i <= BAYS; i++) {
    const z = zAt(i);
    // 1. pad foundations
    add(0, 'pad', [-SPAN / 2, -0.35, z], [-SPAN / 2, 0.05, z], 1.5);
    add(0, 'pad', [ SPAN / 2, -0.35, z], [ SPAN / 2, 0.05, z], 1.5);
    // 2. columns
    add(1, 'col', [-SPAN / 2, 0, z], [-SPAN / 2, HEIGHT, z], 0.34);
    add(1, 'col', [ SPAN / 2, 0, z], [ SPAN / 2, HEIGHT, z], 0.34);
    // 3. rafters to the apex
    add(2, 'raf', [-SPAN / 2, HEIGHT, z], [0, HEIGHT + PITCH, z], 0.26);
    add(2, 'raf', [ SPAN / 2, HEIGHT, z], [0, HEIGHT + PITCH, z], 0.26);
  }

  // 4. purlins / eaves ties running the length
  for (let i = 0; i < BAYS; i++) {
    const z1 = zAt(i), z2 = zAt(i + 1);
    add(3, 'pur', [-SPAN / 2, HEIGHT, z1], [-SPAN / 2, HEIGHT, z2], 0.15);
    add(3, 'pur', [ SPAN / 2, HEIGHT, z1], [ SPAN / 2, HEIGHT, z2], 0.15);
    add(3, 'pur', [0, HEIGHT + PITCH, z1], [0, HEIGHT + PITCH, z2], 0.15);
    add(3, 'pur', [-SPAN / 4, HEIGHT + PITCH / 2, z1], [-SPAN / 4, HEIGHT + PITCH / 2, z2], 0.12);
    add(3, 'pur', [ SPAN / 4, HEIGHT + PITCH / 2, z1], [ SPAN / 4, HEIGHT + PITCH / 2, z2], 0.12);
  }

  // 5. cross bracing in the end bays — the last thing to go in
  add(4, 'brc', [-SPAN / 2, 0, zAt(0)], [-SPAN / 2, HEIGHT, zAt(1)], 0.1);
  add(4, 'brc', [-SPAN / 2, HEIGHT, zAt(0)], [-SPAN / 2, 0, zAt(1)], 0.1);
  add(4, 'brc', [ SPAN / 2, 0, zAt(BAYS - 1)], [ SPAN / 2, HEIGHT, zAt(BAYS)], 0.1);
  add(4, 'brc', [ SPAN / 2, HEIGHT, zAt(BAYS - 1)], [ SPAN / 2, 0, zAt(BAYS)], 0.1);

  /* ---- Build meshes ------------------------------------------ */
  const steelMat = new THREE.MeshStandardMaterial({
    color: STEEL, roughness: 0.75, metalness: 0.15,
  });
  const padMat = new THREE.MeshStandardMaterial({
    color: 0x94a3b8, roughness: 1.0, metalness: 0.0,
  });
  const braceMat = new THREE.MeshStandardMaterial({
    color: ACCENT, roughness: 0.55, metalness: 0.2,
  });

  const group = new THREE.Group();
  const built = [];
  const box = new THREE.BoxGeometry(1, 1, 1);
  const A = new THREE.Vector3(), B = new THREE.Vector3(), M = new THREE.Vector3();

  const totalSeq = 5;
  for (const m of members) {
    A.fromArray(m.a); B.fromArray(m.b);
    const len = A.distanceTo(B);
    const mesh = new THREE.Mesh(
      box, m.type === 'pad' ? padMat : m.type === 'brc' ? braceMat : steelMat
    );

    if (m.type === 'pad') {
      mesh.scale.set(m.size, len, m.size);
    } else {
      mesh.scale.set(m.size, len, m.size);
    }
    M.addVectors(A, B).multiplyScalar(0.5);
    mesh.position.copy(M);
    // orient the box's local +Y along the member axis
    mesh.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      B.clone().sub(A).normalize()
    );

    mesh.userData = { seq: m.seq, len, size: m.size, type: m.type };
    group.add(mesh);
    built.push(mesh);
  }
  scene.add(group);

  /* ---- Erection driver ---------------------------------------
     progress 0..1 maps across the sequence slots; each member grows
     along its own axis, slightly staggered within its slot.        */
  function setProgress(p) {
    const front = p * (totalSeq + 0.6);
    for (const mesh of built) {
      const { seq, len, size } = mesh.userData;
      // per-member jitter so a slot doesn't pop in perfectly together
      const jitter = ((mesh.id * 37) % 100) / 100 * 0.45;
      let t = front - seq - jitter;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const eased = 1 - Math.pow(1 - t, 3);
      mesh.scale.set(size, Math.max(len * eased, 0.0001), size);
      // keep the member growing from its base rather than its centre
      mesh.visible = eased > 0.001;
      const shift = (len * eased) / 2 - len / 2;
      mesh.position.copy(mesh.userData.mid ||
        (mesh.userData.mid = mesh.position.clone()));
      mesh.translateY(shift);
    }
  }

  /* ---- Camera path ------------------------------------------- */
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  function placeCamera(p, t) {
    const ang = -0.85 + p * 1.5 + pointer.x * 0.35;
    const dist = 30 - p * 8;
    const hgt = 4 + p * 5 + pointer.y * 2.2;
    camera.position.set(Math.sin(ang) * dist, hgt, Math.cos(ang) * dist);
    // Aim left of the frame so it composes to the RIGHT of the headline
    // on wide screens. On narrow screens centre it — the copy stacks above.
    const wide = innerWidth > 900;
    camera.lookAt(wide ? -6.5 : 0, HEIGHT * 0.55, 0);
    if (!reduce) group.rotation.y = Math.sin(t * 0.00013) * 0.05;
  }

  /* ---- Sizing ------------------------------------------------- */
  function resize() {
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return;
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    renderer.setSize(r.width, r.height, false);
    camera.aspect = r.width / r.height;
    camera.updateProjectionMatrix();
  }

  /* ---- Loop --------------------------------------------------- */
  let raf = 0, running = false, progress = 0, shown = 0;

  function scrollProgress() {
    const hero = canvas.closest('section') || document.body;
    const h = hero.getBoundingClientRect();
    // The stage is pinned for one viewport, so the usable travel is the
    // runway height minus that screen. Guard against a zero divisor.
    const travel = Math.max((h.height || innerHeight) - innerHeight, 1);
    return Math.min(Math.max(-h.top / travel, 0), 1);
  }

  function frame(t) {
    if (!running) return;
    progress = scrollProgress();
    shown += (progress - shown) * 0.08;             // smooth the scroll
    pointer.x += (pointer.tx - pointer.x) * 0.06;
    pointer.y += (pointer.ty - pointer.y) * 0.06;
    setProgress(0.06 + shown * 0.94);   // start at foundations, finish braced
    placeCamera(shown, t);
    // Hand the stage over: copy recedes as the frame goes up.
    const inner = document.querySelector('.hero-inner');
    if (inner) {
      const f = Math.max(0, Math.min((shown - 0.45) / 0.4, 1));
      inner.style.opacity = String(1 - f);
      inner.style.transform = `translate3d(0, ${-f * 40}px, 0)`;
    }
    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  }

  const start = () => { if (!running) { running = true; raf = requestAnimationFrame(frame); } };
  const stop  = () => { running = false; cancelAnimationFrame(raf); };

  resize();

  if (reduce) {
    setProgress(1);
    placeCamera(0.35, 0);
    renderer.render(scene, camera);
    return { destroy() { renderer.dispose(); } };
  }

  const onMove = (e) => {
    pointer.tx = (e.clientX / innerWidth) * 2 - 1;
    pointer.ty = -((e.clientY / innerHeight) * 2 - 1);
  };
  let rt;
  const onResize = () => { clearTimeout(rt); rt = setTimeout(resize, 150); };
  const onVis = () => (document.hidden ? stop() : start());

  const io = new IntersectionObserver(
    ([e]) => (e.isIntersecting ? start() : stop()), { threshold: 0 }
  );
  io.observe(canvas);

  addEventListener('resize', onResize, { passive: true });
  addEventListener('pointermove', onMove, { passive: true });
  document.addEventListener('visibilitychange', onVis);

  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); stop(); });

  return {
    destroy() {
      stop(); io.disconnect();
      removeEventListener('resize', onResize);
      removeEventListener('pointermove', onMove);
      document.removeEventListener('visibilitychange', onVis);
      box.dispose(); steelMat.dispose(); padMat.dispose(); braceMat.dispose();
      renderer.dispose();
    },
  };
}
