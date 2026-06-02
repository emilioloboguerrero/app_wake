# Brief — Block-cadence UX (Bejarano launch)

## Goal

Make `block_cadence: 'monthly_first_monday'` courses visually obvious. A subscriber must understand at a glance that this program drops one block per month, that they're inside the current block, and that future blocks unlock on a date. Today the data layer is fully block-aware ([functions/src/api/routes/workout.ts:2498-2516](functions/src/api/routes/workout.ts#L2498-L2516)) but every screen renders cadenced courses identically to non-cadenced ones.

## Product model — non-negotiable

- **One block = one calendar month**, starting the **first Monday** of that month.
- Blocks are 4 weeks. Week 1 starts the first Monday; weeks 2–4 follow consecutively.
- Sessions can be scheduled on **any day of the week** (`dayIndex ∈ {1..7}`,
  L M X J V S D). Programs that only use a subset (e.g. Bejarano's Mon–Fri
  split) render dashed empty cells on unused days — the calendar always shows
  all seven columns so the shape is uniform across courses.
- Bejarano (`courses/NTQIWMZBOxntwmUiXQZp`) is the first such program. Modules titled `Mes 1 — Base`, `Mes 2 — Volumen`, `Mes 3 — Hipertrofia avanzada`.
- Current state: M1 is live (`program_state.current_block_id = AHSaID03k5K1Cq3qNcIw`), M2 unlocks 2026-06-01, M3 unlocks 2026-07-06.

## Design rules (override anything else)

- **Calendar view** drives the affordance. The shape of a month is the explanation — words are a fallback, not the main signal.
- **No subtext.** Never a smaller helper line under a title.
- **Minimal text.** Month name, block title, date. Nothing else. No "you are here", no "monthly drops", no instructional copy.
- **Current style only** ([docs/Brand/STANDARDS.md](Brand/STANDARDS.md)). Canvas `#1a1a1a`. White at opacity (`rgba(255,255,255,X)`). One dynamic accent extracted from the course image. Spring easing `cubic-bezier(0.22,1,0.36,1)`. Entrances fade + `translateY(24px)`.
- **No gold, no fallback brand color.** Cadenced courses without an image use white-only tones.

## Three deliverables

### 1. Contenido — calendar of months

**File to edit:** [apps/pwa/src/screens/CourseStructureScreen.js](apps/pwa/src/screens/CourseStructureScreen.js) (or its `.web.jsx` companion if/when behavior diverges).

**Detect cadence** from the API response — `GET /workout/programs/:courseId/modules` now returns `block_cadence`, `current_block_index`, and the full module list (filtered to ≤ current for non-creators). When `block_cadence === 'monthly_first_monday'`, render the calendar layout below instead of the existing module list.

**Layout (vertical stack, scrollable):**

```
┌─────────────────────────────────────┐
│  MAYO 2026                          │  ← month name, current
│  Mes 1 — Base                       │  ← block title (no subtext under)
│                                     │
│  L   M   X   J   V   S   D          │
│  ●   ●   ●   ●   ●   ·   ·  semana 1│  ← · = no session that day
│  ●   ○   ○   ○   ○   ·   ·  semana 2│  ← ● = done, ○ = pending
│  ○   ○   ○   ○   ○   ·   ·  semana 3│
│  ○   ○   ○   ○   ○   ·   ·  semana 4│
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│  JUNIO 2026                         │  ← muted (rgba(255,255,255,0.32))
│  Mes 2 — Volumen                    │
│                          1 jun      │  ← unlock date right-aligned
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│  JULIO 2026                         │
│  Mes 3 — Hipertrofia avanzada       │
│                          6 jul      │
└─────────────────────────────────────┘
```

**Tap behavior:**
- Tap a session dot (●/○) inside the current block → open that session (existing session navigation).
- Future blocks are not tappable. No "preview" affordance.
- The month name + block title row is decorative; only session dots are interactive.

**Data:**
- Current block tree: already in the response (`modules[currentIndex].sessions[]`). Each session has its day-of-week ordinal.
- Past/future blocks for display only: use `modules` array + the known `current_block_index`. The API already withholds future sessions — only titles + `order` are needed. If the API doesn't return titles for unpublished modules, add a `?include=titles` flag or a separate `/workout/programs/:id/blocks-overview` endpoint that returns `[{order, title, unlocks_at}]` only — no sessions.
- Session completion state: read from existing session-history hook used today by CourseStructureScreen.

**Animation:** Each month card fades + translateY(24px) in, staggered 60ms.

### 2. Hoy — next-block chip

**Files:** [apps/pwa/src/components/TodayWorkoutCard.web.jsx](apps/pwa/src/components/TodayWorkoutCard.web.jsx), and the equivalent native card if separate.

**What to add:** A single chip in the existing card's bottom row, right of the existing meta info. Only for `block_cadence: 'monthly_first_monday'` courses.

```
Próximo bloque · 1 jun
```

- Style: `rgba(255,255,255,0.06)` background, `rgba(255,255,255,0.55)` text, `0.72rem`, `border-radius: 999px`, padding `4px 10px`.
- Shows when: the user is in the current block AND a `next_block_id` exists in the API response.
- Source: revive [apps/pwa/src/hooks/hoy/useCurrentBlock.js](apps/pwa/src/hooks/hoy/useCurrentBlock.js). It already fetches `/current-block` which returns `next_block_index` and the next module's `unlocks_at`. The hook is currently orphaned — wire it into the existing course-enrichment flow that feeds TodayWorkoutCard.

No copy beyond the chip. No banner. No tutorial.

### 3. Course detail (purchase) — calendar mini

**File:** the course-detail / pre-purchase screen. Find via `grep -r "subscription_price" apps/pwa/src/screens` and `apps/pwa/src/components`.

**What to add:** Above the price/CTA, a horizontal strip of month tiles (3-up on web, scrollable on mobile). Same visual language as the Contenido calendar, but smaller and non-interactive.

```
┌──────────┐  ┌──────────┐  ┌──────────┐
│ MAYO     │  │ JUNIO    │  │ JULIO    │
│ Mes 1    │  │ Mes 2    │  │ Mes 3    │
│ Base     │  │ Volumen  │  │ Hipertr. │
│  ● ● ●   │  │ 1 jun    │  │ 6 jul    │
│  ● ● ●   │  │          │  │          │
└──────────┘  └──────────┘  └──────────┘
```

The first tile shows the current block's session grid (small dots, no week labels). The other two show only month name + block title + unlock date.

This tile IS the "monthly drops" explanation. The shape does the talking. No "How it works" section. No bullet list. No "you get a new block every month" sentence.

**Data:** Same `/workout/programs/:courseId/blocks-overview` (new) or the existing `/workout/programs/:courseId/modules` if it returns titles for locked modules in a public-discovery context. Confirm permissions — this is a pre-purchase view so auth may be anonymous.

## What NOT to do

- Don't add tutorials, tooltips, onboarding overlays, or "monthly drops explained" sections.
- Don't write copy like "Cada mes recibes un bloque nuevo" — the calendar shows it.
- Don't add tab labels, section headers, or H2s above the calendar.
- Don't show a list view as a fallback when `block_cadence` is set. Calendar or nothing.
- Don't gate sessions inside the current block by week — all 4 weeks are accessible immediately when the block unlocks. The week rows are visual structure, not gating.

## Acceptance

- Subscribe to Bejarano (after `status` flips to `published`) → Contenido shows 3 month cards: Mayo (calendar grid), Junio (locked, 1 jun), Julio (locked, 6 jul).
- Hoy card shows `Próximo bloque · 1 jun` chip when subscribed.
- Course detail page (anonymous) shows the 3-month strip with first month populated.
- All non-block-cadence courses render unchanged — zero regression on legacy `low_ticket` / `general` / `one_on_one` programs.
- TS build clean, lint clean on touched files, no `onSnapshot`, no `hybridDataService`.

## Files likely touched

- `apps/pwa/src/screens/CourseStructureScreen.js` — calendar render for cadenced courses
- `apps/pwa/src/components/TodayWorkoutCard.web.jsx` — chip
- `apps/pwa/src/hooks/hoy/useCurrentBlock.js` — already exists, needs to be wired into Hoy
- `apps/pwa/src/screens/CourseDetailScreen*.{js,jsx}` (find by grep) — purchase calendar mini
- Maybe new endpoint: `functions/src/api/routes/workout.ts` → `GET /workout/programs/:courseId/blocks-overview` returning `[{order, title, unlocks_at}]` for both authed and anonymous callers, no session data

## Reference

- Schema contract: [.claude/projects/-Users-emilioloboguerrero-app/memory/project_monthly_drops.md](../.claude/projects/-Users-emilioloboguerrero-app/memory/project_monthly_drops.md)
- Macro plan: [docs/METODO_BEJARANO.md](METODO_BEJARANO.md)
- Live course IDs: [.claude/projects/-Users-emilioloboguerrero-app/memory/project_metodo_bejarano_course.md](../.claude/projects/-Users-emilioloboguerrero-app/memory/project_metodo_bejarano_course.md)
- Visual system: [docs/Brand/STANDARDS.md](Brand/STANDARDS.md)
- API already block-aware at: [functions/src/api/routes/workout.ts:2498-2516](../functions/src/api/routes/workout.ts#L2498-L2516)
