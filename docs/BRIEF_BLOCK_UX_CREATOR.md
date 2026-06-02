# Brief — Block-cadence UX (creator dashboard)

Companion to [docs/BRIEF_BLOCK_UX.md](BRIEF_BLOCK_UX.md). That brief shipped the consumer side
(Hoy chip, Contenido calendar, pre-purchase strip on `apps/pwa`). This one is the
creator-dashboard mirror: how a coach **authors** a `block_cadence:
'monthly_first_monday'` course without leaning on seed scripts.

## Goal

A coach who marks a program as monthly-drop must be able to do everything from the
dashboard: toggle the cadence on a live program, initialize the cron state, author
months, set unlock dates, set `dayIndex` per session, and publish a block. Today
the Entrenamiento tab renders an identical week grid regardless of cadence — coaches
must run `seed-bejarano-program-state.js` + `publish-bejarano-modules.js` by hand
to launch a monthly-drop course. That ends with this brief.

## Product model — non-negotiable (same as consumer)

- **One block = one calendar month**, starting the **first Monday** of that month.
- Blocks are 4 weeks. Week 1 starts the first Monday; weeks 2–4 follow consecutively.
- **All 7 days are first-class.** `dayIndex ∈ {1..7}` (L M X J V S D). A coach
  can schedule sessions on any day, including weekends. Bejarano happens to use
  Mon–Fri; nothing in the platform requires that.
- Modules are 0-indexed by `order` — `Mes 1` is `order: 0`, `Mes 2` is `order: 1`,
  etc. The cron's `-1` sentinel picks the first published module on first advance.
- Publishing a block = setting `module.published_at` (ISO). The cron flips
  `current_block_id` on the first Monday at/after `published_at`.

## Audit — current state (2026-05-16)

Verified against the repo today. File:line references for jumping straight in.

### What exists

- **Creation toggle**: [CreateFlowOverlay.jsx:471–509](../apps/creator-dashboard/src/components/CreateFlowOverlay.jsx#L471-L509)
  has a "monthlyDrops" step shown only when access type is monthly + low-ticket.
  Sets `block_cadence: 'monthly_first_monday'` on the new course doc.
- **Post-creation toggle handler**: [GroupProgramView.jsx:241–243](../apps/creator-dashboard/src/components/program/GroupProgramView.jsx#L241-L243)
  defines `handleCadenceToggle` — but **no UI button calls it**. Dead handler.
- **Telemetry chip**: [GroupProgramView.jsx:261–285](../apps/creator-dashboard/src/components/program/GroupProgramView.jsx#L261-L285)
  reads `current_block_index` and shows a "next drop" warning. Read-only.
- **Per-module publish chip**: `BlockPublishChip` in [ProgramContentTab.jsx:69–80](../apps/creator-dashboard/src/components/program/ProgramContentTab.jsx#L69-L80)
  toggles `published_at` when `cadenceActive`. Lives in the Contenido tab, **not**
  the Entrenamiento tab (where coaches actually author sessions).
- **API + schema**: backend is fully cadence-aware. [programService.js:138](../apps/creator-dashboard/src/services/programService.js#L138)
  already accepts `unlocks_at`, `published_at`. [programService.js:158](../apps/creator-dashboard/src/services/programService.js#L158)
  accepts `dayIndex`. Nothing to change server-side.

### What's broken

- **Entrenamiento tab is cadence-blind**: [ProgramWeeksGrid.jsx:568](../apps/creator-dashboard/src/components/ProgramWeeksGrid.jsx#L568)
  hardcodes `Día 1..7` and [line 584](../apps/creator-dashboard/src/components/ProgramWeeksGrid.jsx#L584)
  hardcodes `Semana {modIndex+1}`. Coach sees `Día 1..7` slot labels (not the
  `L M X J V S D` weekday names) even on cadenced courses, and modules are
  always labeled as weeks instead of months.
- **`dayIndex` is written but never displayed**: [line 269](../apps/creator-dashboard/src/components/ProgramWeeksGrid.jsx#L269)
  resolves slots by positional `order`, not `dayIndex`. Sessions appear in column
  index, not on their actual day.
- **No `unlocks_at` input**: zero UI to set or even see a module's unlock date.
- **No `program_state` init**: coaches cannot start a cadenced program from the
  dashboard. The cron only fires when `program_state/{courseId}` has
  `current_block_id` + `current_block_started_at` + `next_block_id`/`next_block_index`.
- **No publish action where coaches edit**: `BlockPublishChip` lives in Contenido,
  not Entrenamiento. The coach edits a month, then has to switch tabs to publish it.

## Design rules (override anything else)

- **Mirror the consumer's vocab.** "Mes 1 — Base", "MAYO 2026", `L M X J V`.
  When a subscriber and a coach look at the same data, they should see the same
  words.
- **Coaches need state, not decoration.** The consumer brief banned helper text.
  The creator side does not — coaches need draft/published, unlock dates, error
  states. Keep copy minimal but show what matters.
- **Calendar shape ≠ the affordance here.** The shape is still the layout, but
  the affordance is editing. Tap a session cell → edit that session. Tap a
  block header → edit unlock date / publish. Different from consumer (where
  taps just open sessions).
- **Current style only** ([docs/Brand/STANDARDS.md](Brand/STANDARDS.md)). Canvas `#1a1a1a`,
  white at opacity, dynamic accent from course image when present, otherwise
  white-only. Spring easing `cubic-bezier(0.22, 1, 0.36, 1)`. Fade + `translateY(24px)`
  entrances.
- **No gold.** No fallback brand color. Same as consumer.
- **Branch all visuals on `program?.block_cadence === 'monthly_first_monday'`.**
  Non-cadenced courses (`low_ticket` non-monthly, `general`, `one_on_one`) keep
  the existing week grid pixel-for-pixel — zero regression.

## Four deliverables

### 1. Entrenamiento — month-block grid for cadenced courses

**File to edit:** [apps/creator-dashboard/src/components/ProgramWeeksGrid.jsx](../apps/creator-dashboard/src/components/ProgramWeeksGrid.jsx)
(or split a new `ProgramMonthsGrid.jsx` if conditional code in WeeksGrid balloons
past ~30%).

**Detect cadence** from `program?.block_cadence`. When `monthly_first_monday`,
render a month-block grid instead of the week grid:

```
┌──────────────────────────────────────────────────────────────────────┐
│  MES 1 — BASE                        MAYO 2026 · publicado           │  ← block header
│  ────────────────────────────────────────────────────────            │
│   L      M      X      J      V      S      D                        │  ← all 7 days
│  ┌──┐  ┌──┐  ┌──┐  ┌──┐  ┌──┐  ┌·-┐  ┌·-┐                            │
│  │Em│  │Ja│  │Pi│  │Su│  │Pi│  │ +│  │ +│                            │  ← session cells
│  └──┘  └──┘  └──┘  └──┘  └──┘  └─-┘  └─-┘                            │     dashed = empty
│  [+ duplicar mes]                  [editar fecha]  [publicar]        │  ← actions
└──────────────────────────────────────────────────────────────────────┘
```

- Columns are `L M X J V S D` (all 7 days). Days without a session render as
  dashed empty cells with a `+` affordance — tap to add a session on that day.
  Coaches who only train Mon–Fri (like Bejarano) just leave Sat/Sun empty; the
  shape stays consistent across courses.
- Slot resolution must read `s.dayIndex` first, fall back to `s.order` for
  legacy sessions ([ProgramWeeksGrid.jsx:269](../apps/creator-dashboard/src/components/ProgramWeeksGrid.jsx#L269)).
- Block header replaces `Semana {n}`:
  - Title: `{module.title}` (default `Mes ${order + 1}`)
  - Right: `{MES YYYY · estado}` where `estado` ∈ `borrador | publicado | en vivo`
- Editing remains identical: clicking a cell opens the existing session editor.

**`dayIndex` write path**: when a coach drags a session into a column or creates
a new one, write `dayIndex` (1..7) — not `order`. Keep `order` in sync for
legacy callers until [feedback_planned_set_schema](../.claude/projects/-Users-emilioloboguerrero-app/memory/project_planned_set_schema.md)
absorbs it.

**Empty state per block**: "Sin sesiones — toca para agregar". No marketing copy.

**Non-cadenced fallback**: the existing 7-day, "Semana N" grid renders unchanged.

### 2. Programa tab — cadence toggle + program_state init

**File to edit:** [apps/creator-dashboard/src/components/program/GroupProgramView.jsx](../apps/creator-dashboard/src/components/program/GroupProgramView.jsx)
or a new `ProgramSettingsTab.jsx` if the Programa tab is already crowded.

**Add a "Bloques mensuales" section**:

```
Bloques mensuales
─────────────────
[ ✓ ] Activar bloques mensuales

Estado del cron:
  Bloque actual:  Mes 1 — Base    (inició 4 may 2026)
  Próximo:        Mes 2 — Volumen (1 jun 2026)

[Iniciar bloques desde Mes 1]   ← when program_state is missing
```

- Toggle wires to existing `handleCadenceToggle`. When activating, prompt:
  "Esto reorganiza el editor en meses. Asegúrate de haber definido `dayIndex`
  (1..7) en cada sesión." Don't auto-rewrite existing data — show a warning
  if any session is missing `dayIndex` or has it out of range.
- "Iniciar bloques desde Mes 1" button:
  - POST a new endpoint (see deliverable 4) that:
    1. Picks the first module by `order` as current
    2. Sets `course.current_block_id` + `current_block_index`
    3. Writes `program_state/{courseId}` with `current_block_started_at: nextFirstMondayBogota()`,
       `current_block_id`, `current_block_index`, `next_block_id`, `next_block_index`
  - Disabled if no modules have `published_at` set.
- Show `current_block_started_at` and the next module's `unlocks_at` read-only.
  These are computed by the cron; coaches don't edit them directly.

**Don't add**:
- No "delete program_state" button. Lapse/cancel paths handle that.
- No manual override of `current_block_index`. If a coach wants to skip a block,
  they unpublish it.

### 3. Per-block publish + unlock-date editing in Entrenamiento

**File to edit:** the new month-block header in `ProgramWeeksGrid.jsx` (deliverable 1).

**Actions on the block header**:
- `[publicar]` / `[despublicar]` — toggles `module.published_at`. Reuse
  `BlockPublishChip` from [ProgramContentTab.jsx:69–80](../apps/creator-dashboard/src/components/program/ProgramContentTab.jsx#L69-L80);
  extract to `apps/creator-dashboard/src/components/program/BlockPublishChip.jsx`.
- `[editar fecha]` — opens a small popover with a date input bound to
  `module.unlocks_at`. Default value when empty: the first Monday of the
  calendar month implied by `order` (Mes 1 → next first Monday from today;
  Mes 2 → first Monday of the following month; etc.).
- Confirm on save: "Esta fecha es cuándo se desbloquea para suscriptores.
  El cron usa la primera Monday >= esta fecha."

**State labels**:
- `borrador` — `published_at: null`
- `publicado` — `published_at` set, but `unlocks_at` is in the future
- `en vivo` — module is `current_block_id` on the course doc

### 4. New API endpoint — initialize program_state

**File to edit:** [functions/src/api/routes/creator.ts](../functions/src/api/routes/creator.ts)

**Endpoint**: `POST /creator/programs/:courseId/initialize-cadence`

**Auth**: creator-only (course's `creator_id` or admin).

**Behavior**:
1. Verify course has `block_cadence: 'monthly_first_monday'`.
2. Verify `program_state/{courseId}` does NOT exist (idempotency — refuse to
   overwrite a running cron's state).
3. Verify at least one module has `published_at` set.
4. Compute `current_block_id` = lowest-`order` module with `published_at !== null`.
5. Compute `current_block_started_at` = next first-Monday-Bogotá relative to now.
   Reuse the helper in `apps/creator-dashboard/src/utils/cadence.js` (if it
   exists) or port from the consumer brief's calendar code.
6. Compute `next_block_id` / `next_block_index` from the next module by `order`.
7. Write `program_state/{courseId}` and update `course.current_block_id` +
   `current_block_index` atomically.
8. Return the new state for the dashboard to render immediately.

**Validation errors**:
- `CADENCE_NOT_ENABLED` — course is not monthly-drop
- `ALREADY_INITIALIZED` — program_state already exists
- `NO_PUBLISHED_MODULES` — no module has `published_at` set

The dashboard surfaces each as a specific Spanish message in the Programa tab.

## What NOT to do

- Don't replace the week grid for non-cadenced courses. The existing
  `low_ticket` / `general` / `one_on_one` flows must render identically. Branch
  inside `ProgramWeeksGrid` on `program?.block_cadence`.
- Don't auto-publish modules. The coach explicitly clicks `publicar`.
- Don't auto-init `program_state` when the cadence toggle flips. Coach must
  click "Iniciar bloques" so they understand it's a calendar-anchored launch.
- Don't expose `current_block_started_at` as an editable input. The cron owns
  that field; manual edits would desync the lapse policy.
- Don't add a "preview as subscriber" mode in this brief. Coaches can open
  `/app/course/:id/structure` in a new tab if they want to see the consumer view.
- Don't write a separate cadenced session editor. The existing session editor
  works fine — only the grid layout around it changes.
- Don't move sessions across blocks via drag-and-drop (yet). Within-block
  reordering only. Cross-block moves require unlock-date recomputation that
  isn't worth the scope here.

## Acceptance

- Create a new program with cadence enabled → Entrenamiento renders an empty
  Mes 1 block with all 7 columns (L M X J V S D), each day showing a dashed
  empty `+` cell.
- Add a session via the existing editor with `dayIndex: 3` → it appears in
  column X (Miércoles); columns L, M, J, V, S, D remain empty.
- Add a session with `dayIndex: 6` → it appears in column S (Sábado).
- Toggle cadence ON for an existing non-cadenced program → Programa tab shows
  the warning ("define dayIndex 1..7"); Entrenamiento switches to the month grid.
- Click `[publicar]` on Mes 1 → `module.published_at` set; chip flips to
  `publicado`; button changes to `despublicar`.
- Click "Iniciar bloques desde Mes 1" → `program_state` written, course's
  `current_block_id` + `current_block_index` updated; chip flips to `en vivo`.
- Consumer (PWA) accessing the same course post-init: Hoy chip, Contenido
  calendar, pre-purchase strip all render with the coach's data — no script
  intervention required.
- All non-cadence programs (`low_ticket` non-monthly, `general`, `one_on_one`)
  show the legacy 7-day week grid unchanged.
- TS build clean, ESLint clean on touched files, no `onSnapshot`, no
  `hybridDataService`.

## Files likely touched

- `apps/creator-dashboard/src/components/ProgramWeeksGrid.jsx` — branch on
  cadence; new month-block layout. Largest change.
- `apps/creator-dashboard/src/components/program/ProgramTrainingTab.jsx` — pass
  `program` (with `block_cadence`) into the grid; minor wiring.
- `apps/creator-dashboard/src/components/program/GroupProgramView.jsx` —
  surface the cadence toggle UI; wire "Iniciar bloques" button.
- New: `apps/creator-dashboard/src/components/program/BlockPublishChip.jsx`
  (extracted from ProgramContentTab for reuse).
- New: `apps/creator-dashboard/src/components/program/BlockHeader.jsx` (month
  name + state + actions for the new grid).
- `apps/creator-dashboard/src/services/programService.js` — add
  `initializeCadence(courseId)`.
- New: `functions/src/api/routes/creator.ts` — `POST /creator/programs/:id/initialize-cadence`.
- New: `apps/creator-dashboard/src/utils/cadence.js` — port
  `nextFirstMondayBogota()` from wherever it currently lives (or factor it out
  of the seed scripts).

## Reference

- Consumer brief + product model: [docs/BRIEF_BLOCK_UX.md](BRIEF_BLOCK_UX.md)
- Schema contract: [project_monthly_drops.md](../.claude/projects/-Users-emilioloboguerrero-app/memory/project_monthly_drops.md)
- Macro plan: [docs/METODO_BEJARANO.md](METODO_BEJARANO.md)
- Live course IDs: [project_metodo_bejarano_course.md](../.claude/projects/-Users-emilioloboguerrero-app/memory/project_metodo_bejarano_course.md)
- Visual system: [docs/Brand/STANDARDS.md](Brand/STANDARDS.md)
- Seed scripts to retire after this ships: `scripts/seed-bejarano-program-state.js`,
  `scripts/publish-bejarano-modules.js`, `scripts/fix-bejarano-launch.js`
