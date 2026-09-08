# Portfolio v2 — Vijay Venkatasamy

A rebuild of [vijayvvs.github.io](https://vijayvvs.github.io/) as a multi-file,
zero-build static site. Deploys to GitHub Pages by copying the folder — no
bundler, no `npm install`, no CI step.

Built from the **current live site** (the `VijayVVS.github.io-main` zip, verified
byte-identical to production by MD5), not from any older local copy.

---

## Run it

**Double-click `OPEN-PORTFOLIO.cmd`.** It finds Python, picks a free port,
serves this folder and opens your browser. Leave the window open while you
browse; close it to stop the server.

**Do not open `index.html` by double-clicking it.** `index.html` uses ES modules
(`<script type="module">`) and browsers block those over `file://` as a
cross-origin request. Measured, not guessed:

| Opened as | Console errors | Result |
|---|---|---|
| `file://` (double-click) | **12** | Content and styling render via the no-JS fallback, but zero JavaScript — no 3D hero, no scroll animation, no horizontal rail |
| `http://` (the launcher) | **0** | Everything runs |

The error is `Access to script at 'file:///…/js/main.js' from origin 'null' has
been blocked by CORS policy`.

This affects local previewing only. **GitHub Pages serves over HTTPS, so the
deployed site has no such problem** — it behaves exactly like the launcher.

Prefer the command line, or on macOS/Linux:

```bash
python -m http.server 8080
```

---

## Structure

```
index.html            all content, one file
css/
  tokens.css          palette, type scale, spacing, motion — edit this first
  base.css            reset, typography, focus, tap targets
  layout.css          shell, nav, sections, responsive grids
  components.css      buttons, cards, timeline, the scroll
  motion.css          reveal states, keyframes, reduced-motion + print
js/
  main.js             entry — wires the modules together
  hero-truss.js       the animated hero
  reveal.js           scroll reveals, counters, skill meters
  nav.js              scrollspy, drawer, unroll, magnetic buttons
assets/
  *.png               your originals, untouched
  Vijay-Venkatasamy-Civil-Structural-Engineer-CV.pdf
  opt/*.webp          generated responsive images (see below)
```

**Change the look from `tokens.css`.** Every colour, size, duration and easing
is a custom property there. Nothing downstream hardcodes a value.

### The ground is dark, and it was chosen by measurement

`scratchpad/palette_dark.py` scores five dark candidates the same way the light
one was scored, with one change stated in the file: the original scorer carried
a PRINT axis worth 0.10 whose only purpose was to penalise dark grounds. That
axis answers "light or dark", and that question is settled, so it is reported
as a known cost rather than scored, and its weight moved to the weakest text
pair and colour-blind separation.

    Graphite + safety orange          0.921
    Ink slate + safety orange         0.918
    Blueprint navy + drafting cyan    0.891
    Deep slate + amber                0.887
    Warm dark (the old live site)     0.846

The top two tied within noise. Swapping ink slate's accent for a hotter orange
settled it: **ink slate + `#f97316`, 0.954**, better than both on *every* axis —
same 100% AA, stronger weakest pair (5.39 vs 4.56), more salient accent (7.03
vs 6.59), better CVD separation (0.89 vs 0.86). No trade was made.

**Print cost, stated not hidden:** ground luminance 0.003 against 0.954. A
printed page or PDF export costs ink. `motion.css` carries the `@media print`
block; that is where this is paid for, not by lightening the screen.

---

## Content provenance — read this before editing

**Every factual, technical and credential statement is copied verbatim from your
live site.** Project bullets come from the original "Unroll Details" modals
(`scroll1`–`scroll5`), including the exact framing you wrote: *My Contribution*,
*Lesson Learned*, *Design Innovation*, *Client Saving*, *Skills Demonstrated*.

All 70 technical list items were diffed against the original and are traceable.
The only text authored for this build is UI chrome, which makes no claim:

- "Skip to content" · "Open navigation menu" (accessibility)
- "Select a project to unroll the detail." (navigation hint)
- "Download CV" · "(PDF, 67 KB)" (file size verified: 68,622 bytes)
- image `alt` text, and the JSON-LD block (mirrors your stated facts)

**If you add a project, copy the wording from source. Do not let anything —
including me — write or paraphrase an engineering claim on your behalf.** You are
GMICE working toward CEng MICE and IStructE; invented detail about real client
work is a professional risk, not a copy-editing one.

To re-verify after any edit, diff the rendered text against the original HTML and
confirm every `<li>`, callout and credential line still matches.

### The provenance audit, run properly — and what it found

`scratchpad/content_diff.py` + `token_check.py` extract every rendered string
(text nodes plus `alt`, `aria-label`, `title`) from both files and compare them
two ways: exact-substring, then word-level, because a regrouped table cell is a
reflow and a genuinely new word is an invention.

**Baseline matters.** Two different `index.html` files sit on disk: the ZIP
copy (MD5 `3867c646…`, 144,828 bytes) and a loose extracted folder
(`1016a59f…`, 94,193 bytes — an older export). The README names the zip as the
version verified against production, and diffing against the wrong one
manufactured 144 phantom "additions".

**Nothing was invented.** Of 61 strings in the rebuild not traceable verbatim,
every single one is UI chrome that makes no claim — navigation, accessibility
labels, gallery controls, section numbering, file sizes. The word-level pass
confirms it: not one engineering, client or credential statement introduces a
word the original did not contain, and contact details match exactly. The CV
was 349,952 bytes (342 KB) at the time of that audit; it has since been
replaced with a newer one, Vijay-Venkatasamy-Civil-Structural-Engineer-CV.pdf,
at 68,622 bytes (67 KB), and both size labels in the page were updated to match.

**But content had been LOST, and two items were wrong.** This is the part the
old claim of "all 70 items traceable" missed, because it only ever checked in
one direction:

| Defect | What was there | What the rebuild had |
|---|---|---|
| **Parapet Wall callout** | *Design Innovation:* "Counterweight system eliminated all roof penetrations — understanding the client's real constraint, not just the structural problem." | a **duplicate of Shopfront's** Lesson Learned |
| **HS2 outcome** | *Outcome:* "10% cost reduction through structural optimisation without compromising safety or sustainability targets." | a **list bullet promoted into the callout**, and the bullet itself then missing |
| Digital Innovation | its own "The Challenge" paragraph (Awaab's Law) | no Challenge at all — the only project without one |
| Process section | *Engineering Principle:* "AI supports data capture and prioritisation…" | dropped |
| Contact | Location / Current Role / Chartership rows, and the intro line | dropped |
| Experience | the whole **Competencies** block (10 chips), plus Revit, and "Tekla TSD" renamed | dropped |
| Digital Innovation | the **Technologies Used** block (6 chips) | dropped |
| Rail | "Package procurement support for Petronas ETP Malaysia"; "…for regulatory compliance" | abbreviated away |
| Research | Seismic Analysis, Risk Assessment; "Monte Carlo" for "Monte Carlo Simulation" | dropped / shortened |

All restored verbatim, and re-verified on rendered text: **34 of 35 restored
items present**, the last one a node-splitting artifact of the diff, not a gap.
The remaining 10 reported differences are all either split across tags
(`<strong>10%</strong>`, `<span id="year">`) or UI chrome the rebuild words
differently.

**The lesson worth keeping:** a one-directional diff ("is anything invented?")
is only half an audit. Content can be lost, duplicated onto the wrong project,
or quietly substituted — and none of those show up unless you also ask *what
did the original say that this no longer does?*


---

## The 3D hero

The hero is a WebGL scene: **a three-bay portal frame that erects itself as you
scroll**, in true construction sequence — pad foundations, columns, rafters to the
apex, purlins, then cross-bracing last. The camera orbits as it goes and the
headline hands the stage over as the frame tops out.

The choice was deliberate: an abstract 3D blob would say nothing. A steel frame
going up says exactly what you do.

- `js/hero-3d.js` — Three.js r160, loaded from jsDelivr as an ES module
- The `.hero` section is a **200svh scroll runway**; `.hero-stage` pins inside it
  so the sequence has room to play instead of racing past in one screen
- Members are declared in erection order (`seq` 0-4) and grow along their own axis

**Fallbacks, in order:** no WebGL or CDN blocked → the 2D canvas truss
(`hero-truss.js`); `prefers-reduced-motion` → one static finished frame, no loop;
hero off-screen or tab hidden → the loop parks. `body[data-hero]` records which
one actually started.

> **Gotcha worth remembering:** `body { overflow-x: hidden }` makes body a scroll
> container and **silently breaks `position: sticky`** on every descendant — it is
> what stopped the pinned stage pinning. Use `overflow-x: clip`. Both `html` and
> `body` use `clip` here; changing either back will break the hero.

---

## Why every section has its own opener

The original complaint, correctly: only the first screenful owned a full
viewport. Everything below it was a heading with cards underneath, so the page
was front-loaded and the hero was doing all the work.

Every section now opens with a **full-viewport moment** — oversized type plus a
device drawn from what that section is actually about:

| Section | Device |
|---|---|
| 01 About | The portrait sampled to a survey grid, resolving into relief |
| 02 Experience | The drawing set, stacked in depth, brought forward a sheet at a time |
| 03 Featured work | Rolled drawings on their dowels — the site's signature object at scale |
| 04 Project experience | The set laid out edge to edge, running past with the rail |
| 05 Research | The fragility curve: Monte Carlo scatter converging onto a fitted median |
| 06 Process | The drawings arriving out of disorder into an ordered index |
| 07 Contact | A drawing title block, struck in, then signed |

**These are WebGL, not inline SVG.** The stations live in `js/scene-3d.js` on one
shared canvas — see "One canvas, seven stations" below.

**They are built from his own drawings.** Five of them used to be generated
abstraction, and four of those five were the same point-cloud helper with a
different height function — which is not four ideas, it is one effect shown
four times. Seven scans of the real work were sitting unused in `assets/`. The
two sections that always read as expensive were the two made of real material
(the portrait, the rolled drawings); the rest now are too.

**No sheet is captioned or attributed to an employer anywhere in the 3D.**
Which drawing belongs to which job is not something the code is entitled to
assert.

The devices are inline SVG that draws itself in via `stroke-dashoffset` on
reveal. No library. Under `prefers-reduced-motion` they render complete.

**None of these pin.** The pin budget — ui-ux-pro-max motion data says 1-2 per
page — is spent on the hero and the horizontal rail. The openers are full-bleed
but scroll normally, so the page never fights the scrollbar.

---

## The design idea

Your live site already had the strongest concept: a **rolled technical drawing**
that unrolls to reveal detail (`--scroll-bg`, `--roller`). That is the signature
element, so it is where the boldness is spent — the parchment gets a printed
drafting grid, a rotating roller dowel, and a torn-edge gradient. Everything else
stays deliberately quiet so the scroll reads as the feature.

The hero background is a **pin-jointed truss**, not a particle field: nodes spring
back to an "as-designed" anchor position, members render at an opacity proportional
to their axial strain, and load pulses walk from member to member. Moving the
pointer deflects the structure and it recovers.

---

## One canvas, seven stations

`js/scene-3d.js` draws every section's 3D on **one** fixed canvas with one
renderer and one camera — eight canvases would each cost a GL context and
browsers cap you around 8–16. Each section registers a station:

```js
stations.NAME = { group, look:[x,y,z], cam:(p)=>[x,y,z], update(p, time, fade){} }
```

Two things about that contract are easy to get wrong, and both cost real time:

- **`look.x` stays 0.** The frame loop already subtracts 6.5 from *both* the
  camera position and the look target on wide screens — that is what composes
  geometry to the right of the copy. A station that adds its own negative
  offset stacks on top of it and slides off the right edge of the viewport.
- **The third argument to `update` is a FADE, not a pointer.** Stations that
  run their own crossfade set `userData.selfFade = true` on their meshes to opt
  out of the blanket traverse, and must then apply `fade` themselves. The
  wiring also *clones* every material in the group, so a closure holding a
  reference to the original material writes to something nothing renders.

### The shadow catcher must not write depth

The scene carries a 200×200 horizontal plane at `y = -0.36` that exists only to
receive shadow. Writing depth, its horizon runs across the middle of the frame
for any camera near `y = 0`, and it **silently occluded the lower part of every
station below that line**. It was invisible on the old off-white page, so the
clipping looked like a composition choice.

Measured: the contact title block rendered 522 × 149 px from a geometry of
11 × 5.5 — aspect 3.50 where it should be 2.00, i.e. the bottom 43% of the
plate did not exist and its lower cells were being drawn to the texture and
thrown away. With `depthWrite = false` the same plate measures 524 × 265,
aspect 1.98.

### Bloom, and why it was throttled before

On the light page bloom ran at strength 0.22 with threshold **0.978**, and both
numbers were defensive: `#f8fafc` has luminance 0.961, so any threshold below
that made *the page ground itself* a bloom source whose glow lifted every pixel
on top of it. A near-black ground has luminance 0.003, so there is nothing to
defend against — 0.55 at threshold 0.60 is the documented setting for a dark
scene, and it is what makes lit steel read as lit.

For the same reason `RoomEnvironment` had to go: it is a light grey box, which
is the correct stand-in for an HDRI on a pale page and the worst thing in the
scene on a dark one. It is replaced by a built dark studio — a near-black room
with one warm softbox and one cold rim panel, baked through the same PMREM
path. Real reflections, still no download.

---

## The watermark in the scans

**All seven drawings carried a white four-point sparkle watermark burned into
the bottom-right corner.** It is invisible on white paper, which is why it was
never noticed — and the moment the drawings are inverted for a dark ground it
becomes a bright star floating over the work.

Removed by diffusion inpainting into **new files**; the originals are untouched:

```
assets/clean/*.png                 de-watermarked full-size
assets/opt/*-clean-{800,1600}.webp what index.html and scene-3d.js load
```

Two things the first two attempts got wrong, both visible in the output:
the dilation has to swallow the mark's anti-aliased halo (5px left a ghost
ring), and the grain statistics have to be taken from **paper pixels only** —
computed over the whole ring they include nearby linework, inflate enormously
and leave a speckled sparkle-shaped smudge exactly where the mark was. The
mask must also never cover ink, or the fill smears the adjacent lettering.

---

## Images: 12.61 MB → 0.56 MB

The repo carried 7 photographs saved as PNG at ~2 MB each. PNG is the wrong format
for photographs. `assets/opt/` holds WebP at 1600px and 800px, quality 82, wired up
via `<picture>` with the original PNG as the fallback `<img src>`.

**95.5% smaller.** This is the single largest performance win on the site.

To regenerate after adding a photo (needs Pillow):

```bash
python -c "from PIL import Image; import glob,os; [ [Image.open(f).convert('RGB').resize((w, round(Image.open(f).height*w/Image.open(f).width)), Image.LANCZOS).save(f'assets/opt/{os.path.splitext(os.path.basename(f))[0]}-{w}.webp','WEBP',quality=82,method=6) for w in (1600,800)] for f in glob.glob('assets/*.png')]"
```

---

## Accessibility fixes carried over from the audit

The baseline audit of the live site found 2 high / 4 medium. Addressed here:

| Finding | Status |
|---|---|
| 16 buttons/links with no accessible name | **Fixed** — `.sr-only` labels on every icon control |
| 17 images with no width/height (layout shift) | **Fixed** — intrinsic dimensions on all |
| 20 tap targets < 44×44px on mobile | **Fixed** — enforced under `@media (pointer: coarse)` |
| ~61/120 text nodes below WCAG AA | **Fixed** — `--text-muted` was `#5a4a38` at **2.20:1**; now `#948063` at **4.92:1** |
| Horizontal scroll at 360/390px | **Fixed** — explicit grid breakpoints |
| Content invisible without scrolling | **Fixed** — see below |

### Measured again after the rebuild — and the harness was the thing at fault

The bundled audit walks the DOM looking for a `background-color`, which cannot
work on a page whose backdrop is a WebGL canvas. `../portfolio-design-stack/truthaudit.mjs`
does not guess: for every text node it hides the text, screenshots, and reads
**the pixels actually rendered behind it**. Immune to gradients, canvases,
filters, `backdrop-filter` and stacking.

**The shallow audit was not enough.** `truthaudit.mjs` only ever measured what
is on screen with no interaction, so everything inside a collapsed panel was
never checked — and that is exactly where the worst defect on the site was
hiding. `deepaudit.mjs` opens every collapsible, sweeps the horizontal rail
across its travel, and walks the document in overlapping steps.

Final run — **2,908 text-node samples**, 7 panels open, 29 scroll stops at
390px (touch emulated) and 25 at 1440px:

| Check | Result |
|---|---|
| Contrast, measured against real rendered pixels, panels OPEN | **0 failures** both viewports |
| Tap targets under 44×44 on a real touch context | **0** |
| Horizontal overflow at 390px | **0px** |
| Console / page errors | **none** |
| Prose rendering under 14px at 100% zoom | **0** |

What only the deep pass could see — every one of these was invisible to the
shallow audit because it never opened anything:

| Element | Was | Now |
|---|---|---|
| Research chips (MATLAB, ANSYS, Monte Carlo…) | **1.46:1** | 7.36:1 |
| Case-study link on the drawing panel | **1.45:1** | 7.87:1 |
| Timeline role | 4.26:1 | 5.27:1 |
| Timeline dates | 4.43:1 | 6.61:1 |
| Rail hint | 4.05:1 | 6.05:1 |
| Oversized section numerals 01–07 | **1.61:1** | 3.71:1 |

The first two share one root cause: **inline styles and rules still using
parchment-era tokens.** `style="border-color:var(--scroll-line);color:var(--roller-dark)"`
sat on eight chips in the HTML — `--roller-dark` is a dark ink that was correct
on a cream sheet and is invisible on a dark panel, and `--scroll-line` no longer
exists at all, so `border-color` was invalid-at-computed-value-time and fell
back to `currentColor` — the same invisible ink, which is why the outlines had
gone too. Inline styles bypass the token system `tokens.css` is supposed to be
the single source of truth for; they are gone.

### Three harness bugs that produced false failures

Worth recording, because each looked exactly like a page defect:

- **`animations: 'disabled'`** — ruled out by test, not assumption.
- **Viewport-edge sampling.** An element straddling the top edge
  (`rect.top = -33`) passed a naive on-screen test; six of its nine sample
  points then fell above the viewport and the three survivors landed on the
  page *below* it. The harness compared the button's ink to the floor and
  reported **1.05:1 on a button that measures 7.03:1** at every scroll
  position. Fixed: an element must be ≥75% in frame and keep ≥6 of 9 points.
- **Memory.** Returning `Array.from(getImageData(...))` is 5.2M array entries
  per stop at 1440×900; the run passed 1.9 GB and died before reporting
  desktop. Sampling is now done in-page and returns only the points asked for.

Getting to a trustworthy number meant fixing the harness four times, and every
one of those was a lesson worth keeping:

- **Emulate touch.** The 44px rule lives behind `@media (pointer: coarse)`,
  which does not match a default Playwright context — so it measured desktop
  styles at phone width and "found" tap-target failures that exist on no phone.
- **Wait for Lenis.** Smooth scroll keeps easing after `scrollTo` returns, so
  element rectangles captured during the ease no longer match the screenshot.
- **Check ANCESTOR opacity.** The hero copy fades out as the frame erects, so
  partway down the sticky runway a button reads `opacity: 1` on itself while
  being 20% visible.
- **Sample a grid, not a point.** A single centre pixel lands on a glyph. A
  button measuring 7.03:1 across 33 of 35 sampled pixels was reported as a
  1.51:1 failure because one sample hit a letter.

Three real defects came out of it, all of which the old checker would have
missed and none of which were visible by eye:

1. `.btn-primary` used `color: #fff`. The accent moved from `#c3490a` to the
   brighter `#f97316`, which drops white text to **2.80:1** — a WCAG failure on
   the primary call to action. Dark ink on it measures 7.03:1.
2. The borehole station's ground plane was `#e4eaf1`, chosen to disappear
   against an off-white sheet. Under the dark set's key light it became a
   blazing white slab with the entire career timeline set on top of it.
3. `#stage-scrim` at `z-index: 1` painted **over the whole hero**. `position:
   sticky` creates a stacking context, so `.hero-stage` and its contents paint
   as one unit at `z-index: auto`; `.hero-inner`'s internal `z-index: 1` does
   not lift it clear. Measured, the "View projects" button rendered
   `rgb(33,22,16)` instead of `rgb(249,115,22)`.

### Two notes on the remaining audit output

The audit still reports `focus-visible` and `contrast`. Both were investigated and
are **artifacts of the checker**, not defects:

- **contrast** — the failures are all text on the parchment. The checker walks up
  the tree looking for `background-color`, but `.scroll-paper` paints itself with
  `background-image` gradients, so it falls through to the dark page ground.
  Measured properly, the parchment text is **8.22–13.50:1 (AAA)**. An explicit
  `background-color` has been added so tools read it correctly.

- **focus-visible** — the check does `querySelectorAll(...).slice(0, 25)` with no
  visibility filter, then calls `.focus()` on each. Hidden elements cannot take
  focus, so they always count as failures — and `:focus` does not match at all in a
  document without OS focus, which is the case in headless capture. **Verify focus
  styling by tabbing through the page in a real browser**, not via the audit.

  *This was partly real and is now fixed:* the desktop nav and the mobile drawer
  used to be two copies of the same five links, so five were always hidden and
  always counted as failures. They are now **one list** that restyles at the
  breakpoint. The count dropped 11 -> 6 on mobile and 7 -> 2 on desktop, exactly
  the five duplicates. What remains is the `:focus`-needs-document-focus limit.

  The `tap-target` finding does not reproduce: measured directly in an emulated
  mobile context at both 360px and 375px, there are **0** sub-44px targets and
  **0** horizontal overflow. Reported here as unreconciled rather than fixed.

### Content visibility

Reveal-on-scroll must never be the only route to visible content. `reveal.js` adds
three safety nets: above-the-fold elements reveal immediately, `beforeprint`
reveals everything, and a 2.5s backstop covers crawlers, screenshotters and PDF
exporters that never scroll. `motion.css` also carries full `@media print` and
`.no-js` fallbacks.

Collapsed scroll sheets use `visibility: hidden`, not just `overflow: hidden` —
otherwise keyboard users tab into links they cannot see.

`prefers-reduced-motion` is treated as a hard contract: every animation resolves
instantly, including the decorative loops and the hero canvas.

---

## Deploying

Copy the contents of this folder into the root of the `VijayVVS.github.io` repo
and push. Keep `assets/` — the `<picture>` fallbacks point at the original PNGs.

Before pushing, re-run the audit against the local server to confirm nothing
regressed:

```bash
node ../portfolio-design-stack/scripts/design-audit.mjs --url http://localhost:8080/
```
