# Método Bejarano — Macro plan

**Creator:** Felipe Bejarano (UID `yMqKOXBcVARa6vjU7wImf3Tp85J2`)
**Library:** `exercises_library/jeoVyzhUrBeJofT62MOe` (117 exercises, 46 prior sessions)
**Course:** `courses/{auto-id}`, `deliveryType: "general"`, `block_cadence: "monthly_first_monday"`
**Subscription:** 19.000 COP / mes (MercadoPago PreApproval) · $6 USD/mes internacional (Polar). Repriced 2026-07-06 from 79.000/$25 — see [project_bejarano_reprice_19k_20260706](../.claude/projects/-Users-emilioloboguerrero-app/memory/project_bejarano_reprice_19k_20260706.md).
**Architecture:** monthly drops, cohort-synced first-Monday cron, 30-day rolling per-user access. See [project_monthly_drops](../.claude/projects/-Users-emilioloboguerrero-app/memory/project_monthly_drops.md).

---

## Product principles

1. **One program for everyone.** No personalization by start date. Subscriber who joins in Mes 7 trains Mes 7's content — the same content the Mes 1-cohort is also training that month.
2. **Every month is complete on its own.** Block periodization *flavor*, not block periodization that requires the prior month as prerequisite. A drop-in subscriber gets a full, coherent block.
3. **Variation, not volume creep.** Each month rotates rep ranges, exercise selection, intensity emphasis, density, tempo. Don't grind "same template + more sets."
4. **Same compounds as anchors.** Squat, bench, deadlift, row, press, chin-up persist all year — *what changes* is the volume/intensity/variations around them. Long-term subscribers see real PR progression on the anchors.
5. **Intensity floor: 7/10.** No prescribed working set below intensity 7/10. Subscriber handles their own warm-up ramps.

---

## Split (constant across all 12 months)

5 days, Lunes–Viernes:

| Día | Slot |
|---|---|
| L | **Empuje** — push (chest, shoulders, triceps) |
| M | **Jalón** — pull (back, biceps) |
| X | **Pierna (Quads)** — quad-bias (squat patterns, leg press) |
| J | **Superior** — upper recap (complements L + M with new variations) |
| V | **Pierna (Posterior)** — posterior chain (RDL, hip hinge, glutes, hams) |

Recovery: 48h between Pierna (Quads) and Pierna (Posterior) — acceptable because Quads emphasis (squat/leg press) and Posterior emphasis (RDL/hip thrust) hit different prime movers. 48h between Empuje and Superior on the upper side. 72h between Jalón and the second pull dose inside Superior.

---

## 12-month macro — 4 phases

| Phase | Months | Identity | Dominant quality |
|---|---|---|---|
| **CONSTRUIR** | M1–M3 | "Build the muscle" | Hypertrophy, moderate intensity |
| **FORTALECER** | M4–M6 | "Make it strong" | Strength, intensity climb |
| **REFINAR** | M7–M9 | "Sharpen and specialize" | Hybrid, weak-point focus |
| **DEFINIR** | M10–M12 | "Body composition + close" | Conditioning, definition, test |

---

## Month-by-month

### Phase 1 — CONSTRUIR

**M1 — Base**
*Foundation. Moderate everything. New subscribers' soft landing.*
- Sets: 3–4 working per exercise
- Reps: 8–12 compounds, 12–15 isolations
- Intensity: 7/10 (RIR 2–3)
- Rest: 120–150s compounds, 60–90s isolations
- Tempo: controlled
- Microcycle (rep_sequence W1→W4): compounds `[10,10,8,12]`, isolations `[12,12,10,15]`

**M2 — Volumen**
*Peak hypertrophy volume. More sets, slightly shorter rests, moderate intensity. The "growth" month.*
- Sets: 4–5 working per exercise (compounds), 4 for accessories
- Reps: 10–15 compounds, 15–20 isolations
- Intensity: 7–8/10
- Rest: 90–120s compounds, 45–60s isolations
- Tempo: standard
- Microcycle: compounds `[12,12,10,15]`, isolations `[15,15,12,20]`
- Exercise selection: rotate to incline-bias pressing, hack squat lead, more cable work, more single-joint isolations

**M3 — Hipertrofia avanzada**
*Same volume as M2, but new exercise selection emphasizing underworked angles. Mind-muscle bias, tempo work introduced.*
- Sets: 4 working per exercise
- Reps: 8–12 compounds, 12–15 isolations
- Intensity: 7–8/10
- Tempo: slower eccentrics (3s down)
- Exercise selection: unilateral bias (DB unilateral row, split squats, single-arm cable work), 2-second pauses on key reps
- Microcycle: compounds `[10,10,8,12]`, isolations `[12,12,10,15]`

### Phase 2 — FORTALECER

**M4 — Fuerza base**
*Reps drop, intensity climbs. Strength intro. Volume reduces to make room for intensity.*
- Sets: 3–4 working per exercise (mostly 4 for compounds)
- Reps: 4–6 compounds, 8–12 isolations
- Intensity: 8/10 on compounds, 7/10 on isolations
- Rest: 180–210s compounds, 90–120s isolations
- Tempo: explosive concentric, controlled eccentric
- Microcycle: compounds `[6,5,4,6]`, isolations `[10,10,8,12]`

**M5 — Densidad**
*Supersets, antagonist pairs, tempo prescriptions. Strength under metabolic stress.*
- Sets: 3–4 per exercise, structured as supersets (A1/A2 pairings)
- Reps: 6–10 compounds, 10–12 isolations
- Intensity: 8/10
- Rest: 60s between supersets (compressed)
- Tempo: 3-1-2-0 (3s ecc, 1s pause, 2s con)
- Microcycle: compounds `[8,8,6,10]`, isolations `[12,12,10,15]`

**M6 — Pico de fuerza**
*Peak strength test month. Singles and doubles on key compounds.*
- Sets: 5–6 working sets on the main compound of each day
- Reps: 1–3 on main, 6–10 on accessories
- Intensity: 9/10 on top sets, 7–8/10 on accessories
- Rest: 240–300s on main, 120s on accessories
- Microcycle: compounds `[3,3,2,1]` (final week peak), accessories `[8,8,8,10]`
- Hits the year's first strength PR test. M6 numbers become the baseline for M12 retests.

### Phase 3 — REFINAR

**M7 — Reset y recomp**
*Deload + conditioning add-ons. Recovery before phase 3. Moderate everything.*
- Sets: 3 working per exercise
- Reps: 10–12 compounds, 12–15 isolations
- Intensity: 7/10 (RIR 3 minimum)
- Rest: 90s standard
- Add-ons: 10–15min low-impact conditioning at end of each session (incline walk, easy bike, etc.)
- Microcycle: compounds `[12,12,10,12]`, isolations `[15,15,12,15]`
- Tonnage drops ~30% vs M5/M6. Mental and physical reset.

**M8 — Especialización (espalda)**
*Back-specialization month. Other sessions go into maintenance.*
- Jalón day: 6+ exercises, 4–5 sets each, higher volume
- Superior day: back-biased (more rows, fewer presses)
- Empuje + Pierna days: maintenance volume (3 sets, RIR 2-3)
- Microcycle: back exercises `[12,12,10,15]`, others `[10,10,8,10]`
- Goal: visible back-development progress over the 4 weeks.

**M9 — Power y atleta**
*Explosive work integrated into compound days.*
- Each compound day starts with a power primer (3 × 3 jumps, 3 × 5 med ball throws, or 3 × 3 speed squats at ~60% load) before the main work
- Sets: 3–4 working per main lift after the primer
- Reps: 4–6 compounds, 10–12 isolations
- Intensity: 7–8/10 working, 9/10 on power primers
- Microcycle: compounds `[6,5,4,6]`, isolations `[12,12,10,15]`

### Phase 4 — DEFINIR

**M10 — Resistencia muscular**
*Higher reps, shorter rests, work capacity. Less load, more time under tension.*
- Sets: 3–4 per exercise
- Reps: 15–20+ everything
- Intensity: 7/10 (effort high due to reps, not load)
- Rest: 45–60s
- Microcycle: compounds `[15,15,12,20]`, isolations `[20,20,15,25]`

**M11 — Definición**
*Controlled hypertrophy with metabolic conditioning add-ons. The "shred" month.*
- Sets: 3–4 working per exercise, plus 1 metabolic finisher per day (drop set, 100-rep finisher, or mechanical drop set)
- Reps: 12–15 compounds, 15–20 isolations
- Intensity: 7–8/10
- Rest: 60s
- Tempo: slow eccentrics (4s down), peak contraction holds
- Microcycle: compounds `[12,12,10,15]`, isolations `[15,15,12,20]`

**M12 — Test final y transición**
*Re-test key lifts. Compare to M6 peak. Victory-lap month.*
- Week 1: deload (3 sets, RIR 3, easy)
- Week 2: ramp-up for testing (4 sets working at intensity 8)
- Week 3: TEST WEEK — singles on squat, bench, deadlift, military press; max reps on chin-up
- Week 4: deload + transition (preview of Year 2 / start over from M1 themes)
- Subscribers who stayed all 12 months see their PR delta. The progress story is the renewal hook.

---

## Variation levers (used to differentiate months)

Each month rotates across these to feel meaningfully different:

1. **Rep range** — 1–6 (strength), 8–12 (hypertrophy), 15–20+ (endurance/definition)
2. **Set count** — 3 (deload), 4 (standard), 5+ (volume / specialization)
3. **Intensity (1–10)** — 7 (base), 8 (working), 9 (peak)
4. **Exercise selection** — rotates main-lift variations: squat ↔ front squat ↔ hack; bench ↔ incline ↔ paused; row ↔ seal row ↔ chest-supported
5. **Tempo / density modifier** — controlled, paused, supersets, EMOM-feel, drop sets, slow eccentrics

---

## Anchors (persist all year — these are the lifts that get PRed)

- **Sentadilla trasera** (or front-squat variant in some months)
- **Press de banca plana** (or incline variant in some months)
- **Peso muerto rumano**
- **Press militar en barra**
- **Dominada prono**
- **Remo en barra horizontal**

The M6 numbers on these become the M12 retest baseline.

---

## Macro touch-points (recurring per month)

- **Module title format:** `Mes {N} — {Theme}` (Spanish, subscriber-facing).
- **Session count per module:** 5 (matches the 5-day split).
- **Session titles (subscriber-facing):** `Empuje`, `Pierna (Quads)`, `Jalón`, `Pierna (Posterior)`, `Superior`.
- **Library session titles (creator-facing):** `Mes {N} — Empuje`, `Mes {N} — Pierna (Quads)`, … so Felipe can find templates by month.
- **rep_sequence** on every set captures the 4-week intra-month arc.
- **Session notes** (Spanish) document the month's theme + the 4-week arc rules.
- **published_at** = the first Monday of the calendar month it should be live.

---

## What this means for cron + access

- `monthlyDropAdvance` cron flips `program_state/{courseId}.current_block_id` to the next module on the first Monday at 00:00 BOG.
- Cron only advances to modules with `published_at != null` AND `order > current_block_index`.
- So: as long as we keep authoring + publishing one module per month, the cron does the work. If we miss a publish, the readiness-check cron pings on day 25.

---

## Open / deferred (not blocking M1 launch)

- Cover image for the course (deferred — Felipe to provide URL/path)
- Spanish course description (deferred — leave blank)
- MercadoPago PreApproval activation (course ships in `status: "draft"` — no checkout exposed until manually published)
- Video intro (deferred)
- M1 launch date — either wait for cron on 2026-06-01 OR manually seed `program_state` to go live immediately. TBD.

---

## Authoring workflow

1. Author library templates `M{N}: {Slot}` in Felipe's library (the canonical, reusable definition of each session)
2. Create the month's module under `courses/{methodo}/modules` with `published_at` set
3. For each of the 5 slots, create a module session referencing the library template via `source_library_session_id`, with exercises + sets COPIED into the module so per-month tweaks don't mutate the library

Seed script: [scripts/seed-metodo-bejarano-m1.js](../scripts/seed-metodo-bejarano-m1.js). Pattern is parametrizable for M2..M12.
