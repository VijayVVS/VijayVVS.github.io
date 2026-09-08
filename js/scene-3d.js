/* ============================================================
   scene-3d.js — ONE WebGL layer for the entire page.

   Previously only the hero had 3D and every section below it was flat SVG.
   This replaces that: a single fixed canvas behind the whole document, one
   renderer, one camera, and a Group per section built from real geometry.
   As you scroll, the active section's group fades up and the camera moves
   to that section's station.

   One context, not eight — eight canvases would each cost a GL context and
   most browsers cap you around 8-16 before they start dropping the oldest.

   Stations (all procedural, no downloaded models):
     hero          three-bay portal frame erecting in construction sequence
     about         his portrait as a survey point cloud that resolves into him
     experience    a column taking load — arrows descend, the column shortens
     projects      rolled drawings that unroll into flat sheets
     all-projects  a field of building masses, one per project group
     research      a deforming surface — seismic response of a plate
     process       a node/edge network wiring itself together
     contact       a survey tripod over a benchmark
   ============================================================ */

// Resolved through the import map in index.html — see the comment there.

export async function initScene3D(canvas) {
  if (!canvas) return null;

  try {
    const t = document.createElement('canvas');
    if (!(t.getContext('webgl2') || t.getContext('webgl'))) return null;
  } catch { return null; }

  let THREE, PP;
  try {
    THREE = await import('three');
    // Post-processing chain + a real environment. Loaded together so a single
    // failure falls back cleanly to the 2D hero rather than a half-built scene.
    const [ec, rp, bloom, sp, op, room] = await Promise.all([
      import('three/addons/postprocessing/EffectComposer.js'),
      import('three/addons/postprocessing/RenderPass.js'),
      import('three/addons/postprocessing/UnrealBloomPass.js'),
      import('three/addons/postprocessing/ShaderPass.js'),
      import('three/addons/postprocessing/OutputPass.js'),
      import('three/addons/environments/RoomEnvironment.js'),
    ]);
    PP = {
      EffectComposer: ec.EffectComposer, RenderPass: rp.RenderPass,
      UnrealBloomPass: bloom.UnrealBloomPass, ShaderPass: sp.ShaderPass,
      OutputPass: op.OutputPass, RoomEnvironment: room.RoomEnvironment,
    };
  } catch (err) {
    // Never fail silently again: a swallowed import error looked identical to
    // "this browser has no WebGL" and cost an hour.
    console.error('[scene-3d] module load failed, falling back to 2D hero:', err);
    return null;
  }

  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const css = getComputedStyle(document.documentElement);
  const v = (n, f) => (css.getPropertyValue(n) || f).trim();

  const ACCENT = new THREE.Color(v('--accent', '#c3490a'));
  const STEEL  = new THREE.Color(v('--steel', '#64748b'));
  const LIGHT  = new THREE.Color(v('--steel-light', '#94a3b8'));
  const GROUND = new THREE.Color(v('--page-bg', '#f8fafc'));
  const BLACK  = new THREE.Color(0x000000);

  /* ---- THE WASH-OUT, FIXED WITH ARITHMETIC -------------------------
     Measured defect: the sheet rendered (229,229,229) instead of #f8fafc
     (248,250,252), and the portrait's blacks lifted from ~0 to (52,53,53).

     Cause: OutputPass tone-maps the WHOLE composited buffer, including a
     background that was already display-ready. And it cannot simply be
     nudged, because the ACES curve SATURATES -- f(1.0) = 0.803, so no input
     at or below white can ever produce 0.973. Setting the background to the
     page colour guarantees it comes out grey.

     Fix: feed the background the HDR value that LANDS on the target after the
     curve, solved numerically so it follows the palette and the exposure
     instead of being a hand-tuned hex that goes stale. */
  const ACES = (x) => {
    const a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
    return THREE.MathUtils.clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0, 1);
  };
  const unACES = (target) => {
    let lo = 0, hi = 64;
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2;
      if (ACES(mid) < target) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  };
  const pageColour = (colour, exposure) => {
    const c = colour.clone().convertSRGBToLinear();
    return new THREE.Color(unACES(c.r) / exposure,
                           unACES(c.g) / exposure,
                           unACES(c.b) / exposure);
  };

  const scene = new THREE.Scene();
  const GROUND_SCENE = pageColour(GROUND, 1.05);   // matches toneMappingExposure
  scene.background = GROUND_SCENE;    // the canvas IS the page ground now
  scene.fog = new THREE.Fog(GROUND_SCENE, 34, 90);
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 240);
  /* OPAQUE, painting the page ground itself.
     UnrealBloomPass composites opaque no matter what the downstream passes do
     — a transparent canvas plus bloom is not a combination three supports. So
     rather than drop bloom (the skill is explicit that post-processing is what
     separates a demo from finished work), the canvas paints --page-bg itself
     and the HTML content sits above it. One coherent image, fully graded. */
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  // Physically-correct output. Without these, metal reads as flat grey paint.
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  /* ---------- POST-PROCESSING ----------
     RenderPass -> Bloom -> Vignette -> OutputPass -> Grain.
     Grain sits AFTER OutputPass deliberately: applied in linear HDR the same
     +0.05 nudge is invisible on a value of 5.0 and enormous on 0.2. After
     tone mapping everything is in [0,1] and the grain is even.
     Every pass preserves alpha (c.a) because this canvas composites over the
     HTML page — treating the transparent regions would fog the whole site. */
  const composer = new PP.EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType, format: THREE.RGBAFormat,
  }));
  composer.addPass(new PP.RenderPass(scene, camera));

  /* Bloom, now at the strength it was always designed for.

     The old settings were 0.22 strength at threshold 0.978, and both numbers
     were defensive: #f8fafc has luminance 0.961, so on the light page ANY
     threshold below that made THE GROUND ITSELF a bloom source, whose glow
     lifted every pixel sitting on it. That is why it had to be pinned above
     0.961 and the strength choked to a quarter of the skill's default.

     A near-black ground has luminance 0.003. There is nothing to defend
     against: 0.55 at threshold 0.60 is the documented setting for a dark
     scene, and it is what makes lit steel read as LIT rather than painted. */
  const bloomPass = new PP.UnrealBloomPass(
    new THREE.Vector2(1, 1), 0.55, 0.62, 0.60
  );
  composer.addPass(bloomPass);

  const vignettePass = new PP.ShaderPass({
    uniforms: { tDiffuse: { value: null }, uOffset: { value: 0.42 }, uDarkness: { value: 0.55 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `
      uniform sampler2D tDiffuse; uniform float uOffset; uniform float uDarkness;
      varying vec2 vUv;
      void main(){
        vec4 c = texture2D(tDiffuse, vUv);
        vec2 uv = vUv - 0.5;
        float v = smoothstep(0.8, uOffset, length(uv));
        // scale by alpha so the transparent page area is never touched
        vec3 rgb = mix(c.rgb * (1.0 - uDarkness), c.rgb, v);
        gl_FragColor = vec4(rgb, c.a);
      }`,
  });
  composer.addPass(vignettePass);
  composer.addPass(new PP.OutputPass());

  const grainPass = new PP.ShaderPass({
    uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uIntensity: { value: 0.055 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `
      uniform sampler2D tDiffuse; uniform float uTime; uniform float uIntensity;
      varying vec2 vUv;
      float rand(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
      void main(){
        vec4 c = texture2D(tDiffuse, vUv);
        float n = rand(vUv + uTime) - 0.5;
        // grain only where the scene actually is; the page keeps its own tone
        gl_FragColor = vec4(c.rgb + n * uIntensity, c.a);
      }`,
  });
  composer.addPass(grainPass);

  /* The composer draws each pass as a fullscreen quad, and ShaderPass/OutputPass
     materials are opaque by default — so the final pass was writing alpha 1
     across the whole viewport and greying out the page behind the canvas.
     The last pass must blend, and the clear alpha must be 0. */

  /* A hemisphere at 1.15 with a pale ground colour is an OVERCAST SKY: it
     lights every surface from every direction, which is right for an off-white
     page and fatal on a dark one -- it is precisely what makes a dark scene
     look grey and cheap instead of lit. Down to a whisper, and the bounce
     colour goes to the room's own near-black. */
  scene.add(new THREE.HemisphereLight(0x9fb4d0, 0x0a0d13, 0.22));

  const key = new THREE.DirectionalLight(0xfff1e0, 3.4);   // warm, and now doing the work
  key.position.set(12, 18, 9);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.near = 1; key.shadow.camera.far = 80;
  key.shadow.camera.left = -28; key.shadow.camera.right = 28;
  key.shadow.camera.top = 28;  key.shadow.camera.bottom = -28;
  key.shadow.bias = -0.0012;
  key.shadow.normalBias = 0.02;
  key.shadow.radius = 3;          // soften the penumbra
  key.shadow.blurSamples = 8;
  scene.add(key);

  const fil = new THREE.DirectionalLight(0x6f86a8, 0.30);  // cold, just enough to read the dark side
  fil.position.set(-12, 5, -9);
  scene.add(fil);

  /* Rim light. Three-point lighting per the threejs-webgl skill: on an
     off-white page the steel silhouettes were merging into the background,
     and a rim from behind separates edge from ground. */
  const rim = new THREE.DirectionalLight(0xbcd4ff, 2.0);   // the edge that separates steel from the room
  rim.position.set(-4, 9, -18);
  scene.add(rim);

  /* Environment. The skill is blunt about this: "metalness > 0 requires an
     environment map — without one a metallic material is a black blob", and
     "the HDRI is more important than the model". RoomEnvironment is three's
     built-in stand-in for an HDRI: a lit box that produces real specular
     response without a 4MB download. */
  (function buildEnv() {
    /* RoomEnvironment is a LIGHT GREY BOX. It was the right call on an
       off-white page -- it is three's stand-in for an HDRI and it gives metals
       a real specular response for no download. On a dark set it is the single
       worst thing in the scene: every reflective surface picks up a bright
       grey wash from all sides, the blacks never reach black, and the result
       is the flat, washed look this rebuild exists to kill.

       So the studio is BUILT: a near-black room with one large warm softbox
       and one cold rim panel, baked to a cubemap through the same PMREM path.
       The reflections are real, the falloff is real, and it still costs no
       download. */
    const studio = new THREE.Scene();
    studio.add(new THREE.Mesh(new THREE.BoxGeometry(120, 120, 120),
      new THREE.MeshBasicMaterial({ color: 0x090c11, side: THREE.BackSide })));
    const soft = new THREE.Mesh(new THREE.PlaneGeometry(52, 34),
      new THREE.MeshBasicMaterial({ color: 0xfff2e2 }));
    soft.position.set(-30, 24, 26); soft.lookAt(0, 0, 0); studio.add(soft);
    const cold = new THREE.Mesh(new THREE.PlaneGeometry(40, 26),
      new THREE.MeshBasicMaterial({ color: 0x8fb2e8 }));
    cold.position.set(30, -6, -24); cold.lookAt(0, 0, 0); studio.add(cold);

    const pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    scene.environment = pmrem.fromScene(studio, 0.02).texture;
    pmrem.dispose();
  })();

  /* A soft ground that only receives shadow — grounds every object without
     drawing a visible floor on the off-white page. */
  const shadowCatcher = new THREE.Mesh(
    new THREE.PlaneGeometry(200, 200),
    /* A shadow is a subtraction of light, and there is almost no light on
       this ground to subtract -- 0.16 opacity over luminance 0.003 is
       arithmetically invisible. Kept (self-shadowing on the objects still
       reads) but taken down so it costs nothing visually. */
    new THREE.ShadowMaterial({ opacity: 0.04 })
  );
  shadowCatcher.rotation.x = -Math.PI / 2;
  shadowCatcher.position.y = -0.36;
  shadowCatcher.receiveShadow = true;
  /* IT MUST NOT WRITE DEPTH. This is a 200x200 horizontal plane sitting
     0.36 units below the origin — which, with cameras that sit near y = 0,
     puts its horizon across the middle of the frame. Writing depth, it then
     occluded every part of every station that fell below that line, and did
     it silently: on the old off-white page the plane was invisible, so the
     clipping looked like a composition choice rather than a bug.

     Measured: the contact title block rendered 522 x 149 px against a
     geometry of 11 x 5.5 — an aspect of 3.50 where it should be 2.00, i.e.
     the bottom 43% of the plate simply did not exist. Its lower cells were
     being drawn to the texture and thrown away. With depthWrite off the same
     plate measures 524 x 265, aspect 1.98.

     A plane that only receives shadow has no business occluding anything. */
  shadowCatcher.material.depthWrite = false;
  scene.add(shadowCatcher);

  /* ---- shared materials ------------------------------------- */
  const M = {
    /* Painted structural steel. The old settings were written against a PALE
       environment, where the danger was the reverse of the one here: high
       metalness on a bright box killed the diffuse term and the frame went
       black, so metalness was held to 0.45 and roughness kept high to stop it
       reading as chrome.

       The environment is now a dark room with two panels. Nothing washes the
       steel any more, which is why the frame read as one flat blue-grey
       silhouette — no sheen ran along a single flange. Tighter roughness and
       a much stronger environment response put the specular back, and on a
       dark set that highlight IS the modelling. */
    steel:  new THREE.MeshStandardMaterial({ color: STEEL, roughness: 0.30, metalness: 0.62,
                                             envMapIntensity: 3.2 }),
    /* Concrete pads. LIGHT is --steel-light, chosen to read against an
       off-white sheet; under a 3.4-intensity key on a black ground the pads
       came out brighter than the steelwork and stole the frame. Concrete is
       the substrate here, not the subject. */
    light:  new THREE.MeshStandardMaterial({ color: 0x55606e, roughness: 0.95, metalness: 0.0 }),
    // Primer orange, the colour steel arrives on site in.
    accent: new THREE.MeshStandardMaterial({ color: ACCENT, roughness: 0.42, metalness: 0.3,
                                             envMapIntensity: 2.0,
                                             emissive: ACCENT, emissiveIntensity: 0.25 }),
    wire:   new THREE.LineBasicMaterial({ color: LIGHT, transparent: true, opacity: 0.55 }),
    wireA:  new THREE.LineBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.9 }),
  };
  const BOX = new THREE.BoxGeometry(1, 1, 1);

  /* helper: a box stretched between two points */
  function member(a, b, size, mat) {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
    const len = A.distanceTo(B);
    const m = new THREE.Mesh(BOX, mat);
    m.scale.set(size, len, size);
    m.position.copy(A).add(B).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
    m.userData.len = len; m.userData.size = size;
    m.userData.mid = m.position.clone();
    m.castShadow = true; m.receiveShadow = true;
    return m;
  }
  /* helper: grow a member from its base, 0..1 */
  function grow(m, t) {
    const { len, size, mid } = m.userData;
    const e = t <= 0 ? 0 : t >= 1 ? 1 : 1 - Math.pow(1 - t, 3);
    m.visible = e > 0.001;
    m.scale.set(size, Math.max(len * e, 1e-4), size);
    m.position.copy(mid);
    m.translateY((len * e) / 2 - len / 2);

    /* PRIMER ON THE MEMBER GOING IN.
       Steel arrives on site in primer and is painted later, so the piece being
       erected is the orange one and everything already standing has gone to
       finish colour. It also gives the sequence a moving focal point: without
       it the frame was one uniform blue-grey and you could not see WHERE the
       erection had got to — which is the entire thing this hero is about.
       Only meshes given their own material take part (see push()). */
    const mat = m.material;
    if (mat && mat.userData && mat.userData.own) {
      const hot = e > 0.001 && e < 0.999 ? 1 - Math.abs(e - 0.5) * 1.2 : 0;
      mat.emissiveIntensity = hot * 0.9;
      mat.emissive.copy(hot > 0.001 ? ACCENT : BLACK);
      mat.color.copy(STEEL).lerp(ACCENT, hot * 0.75);
    }
  }

  /* ============================================================
     STATIONS
     Each returns { group, update(p) } where p is 0..1 through its section.
     ============================================================ */
  const stations = {};


  /* ============================================================
     THE DRAWING SET — shared by every station below.

     Seven scans of real work were sitting unused in assets/ while five
     sections generated abstract geometry. The -clean- copies are the ones
     with the four-point sparkle watermark inpainted out of the bottom-right
     corner: invisible on white paper, a bright star once inverted.

     Nothing here labels a sheet or ties one to an employer. Which drawing
     belongs to which job is not this file's to assert.
     ============================================================ */
  const SHEETS = [
    'assets/opt/crane-gantry-1-clean-1600.webp',
    'assets/opt/parapet-wall-1-clean-1600.webp',
    'assets/opt/shopfront-1-clean-1600.webp',
    'assets/opt/underpinning-1-clean-1600.webp',
    'assets/opt/shopfront-3-clean-1600.webp',
    'assets/opt/crane-gantry-2-clean-1600.webp',
    'assets/opt/shopfront-2-clean-1600.webp',
  ];

  /* One texture per file no matter how many meshes want it. Without this the
     process index alone would fetch and decode the same seven images twenty
     times over. */
  const texCache = new Map();
  const sheetTexture = (url) => {
    if (!texCache.has(url)) {
      const t = new THREE.TextureLoader().load(url);
      t.colorSpace = THREE.SRGBColorSpace;
      texCache.set(url, t);
    }
    return texCache.get(url);
  };

  /* INK ON PAPER, INVERTED INTO THE ROOM.
     A scan dropped onto this page as-is is a white slab punched through it.
     Inverted, the paper becomes the ground and the LINEWORK becomes the light
     — the drawing then reads as lit from inside a dark room rather than
     pasted on top of one, and the bloom pass has something real to catch.

     The levels are not optional. These are scans, so the paper sits mid-range
     with the scanner's own cast on it; a straight one-minus-luminance
     inversion lands it at mid-grey and yields a grey slab with white lines,
     which is no improvement on the white one. Clamping to the scan's actual
     paper/ink window puts the paper back on the floor.

     The ink ceiling sits ABOVE 1.0 on purpose: this writes into an HDR buffer
     that OutputPass tone-maps with the ACES curve, and that curve compresses
     hard near the top — 0.86 in comes out around 0.60. Same reasoning as the
     unACES() solve used for the page ground. */
  const drawingMaterial = (url, opts = {}) => new THREE.ShaderMaterial({
    side: THREE.DoubleSide, transparent: true, depthWrite: false,
    uniforms: {
      map:      { value: sheetTexture(url) },
      uOpacity: { value: 1 },
      uAccent:  { value: ACCENT.clone() },
      uEdge:    { value: opts.edge ?? 0 },    // primer on the leading edge
      uGain:    { value: opts.gain ?? 1 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main(){ vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      precision mediump float;
      uniform sampler2D map; uniform vec3 uAccent;
      uniform float uOpacity, uEdge, uGain;
      varying vec2 vUv;
      void main(){
        vec3 c = texture2D(map, vUv).rgb;
        float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
        float ink = pow(1.0 - smoothstep(0.30, 0.86, lum), 1.25);
        vec3 lit = mix(vec3(0.030, 0.040, 0.055), vec3(1.62, 1.70, 1.82) * uGain, ink);
        lit += uAccent * (1.0 - smoothstep(0.0, 0.014, abs(vUv.x - 0.992))) * uEdge;
        gl_FragColor = vec4(lit, uOpacity);
      }`,
  });

  /* A sheet mesh that fades itself. The wiring below drives section crossfade
     by writing material.opacity, which a ShaderMaterial ignores — so these opt
     out of the blanket traverse and push the value into uOpacity instead. */
  const sheetMesh = (url, w, h, opts) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h, 1, 1),
                             drawingMaterial(url, opts));
    m.userData.selfFade = true;
    return m;
  };
  const setSheetFade = (m, v) => { m.material.uniforms.uOpacity.value = v; };

  /* ---- hero: the portal frame ---- */
  (function heroStation() {
    const g = new THREE.Group();
    const BAYS = 3, SPAN = 9, H = 5.2, PITCH = 1.9, BAY = 5;
    const zAt = (i) => (i - BAYS / 2) * BAY;
    const parts = [];
    const push = (seq, m) => {
      m.userData.seq = seq;
      /* Its OWN material. The frame shares M.steel, so driving emissive on it
         would flash all thirty members at once instead of the one going in. */
      if (m.material === M.steel) {
        m.material = M.steel.clone();
        m.material.emissive = new THREE.Color(0x000000);
        m.material.userData = { own: true };
      }
      g.add(m); parts.push(m);
    };

    for (let i = 0; i <= BAYS; i++) {
      const z = zAt(i);
      push(0, member([-SPAN/2,-0.35,z], [-SPAN/2,0.05,z], 1.5, M.light));
      push(0, member([ SPAN/2,-0.35,z], [ SPAN/2,0.05,z], 1.5, M.light));
      push(1, member([-SPAN/2,0,z], [-SPAN/2,H,z], 0.34, M.steel));
      push(1, member([ SPAN/2,0,z], [ SPAN/2,H,z], 0.34, M.steel));
      push(2, member([-SPAN/2,H,z], [0,H+PITCH,z], 0.26, M.steel));
      push(2, member([ SPAN/2,H,z], [0,H+PITCH,z], 0.26, M.steel));
    }
    for (let i = 0; i < BAYS; i++) {
      const z1 = zAt(i), z2 = zAt(i+1);
      push(3, member([-SPAN/2,H,z1], [-SPAN/2,H,z2], 0.15, M.steel));
      push(3, member([ SPAN/2,H,z1], [ SPAN/2,H,z2], 0.15, M.steel));
      push(3, member([0,H+PITCH,z1], [0,H+PITCH,z2], 0.15, M.steel));
    }
    push(4, member([-SPAN/2,0,zAt(0)], [-SPAN/2,H,zAt(1)], 0.1, M.accent));
    push(4, member([-SPAN/2,H,zAt(0)], [-SPAN/2,0,zAt(1)], 0.1, M.accent));
    push(4, member([ SPAN/2,0,zAt(BAYS-1)], [ SPAN/2,H,zAt(BAYS)], 0.1, M.accent));
    push(4, member([ SPAN/2,H,zAt(BAYS-1)], [ SPAN/2,0,zAt(BAYS)], 0.1, M.accent));

    /* A setting-out grid is a FAINT reference, not the subject. At 0x94a3b8
       and 0.45 on a near-black ground it out-shouted the steel frame standing
       on it. The centre lines keep the primer so the origin still reads. */
    const grid = new THREE.GridHelper(70, 35, ACCENT, 0x35435a);
    grid.material.transparent = true; grid.material.opacity = 0.22; g.add(grid);

    stations.hero = { group: g, look: [0, 2.8, 0], cam: (p) => {
      const a = -0.85 + p * 1.4, d = 30 - p * 7, h = 4 + p * 5;
      return [Math.sin(a)*d, h, Math.cos(a)*d];
    }, update(p) {
      const front = (0.06 + p * 0.94) * 5.6;
      for (const m of parts) grow(m, front - m.userData.seq - ((m.id*37)%100)/100*0.45);
    }};
  })();

  /* ---- about: the portrait as a survey ----
     His photograph, read the way a civil engineer reads a site: as a level
     surface. Each pixel becomes a survey point whose elevation is its
     luminance, so his face forms as relief rather than as a picture hung on
     a wall. The dark studio background falls below the threshold and drops
     out, leaving the bust floating over a ground grid.

     Scroll takes it from a flat sheet (all points at datum, an unsurveyed
     plane) up to full relief, then the points settle. Contour banding is
     driven in the shader-free way: point colour steps by elevation, the way
     a contour map steps by level. ---- */
  (function aboutStation() {
    const g = new THREE.Group();
    const cloud = new THREE.Group();
    g.add(cloud);

    // ground grid so the relief reads as height above a datum
    const grid = new THREE.GridHelper(30, 30, 0x53627a, 0x2b3644);
    grid.material.transparent = true; grid.material.opacity = 0.30;
    grid.position.y = -0.02;
    grid.userData.selfFade = true;      // the station fades this itself
    g.add(grid);

    let points = null, base = null, target = null, count = 0;
    let surveyCol = null, photoCol = null;
    let enteredAt = 0;
    let plate = null;          // the real photograph
    const H = 11.4;   // survey height, needed by the tear bands

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      // sample the photo down to a survey grid
      const GX = 200, GY = 266;   // denser survey grid
      const c = document.createElement('canvas');
      c.width = GX; c.height = GY;
      const ctx2 = c.getContext('2d', { willReadFrequently: true });
      ctx2.drawImage(img, 0, 0, GX, GY);
      const data = ctx2.getImageData(0, 0, GX, GY).data;

      const W = 8.6, H = 11.4;             // world size of the survey
      const pos = [], col = [], tgt = [], photo = [];
      const cA = new THREE.Color(), cB = new THREE.Color();

      for (let y = 0; y < GY; y++) {
        for (let x = 0; x < GX; x++) {
          const i = (y * GX + x) * 4;
          const lum = (0.2126 * data[i] + 0.7152 * data[i+1] + 0.0722 * data[i+2]) / 255;
          if (lum < 0.085) continue;       // studio black -> no survey point

          const wx = (x / (GX - 1) - 0.5) * W;
          const wy = (1 - y / (GY - 1)) * H;
          const wz = Math.pow(lum, 1.35) * 3.6;   // elevation from brightness

          tgt.push(wx, wy, wz);
          // start scattered below the datum so it "surveys in" on scroll
          pos.push(wx, wy, -1.2 - lum * 0.4);

          // (a) SURVEY colouring: contour bands stepping by elevation
          const band = Math.floor(lum * 6) / 6;
          cA.copy(STEEL); cB.copy(ACCENT);
          const c3 = cA.lerp(cB, Math.pow(band, 1.25));
          col.push(c3.r, c3.g, c3.b);

          /* (b) RESOLVE colouring: him, as ink on paper.
             The subject IS the bright region — this is a lit face on a black
             studio ground and the ground has already been thresholded away.
             So ink follows BRIGHTNESS: the lit face carries the ink and the
             shadow edge falls back toward the page. Mapping ink to darkness
             instead leaves the face blank, which is why it read as a ghost.
             Target is --text #334155, so it lands as a graphite portrait
             rather than a hard black stencil. */
          // Renormalise: everything below the 0.085 threshold was discarded,
          // so without this the surviving pixels only ever use part of the ink
          // scale and the portrait comes out washed. Steep curve so midtones
          // carry real weight.
          const t = Math.min(Math.max((lum - 0.085) / 0.915, 0), 1);
          const ink = Math.pow(t, 0.55);
          photo.push(
            0.972 - ink * 0.855,   // -> #1e  darkest
            0.980 - ink * 0.820,   // -> #29
            0.988 - ink * 0.757    // -> #3b
          );
        }
      }
      count = tgt.length / 3;
      surveyCol = new Float32Array(col);
      photoCol  = new Float32Array(photo);

      const geo = new THREE.BufferGeometry();
      base   = new Float32Array(pos);
      target = new Float32Array(tgt);
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
      geo.setAttribute('color',    new THREE.BufferAttribute(new Float32Array(col), 3));

      points = new THREE.Points(geo, new THREE.PointsMaterial({
        size: 0.075,
        vertexColors: true,
        sizeAttenuation: true,
        transparent: true,
        depthWrite: false,
      }));
      points.rotation.x = -0.06;
      points.userData.selfFade = true;
      cloud.add(points);

      /* THE REAL PHOTOGRAPH.
         The point cloud carries the survey and the tear; the resolve lands on
         his actual studio portrait, black ground and all. Unlit and
         toneMapped:false so it renders exactly as shot rather than being
         relit or filmic-curved by the scene. */
      const tex = new THREE.Texture(img);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
      tex.needsUpdate = true;

      const aspect = img.naturalWidth / img.naturalHeight;
      const ph = 11.4, pw = ph * aspect;
      plate = new THREE.Mesh(
        new THREE.PlaneGeometry(pw, ph),
        new THREE.MeshBasicMaterial({
          map: tex, transparent: true, opacity: 0,
          toneMapped: false, depthWrite: false,
        })
      );
      // Square, and lifted clear of the ground grid — at y = ph/2 its bottom
      // edge sat on the datum and the grid cut across the lower third in
      // perspective. The survey is tilted; the photograph is not.
      plate.position.set(0, ph / 2 + 1.9, 0.05);
      plate.rotation.x = 0;
      plate.userData.selfFade = true;
      cloud.add(plate);
    };
    img.src = 'assets/opt/vijay-800.webp';

    stations.about = {
      group: g,
      reset() { enteredAt = 0; },
      look: [0, 6.6, 0],
      fov: (p) => {
        // 42mm-equivalent while it is a survey you move around; 22 once it is
        // his photograph, so the frame reads square instead of skewed.
        const r = Math.min(Math.max((p - 0.40) / 0.14, 0), 1);
        const t = r * r * (3 - 2 * r);
        return 42 - t * 20;
      },
      cam: (p) => {
        // Orbits while it is a survey, then squares up to face-on as it
        // resolves — you end looking straight at him.
        const resolve = Math.min(Math.max((p - 0.32) / 0.30, 0), 1);
        const settle = resolve * resolve * (3 - 2 * resolve);
        const r = Math.min(Math.max((p - 0.40) / 0.14, 0), 1);
        const t = r * r * (3 - 2 * r);
        const a = (-0.55 + p * 0.6) * (1 - settle);
        // Going long must move the camera BACK, not forward: apparent size is
        // set by d * tan(fov/2), so halving the field of view means roughly
        // doubling the distance. Pulling in instead blew the frame apart.
        const d = (23 - p * 3) * (1 - t) + 43.4 * t;
        const h = (5.6 + p * 1.8) * (1 - settle) + 6.6 * settle;
        return [Math.sin(a) * d, h, Math.cos(a) * d];
      },
      update(p, time, fade = 1) {
        if (!points || !base) return;
        // The section fade is passed in, so our own crossfade multiplies with
        // it rather than fighting it (both write material.opacity).
        const baseOpacity = fade;

        const pos = points.geometry.attributes.position;
        const col = points.geometry.attributes.color;
        const pa = pos.array, ca = col.array;
        if (!surveyCol || !photoCol ||
            surveyCol.length !== ca.length || photoCol.length !== ca.length) return;

        /* ---------------------------------------------------------------
           Three states, driven purely by scroll position, so the whole
           thing runs backwards when you scroll back up:

             p < 0.30          CONTOUR   the survey, relief + banding
             0.30 - 0.46       GLITCH    the signal breaks up
             p > 0.46          PHOTO     him, held

           Plus an ENTRY BURST: the first time the section becomes active
           it tears for ~700ms regardless of position, so landing here
           lands on a glitch that settles into his face.
           --------------------------------------------------------------- */
        if (enteredAt === 0) enteredAt = time;
        const sinceEntry = time - enteredAt;
        const entryBurst = sinceEntry < 700 ? 1 - sinceEntry / 700 : 0;

        const rise = 1 - Math.pow(1 - Math.min(p / 0.30, 1), 3);
        const mix  = Math.min(Math.max((p - 0.28) / 0.24, 0), 1);   // contour -> photo
        const settle = mix * mix * (3 - 2 * mix);

        // Glitch peaks in the middle of the handover and at entry.
        const band = Math.sin(Math.min(Math.max((p - 0.28) / 0.24, 0), 1) * Math.PI);
        const g = Math.max(band, entryBurst);

        /* Quantise time so the tear STUTTERS in discrete frames instead of
           sliding smoothly — smooth displacement reads as melting, stepped
           displacement reads as broken signal. */
        const frame = Math.floor(time / 45);
        const hash = (n) => {
          const v = Math.sin(n * 12.9898 + frame * 78.233) * 43758.5453;
          return v - Math.floor(v);
        };
        // a couple of hard scanline tears, re-picked every stutter frame
        const tearA = hash(1) * H, tearB = hash(2) * H;
        const tearW = 0.35 + hash(3) * 0.7;

        for (let i = 0; i < count; i++) {
          const j = i * 3, k = j + 2;

          const wy = target[j + 1];
          const relief = base[k] + (target[k] - base[k]) * rise;

          // ---- geometry: flatten toward the picture plane as it resolves
          let x = target[j];
          let z = relief * (1 - settle * 0.88);

          // ---- glitch displacement, in horizontal slices
          if (g > 0.01) {
            const slice = Math.floor(wy * 2.6);
            const h = hash(slice);
            if (h > 0.68) x += (h - 0.68) * 5.5 * g;        // slice slip
            if (Math.abs(wy - tearA) < tearW) x += (hash(slice + 11) - 0.5) * 7 * g;
            if (Math.abs(wy - tearB) < tearW * 0.6) z += (hash(slice + 23) - 0.5) * 2.4 * g;
          }

          pa[j] = x;
          pa[k] = z;

          // ---- colour: contour -> photo, with a channel split while tearing
          let r = surveyCol[j]     + (photoCol[j]     - surveyCol[j])     * settle;
          let gg = surveyCol[j + 1] + (photoCol[j + 1] - surveyCol[j + 1]) * settle;
          let b = surveyCol[j + 2] + (photoCol[j + 2] - surveyCol[j + 2]) * settle;

          if (g > 0.01) {
            const slice = Math.floor(wy * 2.6);
            const h = hash(slice + 5);
            if (h > 0.82) {          // chroma split: slam the slice to accent
              r = r * 0.35 + 0.72 * g;
              gg = gg * 0.55 + 0.26 * g;
              b  = b * 0.55;
            } else if (h < 0.10) {   // or drop it out toward the page
              r += (0.97 - r) * g * 0.8;
              gg += (0.98 - gg) * g * 0.8;
              b += (0.99 - b) * g * 0.8;
            }
          }
          ca[j] = r; ca[j + 1] = gg; ca[j + 2] = b;
        }
        pos.needsUpdate = true;
        col.needsUpdate = true;

        /* Hand over to the real photograph.
           The cloud does the survey and the tear, then dissolves as the
           photograph comes up underneath it. The crossover sits late in the
           glitch so the tear is still running when his face arrives. */
        const reveal = Math.min(Math.max((p - 0.40) / 0.14, 0), 1);
        const shown  = reveal * reveal * (3 - 2 * reveal);

        // The datum grid belongs to the survey. Once the photograph is up it
        // is just a mesh crossing his chest, so it goes.
        grid.material.opacity = 0.30 * (1 - shown) * fade;
        grid.visible = shown < 0.98;

        if (plate) {
          // flicker the photograph in on the stutter while the tear is live
          const stut = g > 0.15 ? (hash(41) > 0.42 ? 1 : 0.25) : 1;
          plate.material.opacity = shown * stut * baseOpacity;
          plate.visible = shown > 0.01;
          // it settles the last of the way in as the tear dies
          plate.position.x = (1 - shown) * (hash(53) - 0.5) * 1.6 * g;
        }

        // points fatten as they resolve, then dissolve out behind the photo
        const flick = g > 0.01 ? (hash(99) > 0.5 ? 1.35 : 0.8) : 1;
        points.material.size = (0.075 + settle * 0.045) * flick;
        points.material.opacity = (1 - shown) * baseOpacity;
        points.visible = shown < 0.995;
        cloud.rotation.y = (-0.28 + p * 0.42) * (1 - settle) + (g > 0.5 ? (hash(7) - 0.5) * 0.06 : 0);
      },
    };
  })();

  /* ---- experience: the set, brought forward ----
     Was a borehole core: four flat-shaded cylinders in four colours with a
     ladder beside them. The IDEA was sound — depth is time, and every
     structural engineer reads borehole logs — but a stack of coloured tubes
     is a diorama, an illustration of the idea rather than the idea. It also
     shared the page with four point-cloud sections, so the whole lower half
     of the site was generated abstraction while seven drawings of the real
     work sat unused on disk.

     Depth is still time. It is now a SET OF DRAWINGS stacked in depth with
     the most recent at the front, and scrolling brings the set forward one
     sheet at a time — the ordinary act of going back through a job. Nothing
     is captioned: which sheet belongs to which employer is not something
     this file gets to claim. ---- */
  (function setStation() {
    const g = new THREE.Group();
    const N = 4;
    const sheets = [];
    for (let i = 0; i < N; i++) {
      // Offset into the set: SHEETS[0..2] are already on the dowels in
      // Featured work, and the same three drawings appearing twice reads
      // as a shortage of material rather than a set.
      const s = sheetMesh(SHEETS[(i + 3) % SHEETS.length], 15, 9.6, { edge: 0 });
      /* Offset in x and y as well as z. Stacked dead square they lined up
         pixel-for-pixel and, being transparent, blended into one illegible
         composite -- two sheets' worth of lettering superimposed. A stack you
         can read is a stack whose edges you can see. */
      s.position.set(i * 2.1, -i * 1.15, -i * 7.0);
      s.rotation.set(-0.05, 0.30 - i * 0.045, (i % 2 ? 1 : -1) * 0.022);
      g.add(s);
      sheets.push(s);
    }

    stations.experience = {
      group: g,
      // Biased right: the reading scrim owns the left of the frame.
      /* look.x stays 0. The frame loop already subtracts 6.5 from BOTH the
         camera position and the look target on wide screens, which is what
         composes the geometry to the right of the copy. Adding another
         negative offset here stacked on that and pushed these stations
         off the right edge of the viewport. */
      look: [0, 0.4, 0],
      cam: (p) => {
        const a = 0.30 - p * 0.30, d = 30 - p * 4;
        return [Math.sin(a) * d, 3.4 - p * 1.6, Math.cos(a) * d];
      },
      update(p, time, fade) {
        const f = fade == null ? 1 : fade;
        // The set advances: front sheet slides off, the next takes its place.
        const front = p * (N - 1);
        sheets.forEach((s, i) => {
          const rel = i - front;                 // <0 = already passed
          const z = rel * 7.0;
          s.position.z = THREE.MathUtils.lerp(s.position.z, z, 0.12);
          const stackX = Math.max(rel, 0) * 2.1, stackY = -Math.max(rel, 0) * 1.15;
          // A sheet that has gone past drifts up and out rather than
          // vanishing on the spot.
          const gone = THREE.MathUtils.clamp(-rel, 0, 1);
          s.position.y = THREE.MathUtils.lerp(s.position.y, stackY + gone * 8.5, 0.12);
          s.position.x = THREE.MathUtils.lerp(s.position.x, stackX + gone * -6.0, 0.12);
          s.rotation.x = -0.05 - gone * 0.32;
          // Depth of field, cheaply: only the sheet at the front is fully lit.
          /* Only ONE sheet is really lit. At 0.30 floor opacity and 0.34
             floor gain the three behind were still bright enough to read
             through the front one. A drawing set in a dark room: the one in
             your hand, and the suggestion of the rest. */
          const near = 1 - THREE.MathUtils.clamp(Math.abs(rel) / 1.25, 0, 1);
          s.material.uniforms.uGain.value = 0.12 + near * 1.05;
          setSheetFade(s, f * (1 - gone) * (0.05 + near * 0.95));
          // Paper is never dead still.
          s.rotation.z += Math.sin(time * 0.0004 + i * 1.7) * 0.00018;
        });
      },
    };
  })();

  /* ---- the survey field: one engine, four sections ------------------
     The About station samples his portrait to a grid, gives every point an
     elevation, and steps the colour into CONTOUR BANDS -- the way a contour
     map steps by level rather than shading smoothly. That is the one device
     on this page that has consistently read as engineering rather than
     decoration, so it becomes the shared language of the sections below
     instead of each one inventing its own.

     What changes per section is the SCALAR FIELD and the VERB. The four
     stations below were each a noun doing one motion -- a plate that ripples,
     nodes that pop in, a literal tripod -- which is exactly the failure this
     rebuild exists to fix.

     Every point starts scattered off-datum and RESOLVES to its surveyed
     position as the section is read, eased per point with a centre-out
     stagger, so the field settles like a survey being taken rather than a
     switch being flipped. Nothing snaps.                                   */
  function surveyField({ nx = 96, ny = 96, w = 22, h = 22, height, bands = 6,
                         scatter = 3.2, size = 0.115 }) {
    const count = nx * ny;
    const pos = new Float32Array(count * 3);      // live, animated
    const tgt = new Float32Array(count * 3);      // surveyed position
    const src = new Float32Array(count * 3);      // scattered start
    const col = new Float32Array(count * 3);
    const delay = new Float32Array(count);
    const cA = new THREE.Color(), cB = new THREE.Color();

    let i = 0;
    for (let iy = 0; iy < ny; iy++) {
      for (let ix = 0; ix < nx; ix++, i++) {
        const u = ix / (nx - 1), vv = iy / (ny - 1);
        const x = (u - 0.5) * w, y = (vv - 0.5) * h;
        const e = height(u, vv, x, y);            // 0..1 elevation
        tgt[i * 3] = x; tgt[i * 3 + 1] = e * 6.0; tgt[i * 3 + 2] = y;

        const a = Math.random() * Math.PI * 2, r = Math.random();
        src[i * 3]     = x + Math.cos(a) * r * scatter;
        src[i * 3 + 1] = (Math.random() - 0.5) * scatter * 2.2;
        src[i * 3 + 2] = y + Math.sin(a) * r * scatter;
        pos[i * 3] = src[i * 3];
        pos[i * 3 + 1] = src[i * 3 + 1];
        pos[i * 3 + 2] = src[i * 3 + 2];

        // CONTOUR BANDING: quantise, then ramp steel -> primer by level.
        const band = Math.floor(e * bands) / bands;
        cA.copy(STEEL); cB.copy(ACCENT);
        const c3 = cA.lerp(cB, Math.pow(band, 1.25));
        col[i * 3] = c3.r; col[i * 3 + 1] = c3.g; col[i * 3 + 2] = c3.b;

        delay[i] = Math.min(Math.hypot(u - 0.5, vv - 0.5) * 1.5, 0.85);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const points = new THREE.Points(geo, new THREE.PointsMaterial({
      size, vertexColors: true, sizeAttenuation: true,
      transparent: true, depthWrite: false,
    }));
    points.userData.selfFade = true;

    /* The probe is what makes it interactive: the ground lifts under the
       cursor and recovers, the same grammar as the hero truss deflecting and
       springing back, so the page reads as one instrument rather than a
       sequence of unrelated toys. */
    function update(p, time, fade) {
      /* THE THIRD ARGUMENT IS A FADE FACTOR, NOT A PROBE.
         The wiring below passes `f`, the 0..1 crossfade for the section that
         owns the viewport centre. Reading it as a probe and asking for
         `probe.x` yields undefined, every position becomes NaN and the entire
         cloud vanishes -- and the call site wraps update() in
         `try { } catch (_) {}`, so it would have failed in total silence.

         Because these points set `selfFade`, they opt out of the blanket
         traverse and must apply the fade themselves. */
      points.material.opacity = fade == null ? 1 : fade;

      /* The probe comes from the shared pointer instead, mapped into field
         space. `pointer` is declared further down this same closure; by the
         time update() is ever CALLED it exists. */
      const probe = (typeof pointer !== 'undefined')
        ? { x: pointer.x * (w * 0.5), z: -pointer.y * (h * 0.5) }
        : null;

      const a = geo.attributes.position.array;
      const ease = THREE.MathUtils.clamp(p * 1.35, 0, 1);
      for (let k = 0; k < count; k++) {
        const t = THREE.MathUtils.clamp((ease - delay[k]) / 0.35, 0, 1);
        const s = t * t * (3 - 2 * t);            // smoothstep, never linear
        const j = k * 3;
        a[j]     = src[j]     + (tgt[j]     - src[j])     * s;
        a[j + 1] = src[j + 1] + (tgt[j + 1] - src[j + 1]) * s;
        a[j + 2] = src[j + 2] + (tgt[j + 2] - src[j + 2]) * s;
        if (probe) {
          const dx = a[j] - probe.x, dz = a[j + 2] - probe.z;
          const d2 = dx * dx + dz * dz;
          if (d2 < 30) a[j + 1] += (1 - d2 / 30) * 1.5 * s;
        }
      }
      geo.attributes.position.needsUpdate = true;
    }
    return { points, update };
  }
  /* ---- projects: rolled drawings unrolling ---- */
  (function projStation() {
    const g = new THREE.Group();
    const rolls = [];
    /* THE DOWEL STANDS UP AND THE PAPER COMES OUT SIDEWAYS.
       It used to lie along X (`bar.rotation.z = PI/2`) while the sheet was
       turned `rotation.y = PI/2`, which maps the plane's local +X onto world
       -Z. So the drawing unrolled INTO THE SCREEN, directly away from a camera
       that orbits in front of it — every sheet was a foreshortened sliver at
       the frame edge, and it stayed a sliver no matter how far it unrolled.
       That was survivable while the sheets were blank white rectangles. Now
       they carry the drawings, it is the whole point of the section.

       Dowel vertical, sheet in the XY plane facing the camera, unrolling
       along +X. The paper now leaves the roll across the view. */
    const dowel = new THREE.CylinderGeometry(0.30, 0.30, 8.2, 20);
    for (let i=0;i<3;i++){
      const r = new THREE.Group();
      const bar = new THREE.Mesh(dowel, M.steel); r.add(bar);
      const sheet = new THREE.Mesh(new THREE.PlaneGeometry(9, 6.4, 1, 1),
        drawingMaterial(SHEETS[i], { edge: 1.1 }));
      // Pivot at the LEFT edge, so scaling x pulls paper off the dowel
      // instead of growing it symmetrically about its own middle.
      sheet.position.set(4.5, 0, 0);
      sheet.userData.selfFade = true;
      r.add(sheet); r.userData.sheet = sheet;
      // Fanned in depth as well as height, so three rolls read as a stack on a
      // rack rather than three copies of one object.
      r.position.set(-7.6 + i*1.4, 8.2 - i*8.4, -i*3.2);
      r.rotation.y = 0.10 - i*0.10;
      g.add(r); rolls.push(r);
    }
    stations.projects = { group: g, look:[0.5,0,0], cam:(p)=>{
      const a = -0.16 + p*0.34, d = 36 - p*7;
      return [Math.sin(a)*d, 3.0 + p*3.0, Math.cos(a)*d];
    }, update(p, time, fade){
      rolls.forEach((r,i)=>{
        setSheetFade(r.userData.sheet, fade == null ? 1 : fade);
        const t = Math.min(Math.max(p*1.55 - i*0.20, 0), 1);
        const e = 1 - Math.pow(1-t, 3);
        const sh = r.userData.sheet;
        sh.scale.x = Math.max(e, 0.001);
        sh.position.x = (9*e)/2;
        // Paper coming off a roll keeps a memory of the curl; it relaxes flat
        // only once it is fully out.
        sh.rotation.y = (1-e) * 0.55;
        // A drawing hanging off a dowel is never dead still.
        r.rotation.z = (1-e) * -0.32 + Math.sin(time*0.0006 + i)*0.012;
      });
    }};
  })();

  /* ---- all-projects: the set laid out ----
     Was a contour field: surveyField() again, third of four. This section is
     a HORIZONTAL rail — the cards move sideways — so the geometry behind it
     should move sideways too. A drawing set laid edge to edge and run past,
     the way you read a roll of sheets on a bench. ---- */
  (function railStation() {
    const g = new THREE.Group();
    const strip = [];
    const COUNT = 7, GAP = 13.5;
    for (let i = 0; i < COUNT; i++) {
      const s = sheetMesh(SHEETS[i % SHEETS.length], 11.5, 7.4, { edge: 0 });
      s.position.set(i * GAP, Math.sin(i * 1.7) * 1.1, Math.cos(i * 0.9) * 1.4);
      s.rotation.set(-0.04, 0.16 + Math.sin(i * 2.1) * 0.05, Math.sin(i) * 0.02);
      g.add(s); strip.push(s);
    }
    /* MOVE THE SET, NOT THE CAMERA.
       Driving the camera to p * 4.8 * 13.5 = 65 units of travel worked for
       this station and broke both its neighbours: the shared camera is damped
       toward each station's position, so every approach to Research began 65
       units off to one side and was still crawling back when the section was
       already on screen — which is why the fragility figure rendered half out
       of frame. The camera stays put and the strip runs past it. */
    stations['all-projects'] = {
      group: g, look: [0, 0, 0],
      cam: () => [0, 2.2, 27],
      update(p, time, fade) {
        const f = fade == null ? 1 : fade;
        const camX = 0;
        g.position.x = -p * (COUNT - 2.2) * GAP;
        strip.forEach((s, i) => {
          // Only what is near the camera is lit — the rest is a set in the dark.
          const near = 1 - THREE.MathUtils.clamp(Math.abs(s.position.x + g.position.x - camX) / 26, 0, 1);
          s.material.uniforms.uGain.value = 0.30 + near * 1.0;
          setSheetFade(s, f * (0.10 + near * 0.90));
          s.rotation.z = Math.sin(time * 0.0004 + i) * 0.012;
        });
      },
    };
  })();

  /* ---- research: the fragility curve ----
     Was surveyField() again, fourth of four, and it is the one that most
     deserved a real answer: his MSc is "a point source stochastic
     seismological model using MATLAB with Monte Carlo simulations to study
     uncertainties" and "enhanced reliability of fragility assessments by
     integrating forward uncertainty quantification".

     A fragility assessment produces a FIGURE — a curve, with the scatter it
     was fitted from and a band showing how confident it is. So this draws
     that figure. Samples arrive scattered and converge onto the median as the
     section is read, which is literally what running more simulations does.

     The axes carry ticks but no quantities. Labelling them would be inventing
     numbers about real research, which this file is not entitled to do. ---- */
  (function fragilityStation() {
    const g = new THREE.Group();
    /* 15 x 9.5, not 22 x 12. At a 42-degree fov and 30 units back the
       camera sees roughly 23 units across, so a 22-unit figure filled the
       frame edge to edge -- and once biased right to clear the reading
       scrim, half the curve was outside the viewport. */
    const W = 15, H = 9.5;

    // axes
    const axisMat = new THREE.LineBasicMaterial({ color: 0x8ea0b8, transparent: true, opacity: 0.75 });
    const axes = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, H, 0), new THREE.Vector3(0, 0, 0), new THREE.Vector3(W, 0, 0),
    ]);
    const axL = new THREE.Line(axes, axisMat);
    axL.userData.selfFade = true; g.add(axL);
    for (let k = 1; k <= 4; k++) {
      const tx = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(W * k / 5, 0, 0), new THREE.Vector3(W * k / 5, -0.45, 0)]);
      const l1 = new THREE.Line(tx, axisMat); l1.userData.selfFade = true; g.add(l1);
      const ty = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, H * k / 5, 0), new THREE.Vector3(-0.45, H * k / 5, 0)]);
      const l2 = new THREE.Line(ty, axisMat); l2.userData.selfFade = true; g.add(l2);
    }

    // lognormal-ish CDF: the median fragility curve, plus a confidence band
    const cdf = (u, shift, steep) => 1 / (1 + Math.exp(-(u - shift) * steep));
    const curvePts = (shift, steep) => {
      const pts = [];
      for (let k = 0; k <= 140; k++) {
        const u = k / 140;
        pts.push(new THREE.Vector3(u * W, cdf(u, shift, steep) * H, 0));
      }
      return pts;
    };
    const median = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(curvePts(0.5, 9)),
      new THREE.LineBasicMaterial({ color: ACCENT, transparent: true, opacity: 1 }));
    const bandHi = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(curvePts(0.40, 7.4)),
      new THREE.LineBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.30 }));
    const bandLo = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(curvePts(0.60, 7.4)),
      new THREE.LineBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.30 }));
    median.userData.selfFade = bandHi.userData.selfFade = bandLo.userData.selfFade = true;
    g.add(median, bandHi, bandLo);

    /* The Monte Carlo samples. Each one starts where an unconverged run puts
       it — anywhere — and ends on the curve. Scatter here is not an entrance
       effect; it IS the uncertainty, and the settling is the quantification. */
    const NS = 1400;
    const spos = new Float32Array(NS * 3);
    const ssrc = new Float32Array(NS * 3);
    const stgt = new Float32Array(NS * 3);
    const scol = new Float32Array(NS * 3);
    const sdelay = new Float32Array(NS);
    const cA = new THREE.Color(), cB = new THREE.Color();
    for (let k = 0; k < NS; k++) {
      const u = Math.random();
      const jitter = (Math.random() - 0.5) * 0.16 * (1 - Math.abs(u - 0.5) * 1.2);
      const x = u * W, y = THREE.MathUtils.clamp(cdf(u, 0.5, 9) + jitter, 0, 1) * H;
      stgt[k*3] = x; stgt[k*3+1] = y; stgt[k*3+2] = (Math.random() - 0.5) * 0.5;
      ssrc[k*3] = x + (Math.random() - 0.5) * 16;
      ssrc[k*3+1] = Math.random() * H * 1.5 - H * 0.25;
      ssrc[k*3+2] = (Math.random() - 0.5) * 9;
      spos[k*3] = ssrc[k*3]; spos[k*3+1] = ssrc[k*3+1]; spos[k*3+2] = ssrc[k*3+2];
      cA.copy(STEEL); cB.copy(ACCENT);
      const c = cA.lerp(cB, Math.pow(y / H, 1.1));
      scol[k*3] = c.r; scol[k*3+1] = c.g; scol[k*3+2] = c.b;
      sdelay[k] = Math.random() * 0.55;
    }
    const sgeo = new THREE.BufferGeometry();
    sgeo.setAttribute('position', new THREE.BufferAttribute(spos, 3));
    sgeo.setAttribute('color', new THREE.BufferAttribute(scol, 3));
    const samples = new THREE.Points(sgeo, new THREE.PointsMaterial({
      size: 0.105, vertexColors: true, sizeAttenuation: true,
      transparent: true, depthWrite: false,
    }));
    samples.userData.selfFade = true;
    g.add(samples);

    /* Lifted and pushed left. The wiring shifts every station 6.5 units
       right of the copy column, and at the default offset the figure's x-axis
       came to rest BEHIND the two research cards — so the plot read as a curve
       floating in the corner rather than as a figure with axes. */
    g.position.set(-W / 2 - 2.2, -H / 2 + 3.0, 0);

    stations.research = {
      group: g, look: [0, 0, 0],
      cam: (p) => {
        const a = -0.22 + p * 0.26, d = 25 - p * 4;
        return [Math.sin(a) * d, 1.2 + p * 1.2, Math.cos(a) * d];
      },
      update(p, time, fade) {
        const f = fade == null ? 1 : fade;
        const a = sgeo.attributes.position.array;
        const ease = THREE.MathUtils.clamp(p * 1.4, 0, 1);
        for (let k = 0; k < NS; k++) {
          const t = THREE.MathUtils.clamp((ease - sdelay[k]) / 0.4, 0, 1);
          const s = t * t * (3 - 2 * t);
          const j = k * 3;
          a[j]     = ssrc[j]     + (stgt[j]     - ssrc[j])     * s;
          a[j + 1] = ssrc[j + 1] + (stgt[j + 1] - ssrc[j + 1]) * s;
          a[j + 2] = ssrc[j + 2] + (stgt[j + 2] - ssrc[j + 2]) * s;
        }
        sgeo.attributes.position.needsUpdate = true;
        samples.material.opacity = f * (0.30 + ease * 0.55);
        // The fit only appears once there is enough of a sample to fit to.
        const fit = THREE.MathUtils.clamp((p - 0.34) / 0.4, 0, 1);
        median.material.opacity = f * fit;
        bandHi.material.opacity = bandLo.material.opacity = f * fit * 0.35;
        /* NOT axisMat. The wiring clones every material in the group
           (`o.material = o.material.clone()`), so this closure's reference is
           to an original that nothing renders any more — writing to it did
           nothing at all. Reach the live clones through the objects. */
        const ax = f * 0.8 * THREE.MathUtils.clamp(p * 4, 0, 1);
        g.traverse((o) => {
          if (o.isLine && o !== median && o !== bandHi && o !== bandLo) {
            o.material.opacity = ax;
          }
        });
      },
    };
  })();

  /* ---- process: the index ----
     Was surveyField() a fifth time, as shelves. His actual work here is a
     KNOWLEDGE BASE — "a searchable knowledge base covering technical
     documentation, standard details, and project precedents — enabling rapid
     retrieval". The point is not that documents exist; it is that disorder
     becomes retrievable.

     So: the drawings themselves, arriving from nowhere in particular and
     landing in an ordered grid. The verb is INDEXES, and unlike the shelves
     it is made of the things being indexed. ---- */
  (function indexStation() {
    const g = new THREE.Group();
    const COLS = 6, ROWS = 4, TW = 4.4, TH = 2.9, GX = 5.1, GY = 3.5;
    const tiles = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const n = r * COLS + c;
        const t = sheetMesh(SHEETS[n % SHEETS.length], TW, TH, { edge: 0 });
        const hx = (c - (COLS - 1) / 2) * GX, hy = ((ROWS - 1) / 2 - r) * GY;
        t.userData.home = new THREE.Vector3(hx, hy, 0);
        t.userData.src = new THREE.Vector3(
          hx + (Math.random() - 0.5) * 34,
          hy + (Math.random() - 0.5) * 26,
          (Math.random() - 0.5) * 30);
        t.userData.spin = (Math.random() - 0.5) * 1.5;
        // Centre-out, so the index fills from the middle like a search
        // narrowing rather than a curtain closing.
        t.userData.delay = Math.min(Math.hypot(c - COLS / 2, r - ROWS / 2) * 0.16, 0.7);
        t.position.copy(t.userData.src);
        g.add(t); tiles.push(t);
      }
    }
    stations.process = {
      group: g, look: [0, 0, 0],
      cam: (p) => {
        const a = 0.22 - p * 0.22, d = 34 - p * 7;
        return [Math.sin(a) * d, 1.4 - p * 1.0, Math.cos(a) * d];
      },
      update(p, time, fade) {
        const f = fade == null ? 1 : fade;
        const ease = THREE.MathUtils.clamp(p * 1.35, 0, 1);
        tiles.forEach((t, i) => {
          const u = THREE.MathUtils.clamp((ease - t.userData.delay) / 0.34, 0, 1);
          const s = u * u * (3 - 2 * u);
          t.position.lerpVectors(t.userData.src, t.userData.home, s);
          t.rotation.z = t.userData.spin * (1 - s);
          t.rotation.y = 0.5 * (1 - s);
          t.material.uniforms.uGain.value = 0.45 + s * 0.75;
          setSheetFade(t, f * (0.12 + s * 0.88));
        });
      },
    };
  })();

  /* ---- contact: the title block ----
     Was a survey benchmark: surveyField() a sixth time with a small cube on
     top. A benchmark is a decent metaphor but it was a mound of dots.

     A drawing is not finished until it is signed. The title block is the
     corner of every sheet in this project where the engineer's name goes, and
     a contact section is exactly the moment to draw one — the rules strike in
     first, then the name lands in the DRAWN BY cell.

     Every word rendered here is verbatim from elsewhere on this page. There
     is no drawing number, no revision, no client and no date, because
     inventing any of those would be inventing a record. ---- */
  (function titleBlockStation() {
    const g = new THREE.Group();
    const CW = 1024, CH = 512;
    const cvs = document.createElement('canvas');
    cvs.width = CW; cvs.height = CH;
    const c2 = cvs.getContext('2d');
    const tex = new THREE.CanvasTexture(cvs);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();

    /* Dimmer than the page ink on purpose. Bloom runs at threshold 0.60
       on this dark set, so #e8edf3 on an unlit MeshBasicMaterial went
       straight past the knee and the whole name blew out into a white
       smear. Let the bloom supply the glow, not the fill. */
    const INK = '#aeb9c8', DIM = '#6f7f94';
    const ACC = '#' + ACCENT.getHexString();
    let lastDraw = -1;

    /* Struck in, not faded in. `d` is how much of each rule has been drawn,
       which is the same stroke-dashoffset device the section openers use —
       the page should feel like one instrument, not a bag of tricks. */
    function paint(d, nameIn) {
      c2.clearRect(0, 0, CW, CH);
      c2.fillStyle = 'rgba(10,14,20,0.62)';
      c2.fillRect(0, 0, CW, CH);
      c2.lineWidth = 4; c2.strokeStyle = DIM;

      const line = (x1, y1, x2, y2, k) => {
        const kk = THREE.MathUtils.clamp((d - k) * 3.2, 0, 1);
        if (kk <= 0) return;
        c2.beginPath(); c2.moveTo(x1, y1);
        c2.lineTo(x1 + (x2 - x1) * kk, y1 + (y2 - y1) * kk); c2.stroke();
      };
      // border
      line(14, 14, CW - 14, 14, 0.00);
      line(CW - 14, 14, CW - 14, CH - 14, 0.10);
      line(CW - 14, CH - 14, 14, CH - 14, 0.20);
      line(14, CH - 14, 14, 14, 0.30);
      // cells
      c2.lineWidth = 3;
      line(14, 300, CW - 14, 300, 0.42);
      line(14, 400, CW - 14, 400, 0.50);
      line(330, 400, 330, CH - 14, 0.56);
      line(680, 400, 680, CH - 14, 0.60);

      if (nameIn <= 0) { tex.needsUpdate = true; return; }
      const a = THREE.MathUtils.clamp(nameIn, 0, 1);
      c2.save(); c2.globalAlpha = a;

      c2.fillStyle = DIM;
      c2.font = '500 26px "Space Mono", ui-monospace, monospace';
      c2.fillText('D R A W N   B Y', 40, 100);

      /* FIT THE NAME TO THE CELL.
         Hard-coding 92px overflowed: at that size the string measures wider
         than the drawable width, so the final letter was sliced off by the
         plate edge and the block read as a typo. Measure, then scale. */
      const NAME = 'VIJAY VENKATASAMY';
      const cell = CW - 80;
      let px = 96;
      c2.font = `800 ${px}px Archivo, "Arial Narrow", sans-serif`;
      const wide = c2.measureText(NAME).width;
      if (wide > cell) {
        px = Math.floor(px * cell / wide);
        c2.font = `800 ${px}px Archivo, "Arial Narrow", sans-serif`;
      }
      c2.fillStyle = INK;
      // Clipped from the left, so the name is WRITTEN rather than revealed.
      c2.save();
      c2.beginPath(); c2.rect(40, 118, cell * a, 150); c2.clip();
      c2.fillText(NAME, 40, 122 + px * 0.82);
      c2.restore();

      c2.fillStyle = ACC;
      c2.font = '500 30px "Space Mono", ui-monospace, monospace';
      c2.fillText('CIVIL & STRUCTURAL ENGINEER  ·  GMICE', 40, 362);

      /* The bottom row is 1024px of canvas mapped onto ~240 screen px, so
         20px type arrives as 9px and vanished entirely against the dark
         plate. Sized for the space it actually occupies on screen. */
      c2.fillStyle = DIM;
      c2.font = '500 26px "Space Mono", ui-monospace, monospace';
      c2.fillText('SCALE', 40, 442);
      c2.fillText('SHEET', 356, 442);
      c2.fillText('STATUS', 706, 442);
      c2.fillStyle = INK;
      c2.font = '700 34px "Space Mono", ui-monospace, monospace';
      c2.fillText('1 : 1', 40, 486);
      c2.fillText('1 OF 1', 356, 486);
      c2.fillStyle = ACC;
      c2.fillText('FOR ISSUE', 706, 486);
      c2.restore();
      tex.needsUpdate = true;
    }
    paint(0, 0);

    const block = new THREE.Mesh(
      // 13.5 x 6.75, keeping the canvas's 2:1. At 20 wide the block ran
      // off the right edge once biased clear of the reading scrim, so the
      // name was cut mid-word and the lower cells were never in frame.
      new THREE.PlaneGeometry(11, 5.5, 1, 1),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
    block.userData.selfFade = true;
    g.add(block);

    // The corner mark: a real sheet has one, and it gives the bloom a seed.
    const corner = new THREE.Mesh(
      new THREE.BoxGeometry(0.42, 0.42, 0.42), M.accent);
    corner.position.set(5.0, -2.5, 0.25);
    g.add(corner);

    stations.contact = {
      group: g, look: [0, 0, 0],
      cam: (p) => {
        const a = -0.22 + p * 0.22, d = 27 - p * 3;
        return [Math.sin(a) * d, 0.6 - p * 0.5, Math.cos(a) * d];
      },
      update(p, time, fade) {
        const f = fade == null ? 1 : fade;
        const d = THREE.MathUtils.clamp(p * 1.7, 0, 1);
        const nameIn = THREE.MathUtils.clamp((p - 0.40) / 0.34, 0, 1);
        // Repainting a 1024x512 canvas every frame is a texture upload every
        // frame for no visible gain; only redraw when something moved.
        const stamp = Math.round(d * 90) * 1000 + Math.round(nameIn * 90);
        if (stamp !== lastDraw) { paint(d, nameIn); lastDraw = stamp; }
        block.material.opacity = f;
        corner.scale.setScalar(0.4 + nameIn * 0.6);
        corner.rotation.y = time * 0.0005;
        block.rotation.y = 0.16 - p * 0.16;
        block.rotation.x = -0.03;
      },
    };
  })();

  /* ============================================================
     Wiring: fade groups by which section is on screen
     ============================================================ */
  Object.values(stations).forEach((st) => {
    st.group.visible = false;
    st.group.traverse((o) => { if (o.material) { o.material = o.material.clone(); o.material.transparent = true; } });
    scene.add(st.group);
  });

  const sections = Object.keys(stations)
    .map((id) => ({ id, el: document.getElementById(id), st: stations[id] }))
    .filter((s) => s.el);

  let W = 0, H = 0;
  function resize() {
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return;
    W = r.width; H = r.height;
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    renderer.setSize(W, H, false);
    composer.setSize(W, H);
    bloomPass.resolution.set(W, H);
    camera.aspect = W / H; camera.updateProjectionMatrix();
  }

  const camPos = new THREE.Vector3(0, 6, 28);
  const camLook = new THREE.Vector3(0, 2, 0);
  const wantPos = new THREE.Vector3(), wantLook = new THREE.Vector3();
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  let raf = 0, running = false;
  const clock = new THREE.Clock();

  function frame() {
    if (!running) return;
    // elapsed seconds, so motion is identical at 60Hz and 120Hz
    const time = clock.getElapsedTime() * 1000;
    const vh = innerHeight, mid = vh / 2;

    // which section owns the middle of the viewport?
    // Exactly one station is live: the section the viewport centre sits in.
    // Anything else is hidden outright, otherwise neighbouring geometry bleeds
    // into the frame and you see two scenes at once.
    let owner = null;
    for (const s of sections) {
      const r = s.el.getBoundingClientRect();
      if (mid >= r.top && mid < r.bottom) { owner = s; break; }
    }
    if (!owner) {
      let best = Infinity;
      for (const s of sections) {
        const r = s.el.getBoundingClientRect();
        const d = Math.min(Math.abs(r.top - mid), Math.abs(r.bottom - mid));
        if (d < best) { best = d; owner = s; }
      }
    }

    let active = null, bestDist = Infinity;
    for (const s of sections) {
      const r = s.el.getBoundingClientRect();
      const d = Math.abs((r.top + r.height / 2) - mid);
      const on = s === owner;
      const local = Math.min(Math.max((mid - r.top) / Math.max(r.height - vh * 0.35, 1), 0), 1);
      s.st.group.visible = on;
      // Leaving a station re-arms its entry animation, so coming back to
      // About tears in again rather than silently continuing.
      if (!on && s.st.reset) s.st.reset();
      if (on) {
        /* Fade by whether the viewport centre sits INSIDE the section, not by
           how centred the section is. Tall sections (the openers plus their
           body copy) are never "centred" for most of their scroll, so the old
           model left their geometry at near-zero opacity almost the whole way
           down — which is why the About resolve was never visible. */
        // The owner is fully visible; it only tapers as its edge approaches
        // the viewport centre, so the handover between sections is a crossfade
        // rather than a pop.
        const edge = Math.min(mid - r.top, r.bottom - mid);
        const f = Math.max(0, Math.min(edge / (vh * 0.04), 1));
        s.st.group.traverse((o) => {
          // Stations that run their own crossfade opt out of the blanket fade
          // and receive `f` instead, so the two do not overwrite each other.
          if (o.material && !o.userData.selfFade) {
            o.material.opacity = f * (o.material.userData?.base ?? 1);
          }
        });
        try { s.st.update(local, time, f); } catch (_) {}
      }
      if (on && d < bestDist) { bestDist = d; active = { s, local }; }
    }

    if (active) {
      const c = active.s.st.cam(active.local);
      /* Optional per-station focal length. The stations sit off-axis so the
         copy keeps the left of the frame, and a wide lens then skews a flat
         object into a trapezoid. Going long flattens that back out — the same
         reason you photograph a building elevation on a long lens. */
      if (active.s.st.fov) {
        const want = active.s.st.fov(active.local);
        if (Math.abs(camera.fov - want) > 0.01) {
          camera.fov += (want - camera.fov) * 0.08;
          camera.updateProjectionMatrix();
        }
      } else if (Math.abs(camera.fov - 42) > 0.01) {
        camera.fov += (42 - camera.fov) * 0.08;
        camera.updateProjectionMatrix();
      }
      const ox = innerWidth > 900 ? -6.5 : 0;
      wantPos.set(c[0] + ox + pointer.x * 2.5, c[1] + pointer.y * 1.6, c[2]);
      // Aim left of the geometry so it composes to the RIGHT of the copy on
      // wide screens; centre it on narrow ones where the copy stacks above.
      const L = active.s.st.look;
      const off = innerWidth > 900 ? -6.5 : 0;
      wantLook.set(L[0] + off, L[1], L[2]);
      camPos.lerp(wantPos, 0.055);
      camLook.lerp(wantLook, 0.06);
    }
    pointer.x += (pointer.tx - pointer.x) * 0.05;
    pointer.y += (pointer.ty - pointer.y) * 0.05;

    camera.position.copy(camPos);
    camera.lookAt(camLook);
    grainPass.uniforms.uTime.value = time * 0.001;
    composer.render();
    raf = requestAnimationFrame(frame);
  }


  const start = () => { if (!running) { running = true; raf = requestAnimationFrame(frame); } };
  const stop  = () => { running = false; cancelAnimationFrame(raf); };

  resize();

  if (reduce) {
    // one static frame of the hero, then nothing moves
    const h = stations.hero;
    h.group.visible = true; h.update(1, 0);
    camera.position.set(...h.cam(0.35)); camera.lookAt(...h.look);
    composer.render();
    return { destroy() { renderer.dispose(); } };
  }

  const onMove = (e) => { pointer.tx = (e.clientX/innerWidth)*2-1; pointer.ty = -((e.clientY/innerHeight)*2-1); };
  let rt; const onResize = () => { clearTimeout(rt); rt = setTimeout(resize, 150); };
  const onVis = () => (document.hidden ? stop() : start());

  addEventListener('resize', onResize, { passive: true });
  addEventListener('pointermove', onMove, { passive: true });
  document.addEventListener('visibilitychange', onVis);
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); stop(); });
  start();

  return {
    destroy() {
      stop();
      removeEventListener('resize', onResize);
      removeEventListener('pointermove', onMove);
      document.removeEventListener('visibilitychange', onVis);
      renderer.dispose();
    },
  };
}
