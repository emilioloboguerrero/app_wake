# Wake — Design & Code Standards

Read this document before writing any UI code. It is the canonical reference for visual style, animation language, component patterns, and data structure.

---

## 1. Core Aesthetic

The overall mood is **dark, cinematic, premium minimalist**.

Everything lives on a near-black `#1a1a1a` canvas. Content is white in different tones of opacity — nothing is opaque white except the most critical interactive targets. Color comes from a single dynamic accent extracted from the screen's primary content image. Screens without images use white tones only.

Key principles:
- **One canvas color:** `#1a1a1a` — deep charcoal, not pure black
- **One accent:** extracted from the hero image at runtime, not hardcoded. Screens without an image use white tones only — no fallback brand color.
- **White at opacity:** UI elements use `rgba(255,255,255,X)` — everything belongs to the same dark world
- **Depth through blur:** background images blur and desaturate when focus is needed, not covered with solid colors
- **Orbs for ambient light:** blurred color pools drift in the background
- **Spring physics on everything:** nothing animates linearly — arrivals are fast-then-slow

---

## 2. Color System

### Dynamic Accent (screens with a content image)

Extract the accent at runtime from the primary content image using a canvas pixel scan. Pick the most vivid pixel — highest `saturation × brightness` score — skipping near-black (max < 40) and near-white (max > 245).

```js
const sat = (max - min) / max;         // HSV saturation
const score = sat * (max / 255);       // weighted by brightness
```

Expose as CSS custom properties on the root element:
```css
--accent:     rgb(R, G, B)
--accent-r:   R
--accent-g:   G
--accent-b:   B
--accent-text: #111111  /* if WCAG luminance > 0.35 */
               #ffffff  /* if dark accent */
```

`--accent-text` ensures labels on accent backgrounds remain readable.

### White Tone Palette (all screens)

| Role | Value | Usage |
|---|---|---|
| Page background | `#1a1a1a` | Full canvas, no exceptions |
| Primary text | `#ffffff` | Headlines, primary labels |
| Secondary text | `rgba(255,255,255,0.5)` | Subtitles, descriptions |
| Tertiary text | `rgba(255,255,255,0.25)` | Metadata, captions |
| Dimmed text | `rgba(255,255,255,0.16)` | Placeholder text |
| UI track / border | `rgba(255,255,255,0.07–0.18)` | Bars, input underlines, card borders |
| Error | `rgba(224,84,84,0.9)` | Validation messages |

### Glass / Frosted Surfaces

For secondary elements, cards, ghost buttons:
```css
background: rgba(255,255,255,0.07);
border: 1px solid rgba(255,255,255,0.15);
backdrop-filter: blur(8px);
```

Hover:
```css
background: rgba(255,255,255,0.12);
border-color: rgba(255,255,255,0.28);
```

---

## 3. Background Layer System

Three layers stacked (`position: absolute; inset: 0`):

### Layer 1 — Background Image (z-index: 0)

The content image fills the viewport. State-based appearance:

| State | Filter | Transform |
|---|---|---|
| Hero / visible | `none` | `scale(1)` |
| Supporting / form | `blur(28px) saturate(0.45)` | `scale(1.1)` |
| Success | `none` | `scale(1)` |

`scale(1.1)` on blur prevents edge artifacts from showing.

When no image exists:
```css
background: radial-gradient(ellipse at 50% 55%, rgba(var(--accent-r),var(--accent-g),var(--accent-b),0.28) 0%, #1a1a1a 65%);
```

### Layer 2 — Overlay Gradient (z-index: 1)

Transitions between states via `transition: background 0.9s ease`.

**Hero overlay:**
```css
linear-gradient(to bottom, rgba(0,0,0,0.16) 0%, rgba(0,0,0,0.02) 30%, rgba(0,0,0,0.75) 100%)
```

**Dark overlay** (form/content screens):
```css
rgba(0,0,0,0.76)
```

**Success overlay:**
```css
linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.70) 100%)
```

### Layer 3 — Ambient Orbs (z-index: 2)

See §4.

---

## 4. Ambient Orbs

Three circular divs — `border-radius: 50%`, `filter: blur(72px)` — blurry enough to read as formless light clouds. Color: `rgba(var(--accent-r),var(--accent-g),var(--accent-b),0.13)`.

```
Orb 1: 320×320px — top-right  (-80px top, -60px right)
Orb 2: 260×260px — bottom-left (5% bottom, -70px left)  opacity 0.85
Orb 3: 200×200px — mid-right   (38% top, 8% right)       opacity 0.65
```

Each drifts on `animation: orbDriftN Xs ease-in-out infinite alternate`:

```css
@keyframes orbDrift1 { from { transform: translate(0,0) scale(1); }    to { transform: translate(-28px,44px) scale(1.08); } }
@keyframes orbDrift2 { from { transform: translate(0,0) scale(1); }    to { transform: translate(38px,-32px) scale(0.92); } }
@keyframes orbDrift3 { from { transform: translate(0,0) scale(1); }    to { transform: translate(-18px,26px) scale(1.06); } }
```

Durations: **13s, 17s, 21s** — prime-ish so they never synchronize. Mismatched durations create a slowly shifting, non-repeating pattern that feels alive, not mechanical.

---

## 5. Animation Language

### Easing Reference

| Name | Values | Character | When to use |
|---|---|---|---|
| **Spring** | `cubic-bezier(0.22, 1, 0.36, 1)` | Fast → slow stop, no bounce | UI elements moving into position, entrances |
| **Material** | `cubic-bezier(0.4, 0, 0.2, 1)` | Snappy ease-in-out | Progress bars, dashoffset, confirmations |
| **Ease-out** | `ease-out` | Fast start, natural deceleration | Element exits, ring expansion |
| **Ease-in-out** | `ease-in-out` | Symmetric acceleration | Shimmer sweeps, orb drift, pulse rings |
| **Ease** | `ease` | Gentle S-curve | Fade transitions, background changes |
| **Quadratic eIO** (JS rAF) | `t<.5 ? 2t² : -1+(4-2t)t` | Smooth programmatic motion | SVG path tip synchronization |

### Universal Entrance Pattern

Every element entering the screen animates in — never just appears. Apply to all new components:

```css
@keyframes enterUp {
  from { opacity: 0; transform: translateY(24px); }
  to   { opacity: 1; transform: translateY(0); }
}
/* duration: 0.42–0.5s, easing: cubic-bezier(0.22,1,0.36,1) */
```

Rules:
- Always fade + translate — never fade alone
- Travel distance: 20–40px depending on element size (small text: 12px; full sections: 40px)
- Scale entrances: start from 88–95%, never from 0%
- Groups of elements: stagger 50–150ms between items
- Direction-aware for step/page transitions: forward = enters from below, back = enters from above

### Step / Page Transitions

```css
@keyframes stepEnterUp {
  from { opacity: 0; transform: translateY(40px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes stepEnterDown {
  from { opacity: 0; transform: translateY(-40px); }
  to   { opacity: 1; transform: translateY(0); }
}
/* 0.42s cubic-bezier(0.22,1,0.36,1) */
```

When using React `key` to remount step content: read a direction flag (`forward` / `back`) and apply the matching animation class.

### Phase / Screen Fade

For full-screen phase transitions:
```css
@keyframes fadeIn {
  from { opacity: 0; }
  to   { opacity: 1; }
}
/* 0.5s ease */
```

---

## 6. Loading Patterns

### WakeLoader — SVG Shimmer

A custom SVG spinner that sweeps light through the Wake logo shape.

```
SVG 80×80
├── defs
│   ├── mask (id=wl-m-N): clips to logo shape
│   └── linearGradient (id=wl-g-N): white 0%→100%→0% over ~40px span
├── image (logo) at opacity 0.18   ← dim ghost, always visible
└── rect (gradient fill, masked)   ← sweeping light
```

Sweep via `requestAnimationFrame`, not CSS. The gradient `gradientTransform="translate(x, 0)"` moves from x=-30 to x=+110 over 72% of a 2700ms cycle, then resets instantly (off-screen). Result: one sweep, pause, another sweep — not a spinner wheel.

### Curved Progress Line

A sinusoidal SVG path spanning the full viewport height. Two overlaid paths:

- **Track:** `stroke: rgba(255,255,255,0.06)` — always shows the full route
- **Active fill:** same path with `stroke-dasharray/dashoffset`:

```css
strokeDashoffset: totalLength * (1 - progressFraction)
transition: stroke-dashoffset 700ms cubic-bezier(0.4,0,0.2,1)
```

**Glowing tip** — three concentric circles at the leading edge:
```
r=10: fill rgba(255,255,255,0.06)   outer halo
r=5:  fill rgba(255,255,255,0.12)   mid halo
r=2.8: fill rgba(255,255,255,0.72)  bright core
```

Tip position calculated via `rAF` with quadratic ease-in-out so it arrives exactly when the dashoffset transition lands.

### Topbar Progress Bar

2px hairline at the very top of the screen:
```css
/* Track */
height: 2px;
background: rgba(255,255,255,0.07);

/* Fill */
background: rgba(255,255,255,0.5);
transition: width 0.55s cubic-bezier(0.4,0,0.2,1);
```

---

## 7. Completion Moments

### Expanding Rings

Three stacked circles `76×76px`, `border: 1px solid rgba(255,255,255,0.25)`, delays 0s / 0.32s / 0.64s:

```css
@keyframes ringExpand {
  from { transform: scale(0.4); opacity: 0.8; }
  to   { transform: scale(3.2); opacity: 0; }
}
/* 2s ease-out forwards */
```

### SVG Checkmark Draw

Circle first, then tick:
```css
/* Circle: dasharray 146, dashoffset 146 → 0 */
/* 0.65s cubic-bezier(0.4,0,0.2,1) delay 0.15s */

/* Tick: dasharray 40, dashoffset 40 → 0 */
/* 0.36s ease-out delay 0.72s */
```

### Staggered Text Cascade

All confirmation text slides up from `translateY(12px)`:
```css
@keyframes textSlideUp {
  from { opacity: 0; transform: translateY(12px); }
  to   { opacity: 1; transform: translateY(0); }
}
/* 0.5s cubic-bezier(0.22,1,0.36,1) */
/* Stagger: 150ms between each text element */
```

### Action Confirmation Bounce

Tight elastic response on copy/confirm actions:
```css
@keyframes confirmPop {
  0%   { transform: scale(1); }
  30%  { transform: scale(1.04); }
  60%  { transform: scale(0.97); }
  100% { transform: scale(1); }
}
/* 0.38s cubic-bezier(0.22,1,0.36,1) forwards */
```

---

## 8. Component Visual Patterns

### Primary Button

```css
background: var(--accent);
color: var(--accent-text);
border-radius: 14px;
padding: 18px 24px;
font-weight: 700;
letter-spacing: 0.02em;
```

Pulse ring animation on idle (draws attention without motion inside the button):
```css
@keyframes ctaPulse {
  0%, 100% { box-shadow: 0 0 0 0    rgba(var(--accent-r),var(--accent-g),var(--accent-b),0.45); }
  60%       { box-shadow: 0 0 0 14px rgba(var(--accent-r),var(--accent-g),var(--accent-b),0); }
}
/* 2.6s ease-in-out infinite */
```

Hover: `opacity: 0.88`. Active: `transform: scale(0.977)`.

### Secondary / Glass Button

```css
background: rgba(255,255,255,0.07);
border: 1px solid rgba(255,255,255,0.15);
border-radius: 14px;
color: rgba(255,255,255,0.65);
overflow: hidden;
```

Repeating shimmer via `::after`:
```css
::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.06) 50%, transparent 100%);
  transform: translateX(-100%);
  animation: shimmer 2.5s ease-in-out 1.2s infinite;
}
@keyframes shimmer {
  from { transform: translateX(-100%); }
  to   { transform: translateX(100%); }
}
```

### Input Fields

Underline-only — no box, no background:
```css
background: transparent;
border: none;
border-bottom: 2px solid rgba(255,255,255,0.18);
color: #fff;
font-size: clamp(1.25rem, 4.5vw, 1.65rem);
font-weight: 400;
padding: 6px 0 14px;
caret-color: rgba(255,255,255,0.6);
```

Focus: `border-bottom-color: rgba(255,255,255,0.5); transition: border-color 0.25s;`

Placeholder: `rgba(255,255,255,0.16)`.

### Choice Pills (multiple choice)

```css
background: rgba(255,255,255,0.05);
border: 1.5px solid rgba(255,255,255,0.10);
border-radius: 12px;
color: rgba(255,255,255,0.70);
padding: 16px 20px;
transition: background 0.18s, border-color 0.18s, color 0.18s, transform 0.12s;
```

Selected: `border-color: rgba(255,255,255,0.42)`, background `0.10`, color `#fff`.
Active press: `transform: scale(0.98)`.

### Cards

Three-layer shadow — always use at least two shadow layers plus the glass rim:
```css
box-shadow:
  0 32px 80px rgba(0,0,0,0.65),    /* deep far shadow */
  0 8px  24px rgba(0,0,0,0.4),     /* closer ambient shadow */
  0 0 0 1px rgba(255,255,255,0.06); /* 1px glass rim — lifts from background */
```

The 1px white rim is the key detail. It separates the card from any dark background without a visible border.

Card entrance (fires on image load / data ready):
```css
@keyframes cardExpand {
  from { opacity: 0; transform: scale(0.88); }
  to   { opacity: 1; transform: scale(1); }
}
/* 0.9s cubic-bezier(0.22,1,0.36,1) */
```

Accent glow behind card (when accent is available):
```css
background: radial-gradient(circle, rgba(var(--accent-r),var(--accent-g),var(--accent-b),0.28) 0%, transparent 70%);
filter: blur(20px);
animation: glowPulse 3.5s ease-in-out infinite alternate;

@keyframes glowPulse {
  from { opacity: 0.7; transform: scale(0.95); }
  to   { opacity: 1;   transform: scale(1.05); }
}
```

### Stamp-In Badge

For status badges that appear on top of content:
```css
@keyframes stampIn {
  from { opacity: 0; transform: rotate(8deg) scale(2.2); }
  to   { opacity: 1; transform: rotate(8deg) scale(1); }
}
/* 0.55s cubic-bezier(0.22,1,0.36,1) 0.6s both */

/* Styling */
background: #fff;
color: #111;
font-weight: 900;
letter-spacing: 0.14em;
border-radius: 4px;
```

### Progress / Capacity Bar

4px hairline bar:
```css
/* Track */
height: 4px;
background: rgba(255,255,255,0.10);
border-radius: 4px;

/* Fill */
background: rgba(var(--accent-r),var(--accent-g),var(--accent-b),0.9);
transition: width 0.6s cubic-bezier(0.4,0,0.2,1);
```

---

## 9. Typography

Font family: `'Inter', sans-serif`
Apply globally: `-webkit-font-smoothing: antialiased`

| Element | Size | Weight | Notes |
|---|---|---|---|
| Hero / success title | `clamp(1.8rem, 6vw, 2.4rem)` | 800 | Responsive |
| Form question / heading | `clamp(1.6rem, 5.5vw, 2.1rem)` | 700 | Dominant, editorial |
| Large headline | `clamp(2rem, 7vw, 3rem)` | 800 | `text-shadow: 0 2px 24px rgba(0,0,0,0.5)` |
| Input text | `clamp(1.25rem, 4.5vw, 1.65rem)` | 400 | Large — intentional, not a small form box |
| Body / description | `0.95rem` | 400 | `rgba(255,255,255,0.5)` |
| CTA button | `1rem` | 700 | `letter-spacing: 0.02em` |
| Step counter / label | `0.7rem` | 600 | `letter-spacing: 0.14em; text-transform: uppercase` |
| Metadata / captions | `0.76rem` | 600 | `letter-spacing: 0.08em; text-transform: uppercase` |
| Error message | `0.82rem` | 500 | `rgba(224,84,84,0.9)` |

Pattern: headings are 700–800 weight, large, tight line-height (`1.15–1.2`). Labels and metadata are very small, very tracked, uppercase — creating clear hierarchy with no in-between sizes.

---

## 10. The Pattern Formula

When building any new screen or component, follow this checklist:

**Color**
- `#1a1a1a` base, no exceptions
- Accent extracted from primary image; exposed as `--accent`, `--accent-r/g/b`; `--accent-text` from WCAG luminance
- All UI: `rgba(255,255,255, X)` — never opaque whites except key interactive targets
- Screens without images: white tones only, no fallback accent color

**Background depth**
- Blur + desaturate background images when supporting: `blur(28px) saturate(0.45) scale(1.1)`
- Overlay gradients, not solid fills
- Three ambient orbs at accent color, `blur(72px)`, prime-number durations

**Entrances**
- All elements: fade + translate (never just fade)
- Spring easing `cubic-bezier(0.22,1,0.36,1)` for UI elements moving into position
- Stagger groups at 50–150ms
- Scale from 88–95%, never from 0%

**Pulsating / living surfaces**
- Hero CTA: `box-shadow` pulse ring in accent, `0 → 14px`, 2.6s infinite
- Content cards: glow breathes `scale(0.95→1.05)` + `opacity(0.7→1.0)`, 3.5s alternate infinite
- Orbs drift on mismatched durations (never sync)
- Idle glass buttons: `::after` shimmer at 0.06 opacity every 2.5s

**Completion moments**
- Stagger three ring pulses at 320ms intervals
- Draw SVG circle (`dashoffset → 0`), then tick
- Cascade text with `translateY(12px) → 0`, 150ms stagger
- Confirm actions with 3-keyframe elastic bounce

**Shadows**
- Always two layers minimum: deep far shadow + closer ambient
- Add 1px `rgba(255,255,255,0.05–0.08)` outline as third shadow — the glass rim

---

## 11. Data Structure Reference

Full schema in `docs/DATA_STRUCTURE_AND_SYSTEMS.md` (archived). Key shapes for daily use:

### Program tree
```
courses/{courseId}
  /modules/{moduleId}          ← week; fields: order, title, libraryModuleRef?
    /sessions/{sessionId}      ← session; fields: order, title, librarySessionRef?
      /exercises/{exerciseId}  ← exercise; fields: order, title, + exercise data
        /sets/{setId}          ← set; fields: reps, weight, duration, etc.
      /overrides/data          ← program-level overrides (single doc)
```

### Key terminology
- **Course** in Firestore = **Program** in UI
- **Module** = Week (e.g. "Semana 1")
- `deliveryType: low_ticket` → full program cached locally via React Query + IndexedDB
- `deliveryType: one_on_one` → per-session fetch from Firestore (`client_sessions`, `client_plan_content`)
- `weekly: true` → modules have a `week` field matching ISO week strings (e.g. `2025-W03`)

### Library resolution
Program docs can contain `libraryModuleRef` / `librarySessionRef` pointers. These are resolved at load time by `libraryResolutionService` — the resolved content is what screens consume.

### Nutrition copy-first
`client_nutrition_plan_content/{assignmentId}` stores a per-client copy of the plan. Falls back to `creator_nutrition_library/{creatorId}/plans/{planId}` if copy doesn't exist.

### One-on-one content resolution
Content comes from: `courses` + `client_programs` overrides + `client_sessions` + `client_session_content` / `client_plan_content` + `plans` + `creator_libraries`. PWA does not cache full program for one-on-one — minimal cache + per-session fetch.
