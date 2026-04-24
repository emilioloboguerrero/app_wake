# Bejarano Library Seed — Handoff

> **Purpose of this file:** self-contained brief so a fresh chat can pick up building Felipe Bejarano's Wake library without re-reading 230 pages of PDFs or the full source conversation.
>
> **Status as of 2026-04-23:** schema verified against prod, all §6 decisions resolved, seed script written at [`scripts/seed-felipe-sessions.js`](../scripts/seed-felipe-sessions.js). FB Novato D1 deployed to prod (session `hzA8M0gz5ApvPYwk2wat`). All 23 PDF sessions cross-checked against actual PDFs (not just this handoff) — 19 errors in the original handoff data have been corrected in the script. Remaining 22 sessions ready to seed with `--seed-pdf --write`.
>
> **Audit (2026-04-23):** Novatos (all 3 days, 27 exercises), Intermedios Bloque 1 (30 exercises), Avanzados Bloque 1 (38 exercises) → 100% match against PDF Semana 1. Intermedios Bloque 2 + Avanzados Bloque 2 had 19 errors in handoff data (wrong source week) → fixed in script against PDF Semana 8/9 (first week of each block).
>
> **Plan-layer finding:** Intermedios (and likely Avanzados) also progress *work-set counts* week-to-week for some exercises (e.g. Hip thrust D2 Bloque 1: Wk1 1+3 → Wk2 1+4 → Wk3 1+5). Library baseline at Week 1 is correct; plan layer must handle cal/work/reps/RER progression.

---

## 0. Verdict (final schema, verified against prod 2026-04-23)

Cross-checked against Felipe's test session, 39 library sessions across 6 creators, 43 production course exercises, and the API write path ([creator.ts:4194–4510](../functions/src/api/routes/creator.ts#L4194-L4510)).

### Corrections vs earlier drafts

| Field | Earlier draft | Truth in prod |
|---|---|---|
| `alternatives` | `[{primary:{id:name}}, …]` (array of objects) | **MAP**: `{ [libDocId]: ["ALT1", "ALT2"] }` |
| `name` on exercise | set to `""` | **omit entirely** — 31/43 prod exercises have no `name` |
| Session legacy fields | unspecified | **do NOT write** `creator_id`, `showInLibrary`, `version` — API no longer writes them |
| Intensity on set | `"RER N"` | **`"N/10"`** — Felipe's convention; conversion `(10 − RER)/10` |
| Superset encoding | unclear | **`notes: "A1" / "A2"`** — rendered in [ClientPlanSessionPanel.jsx:52](../apps/creator-dashboard/src/components/client/ClientPlanSessionPanel.jsx#L52) |
| `video_url/source/path` on new library entries | omit | **confirmed omit** — matches older library entries |

### Canonical shapes

**Session doc** — `creator_libraries/{uid}/sessions/{id}`:
```js
{ title, order, defaultDataTemplate, image_url?, created_at, updated_at }
```

**Exercise doc** — `.../sessions/{id}/exercises/{id}`:
```js
{
  order,
  primary:      { [LIB_ID]: "EXACT LIBRARY NAME" },
  alternatives: { [LIB_ID]: ["ALT1", …] }  OR  {},
  measures:     ["reps", "weight", "intensity"],
  objectives:   ["reps", "intensity", "previous"],
  customMeasureLabels:   {},
  customObjectiveLabels: {},
  notes?:       "A1" | "Tempo cue" | …,
  created_at, updated_at
}
```

**Set doc** — `.../exercises/{id}/sets/{id}`:
```js
{ order, title: `Serie ${n}`, reps: "8-12" | "AMRAP", intensity: "7/10", created_at }
```
(No `weight`, `rir`, `restSeconds`, `type` at library level — library = template, user fills at runtime.)

**Library exercise add** — `exercises_library/{LIB_ID}.{NAME}`:
```js
{ implements: [...], muscle_activation: { muscle: 0-100 }, created_at, updated_at }
```

### Enums (validate against these)

- **Implements (16):** Agarre Amplio, Agarre Cerrado, Agarre en "V", Banco, Banco Inclinado, Bandas de Resistencia, Barra, Barra T, Cable, Mancuernas, Máquina, Máquina Smith, Otro, Paralelas, Peso Corporal, Silla de Predicador
- **Muscles (18):** abs, biceps, calves, forearms, front_delts, glutes, hamstrings, hip_flexors, lats, lower_back, obliques, pecs, quads, rear_delts, rhomboids, side_delts, traps, triceps

### Resolved decisions (from §6)

1. **No rename of library entries.** Keep Felipe's 103 names; seed script maps PDF/Excel → library via in-script `NAME_MAP`.
2. **Ambiguous defaults accepted** per §5.
3. **Add 12 new library exercises** with full `muscle_activation` + `implements` (see script `NEW_EXERCISES`).
4. **Translate Excel names to Spanish** matching existing library entries; new exercises only when no Spanish equivalent.
5. **Keep** test session `QDs9JOxXcqERHcJLjWiJ`.
6. **No modules.** Sessions flat — modules deferred until plan phase.

---

## 1. Felipe's Firestore state (read-only dump already done)

- **uid:** `yMqKOXBcVARa6vjU7wImf3Tp85J2`
- **email:** `fbejaranofit@gmail.com`
- **role:** `creator`
- **display name:** Juan Felipe Bejarano
- **Exercise library doc id:** `jeoVyzhUrBeJofT62MOe` — title *"EJERCICIOS GYM - FUERZA"* — **103 exercises**, all with `muscle_activation` and `implements` set, **no videos uploaded yet**
- **Existing library sessions:** 1 test session (`QDs9JOxXcqERHcJLjWiJ` — "Prueba sesión push", 6 exercises). Keep it or delete — user's call.
- **Objective presets:** **NONE.** So the API's auto-seed fallback will apply. We must write `defaultDataTemplate` explicitly.
- **Modules:** none.

Read-only dump script: [`scripts/dump-felipe-library.js`](../scripts/dump-felipe-library.js) — run with `NODE_PATH=functions/node_modules node scripts/dump-felipe-library.js` to refresh.

---

## 2. Data model (what a seed must write)

Collection paths:
```
creator_libraries/{felipeUid}/
  sessions/{autoId}                              ← session doc
    exercises/{autoId}                           ← subcollection (NOT array)
      sets/{autoId}                              ← subcollection (NOT array)
```

### Session doc (allowlist)
`title`, `order` (number), `isRestDay` (bool), `image_url`, `defaultDataTemplate`
Plus auto: `created_at`, `updated_at`.

**Exact `defaultDataTemplate` to use (matches Felipe's existing test session):**
```js
{
  measures:   ["reps", "weight", "intensity"],
  objectives: ["reps", "intensity", "previous"],
  customMeasureLabels:   {},
  customObjectiveLabels: {}
}
```

> Note: the API default (creator.ts:4203) was updated from `["reps","weight"]` to the above. Not deployed yet — doesn't matter for seed script since admin SDK bypasses the API.

### Exercise doc (allowlist)
`name`, `order` (required), `libraryId`, `primaryMuscles`, `notes`, `primary`, `alternatives`, `objectives`, `measures`, `customMeasureLabels`, `customObjectiveLabels`, `defaultSetValues`.

**Felipe's convention (from his test session):**
- `name: ""` (empty — UI resolves display name from `primary`)
- `primary: { "jeoVyzhUrBeJofT62MOe": "EXACT EXERCISE NAME" }` ← single-entry map
- `measures` and `objectives` **copied** onto the exercise from the session template
- No `primaryMuscles`, no `notes`, no `libraryId` field separately

### Set doc (allowlist)
`order` (required), `title` (e.g. "Serie 1"), `reps` (string *or* number — `"8-10"` works), `weight`, `intensity`, `rir`, `restSeconds`, `type`.

**Felipe's convention:** `{ order, title: "Serie N", reps: "8-12", intensity: "7/10" }`. **No weight** in library (user fills at runtime). No restSeconds in his existing sets.

---

## 3. Architecture decision (already made)

**Library = templates. Plans = per-week progression.** Week-over-week rep/RER changes happen at the plan layer via `client_session_content` overrides, NOT by duplicating sessions.

**BUT:** where blocks meaningfully change the *exercise list* (not just reps), those become separate library sessions. Verified from the PDFs:
- Novatos: no block change → 3 sessions
- Intermedios: Bloque #1 vs Bloque #2 → different exercises → 4 + 4 = 8 sessions
- Avanzados: Bloque #1 vs Bloque #2 → different exercises → 6 + 6 = 12 sessions. Week 12 AMRAP reuses Bloque #2 structure → plan-level override.

---

## 4. Session inventory

Total to seed: **~40 unique sessions** across PDFs and Excel templates. All reps shown are **Week 1 baseline**; plan-level overrides handle week-to-week changes.

### 4.1 BEJARANOFIT PDFs (23 sessions, Spanish)

#### NOVATOS — Full Body, 3×/week, 12 weeks (no block change)

**FB Novato Día 1** — 7 main + 2 opcional
1. Sentadilla — 3 cal + 3 work × 6 @ RER 3, 2-3min
2. Press de banca plana — 2 cal + 3 × 8 @ RER 3, 2-3min
3. Jalón al pecho polea alta — 1+3 × 10 @ RER 2, 1-2min
4. Peso muerto rumano — 1+3 × 10 @ RER 3, 2-3min
5. Fondos en paralelas — 1+3 × 8 @ RER 3, 1-2min
6. Elevaciones de talones con rodilla extendida — 1+3 × 10 @ RER 2, 1-2min
7. Curl de bíceps supino — 1+3 × 10 @ RER 2, 1-2min
8. *Opt H:* Tríceps push down — 1+2 × 15 @ RER 1
9. *Opt M:* Frog pumps — 1+2 × 20 @ RER 1

**FB Novato Día 2**
1. Peso muerto — 3+3 × 5 @ RER 3, 2-3min
2. Press militar en barra — 2+3 × 8 @ RER 2, 2-3min
3. Seal row — 2+3 × 10 @ RER 2, 1-2min
4. Extensión de rodillas — 1+3 × 12 @ RER 2, 2-3min
5. Vuelos en polea para pectoral — 1+3 × 15 @ RER 2, 1-2min
6. Crunch en cable — 1+3 × 20 @ RER 3, 1-2min
7. Rompe cráneos (o press francés) — 1+3 × 12 @ RER 2, 1-2min
8. *Opt H:* Curl predicador — 1+2 × 15 @ RER 1
9. *Opt M:* Hip thrust unilateral — 1+2 × 20 @ RER 1

**FB Novato Día 3**
1. Sentadilla búlgara — 3+3 × 10 @ RER 2, 2-3min
2. Press inclinado con mancuernas — 2+3 × 12 @ RER 3, 2-3min
3. Pull down supino — 2+3 × 15 @ RER 2, 1-2min
4. Hip thrust — 1+3 × 10 @ RER 2, 2-3min
5. Face pull — 1+3 × 20 @ RER 2, 1-2min
6. Elevaciones laterales de hombro — 1+3 × 15 @ RER 1, 1-2min
7. Curl de pierna acostado o sentado — 1+3 × 12 @ RER 1, 1-2min
8. *Opt H:* Pull over — 1+2 × 20 @ RER 1
9. *Opt M:* Sissy squat — 1+2 × 15 @ RER 1

#### INTERMEDIOS — Torso-Pierna, 4×/week, 12 weeks

**Bloque #1 (weeks 1-6):**

**TP Inter Pierna D1 B1**
1. Peso muerto — 3+3 × 5 @ RER 3
2. Sentadilla box — 1+3 × 10 @ RER 2
3. Curl de pierna acostado — 1+3 × 10 @ RER 1
4. Sissy squat — 1+3 × 15 @ RER 2
5. Elevaciones de talones con rodilla flexionada — 1+3 × 12 @ RER 1
6. Clam — 1+3 × 20 @ RER 2
7. Rueda abdominal — 1+2 × 10 @ RER 1

**TP Inter Torso D1 B1**
1. Press de banca plana — 2+2 × 4 @ RER 2
2. Chin up — 1+3 × 6-8 @ RER 2
3. Press militar con mancuernas — 2+3 × 12 @ RER 2
4. Seal row — 1+3 × 10-12 @ RER 3
5. Face pull — 1+3 × 20 @ RER 2
6. Elevaciones laterales en máquina — 1+3 × 12 @ RER 1
7. Curl en barra — 1+3 × 8 @ RER 1

**TP Inter Pierna D2 B1**
1. Sentadilla — 3+3 × 4 @ RER 1
2. Hip thrust — 1+3 × 5 @ RER 2
3. Peso muerto rumano — 1+3 × 12 @ RER 2
4. Extensión de rodilla — 1+3 × 12 @ RER 2
5. Hiperextensión 45° — 1+3 × 15 @ RER 1
6. Elevaciones de talones con rodilla extendida — 1+2 × 20 @ RER 1
7. Elevaciones de piernas — 1+2 × 10 @ RER 1

**TP Inter Torso D2 B1**
1. Dominadas prono — 2+3 × 4-6 @ RER 2
2. Press inclinado — 2+3 × 8 @ RER 2
3. **A1:** Remo en cable agarre abierto — 2+3 × 10 @ RER 2, 0min
4. **A2:** Remo en cable agarre cerrado — 1+3 × 10 @ RER 1, 2-3min
5. Elevaciones laterales en cable — 1+3 × 15-20 @ RER 1
6. **A1:** Curl de bíceps supino — 1+2 × 10 @ RER 1, 0min
7. **A2:** Curl de bíceps martillo — 1+2 × 10 @ RER 1, 0min
8. **A3:** Curl de bíceps prono — 1+2 × 10 @ RER 2, 1-2min
9. Tríceps push down — 1+3 × 12 @ RER 2

**Bloque #2 (weeks 7-12):**

**TP Inter Pierna D1 B2**
1. Sentadilla — 3+3 × 6 @ RER 3
2. Peso muerto rumano — 1+3 × 10 @ RER 3
3. Sentadilla búlgara — 3+3 × 10 c/u @ RER 2
4. Buenos días — 1+3 × 15 @ RER 3
5. Curl de pierna sentado — 1+2 × 12 @ RER 3
6. Elevaciones de talones con rodilla extendida — 1+3 × 20 @ RER 2
7. Abducción de cadera — 1+3 × 20 @ RER 2
8. Plancha — 1+2 × 40s @ RER 1

**TP Inter Torso D1 B2**
1. Press de banca plana — 2+3 × 4 @ RER 3
2. Jalón al pecho polea alta — 1+3 × 12 @ RER 2
3. Press inclinado con mancuernas — 2+3 × 12 @ RER 3
4. Vuelos en polea para pectoral — 1+3 × 15 @ RER 1
5. Elevaciones laterales de hombro — 1+3 × 12 @ RER 1
6. Rompe cráneos (o press francés) — 1+3 × 8 @ RER 2
7. Curl predicador — 1+2 × 15-20 @ RER 1
8. Vuelos invertidos — 1+2 × 20 @ RER 1

**TP Inter Pierna D2 B2**
1. Peso muerto — 3+3 × 5 @ RER 3
2. Sentadilla frontal o con safety bar — 2+3 × 12 @ RER 3
3. Hip thrust — 1+3 × 10 @ RER 2
4. Curl de pierna acostado constante — 1+3 × 15 @ RER 1
5. Extensión de rodilla — 1+3 × 12 @ RER 2
6. **A1:** Pull through en cable — 1+3 × 15 @ RER 1
7. Crunch convencional — 1+2 × 20 @ RER 1
8. Elevaciones de piernas — 1+2 × 10 @ RER 1

**TP Inter Torso D2 B2**
1. Press militar en barra — 2+3 × 4 @ RER 2
2. Remo en barra horizontal — 2+3 × 10 @ RER 3
3. Press inclinado agarre cerrado — 2+3 × 15 @ RER 2
4. Remo unilateral con mancuerna — 1+3 × 8 @ RER 2
5. Curl de bíceps inclinado — 1+3 × 8 @ RER 2
6. Elevaciones laterales en cable — 1+3 × 10 @ RER 1
7. Pull over — 1+2 × 20 @ RER 1
8. Face pull — 1+3 × 20 @ RER 2

#### AVANZADOS — PPL (Empuje-Jalón-Pierna), 6×/week, 12 weeks

**Bloque #1 (weeks 1-5/6):**

**PPL Av Pierna D1 B1**
1. Sentadilla — 3+3 × 6 @ RER 3
2. Peso muerto rumano — 1+3 × 10 @ RER 3
3. Prensa a una pierna — 3+3 × 10 c/u @ RER 2
4. Extensión de rodilla — 1+3 × 12 @ RER 2
5. Curl de pierna sentado — 1+2 × 12 @ RER 3
6. Elevaciones de talones con rodilla extendida — 1+3 × 20 @ RER 2
7. Abducción de cadera — 1+3 × 20 @ RER 2
8. Plancha — 1+2 × 40s @ RER 1

**PPL Av Empuje D1 B1**
1. Press de banca plana — 2+3 × 4 @ RER 3
2. Press militar en máquina — 1+3 × 12 @ RER 2
3. Fondos — 2+3 × 10 @ RER 3
4. Rompe cráneos (o press francés) — 1+3 × 8 @ RER 2
5. Elevaciones laterales de hombro — 1+3 × 12 @ RER 1
6. Patada de tríceps — 1+3 × 20 @ RER 2

**PPL Av Jalón D1 B1**
1. Dominada prono — 1+3 × 6 @ RER 2
2. Remo en cable — 2+3 × 12 @ RER 3
3. Pull over — 1+3 × 20 @ RER 2
4. Curl martillo — 1+3 × 12 @ RER 1
5. Curl inclinado — 1+3 × 15 @ RER 2
6. Encogimiento de hombros — 1+3 × 20 @ RER 1

**PPL Av Pierna D2 B1**
1. Peso muerto — 3+3 × 6 @ RER 3
2. Sentadilla frontal o con safety bar — 2+3 × 12 @ RER 3
3. Hip thrust — 1+3 × 10 @ RER 2
4. Glute ham raise — 1+3 × 12 @ RER 2
5. Curl de pierna acostado — 1+2 × 15 @ RER 3
6. Elevaciones de talones con rodilla flexionada — 1+3 × 20 @ RER 2
7. Abducción de cadera sentado — 1+3 × 20 @ RER 2
8. Crunch convencional — 1+2 × 20 @ RER 1

**PPL Av Empuje D2 B1**
1. Press militar en barra — 2+3 × 4 @ RER 2
2. Press inclinado agarre cerrado — 2+3 × 12 @ RER 2
3. Vuelos en polea para pectoral — 1+3 × 15 @ RER 1
4. Extensión tríceps sobre cabeza — 1+3 × 10 @ RER 2
5. Elevaciones laterales 21s — 1+3 × 7/7/7 @ RER 1
6. Patada de tríceps — 1+3 × 15 @ RER 2
7. Elevaciones de piernas — 1+2 × 10 @ RER 1

**PPL Av Jalón D2 B1**
1. Jalón al pecho polea alta — 1+3 × 12 @ RER 2
2. Seal row — 2+3 × 10 @ RER 3
3. Face pull — 1+3 × 20 @ RER 2
4. **A1:** Curl pronado — 1+3 × 15 @ RER 1, 0min
5. **A2:** Curl supino — 1+3 × 12 @ RER 2
6. Vuelos invertidos — 1+2 × 20 @ RER 1
7. Curl bayesian — 1+2 × 20 @ RER 1

**Bloque #2 (weeks 7/8-11):**

**PPL Av Pierna D1 B2**
1. Peso muerto — 3+3 × 8 @ RER 3
2. Sentadilla box — 1+3 × 10 @ RER 3
3. Hiperextensión 45° — 3+3 × 15 @ RER 2
4. Sentadilla búlgara — 1+3 × 15 @ RER 2
5. Extensión de rodilla a una pierna — 1+2 × 15 @ RER 3
6. Curl de pierna a una pierna — 1+3 × 15 @ RER 2
7. Caminata con banda lateral — 1+3 × 20 @ RER 2
8. Crunch doble — 1+2 × 40s @ RER 1

**PPL Av Empuje D1 B2**
1. Press de banca plana — 2+3 × 6 @ RER 1
2. Press militar con mancuerna sentado — 1+3 × 10 @ RER 1
3. Press de banca cerrado en multipower — 2+3 × 10 @ RER 3
4. Vuelos en polea (de abajo a arriba) — 1+3 × 15 @ RER 2
5. Rompe cráneos — 1+3 × 12 @ RER 1
6. Elevaciones laterales de hombro (preferencia personal) — 1+3 × 15-20 @ RER 2

**PPL Av Jalón D1 B2**
1. Dominada neutra — 1+3 × 7 @ RER 2
2. Remo en barra — 2+3 × 10 @ RER 3
3. Remo con apoyo en pecho — 1+3 × 12 @ RER 2
4. Vuelos invertidos — 1+3 × 15 @ RER 1
5. Remo erguido — 1+3 × 12 @ RER 2
6. Curl spiderman — 1+3 × 20 @ RER 1

**PPL Av Pierna D2 B2**
1. Sentadilla — 3+3 × 6 @ RER 1
2. Peso muerto rumano — 2+3 × 12 @ RER 3
3. Hip thrust con pausa — 1+3 × 10 @ RER 2
4. Sentadilla goblet — 1+3 × 12 @ RER 2
5. Curl de pierna acostado — 1+2 × 15 @ RER 3
6. Elevaciones de talones con rodilla flexionada — 1+3 × 20 @ RER 2
7. Pull through — 1+3 × 20 @ RER 2
8. Crunch convencional — 1+2 × 20 @ RER 1

**PPL Av Empuje D2 B2**
1. Press militar en barra — 2+4 × 4 @ RER 2
2. Press inclinado con mancuernas — 2+3 × 12 @ RER 2
3. Vuelos en polea para pectoral (arriba abajo) — 1+3 × 15 @ RER 1
4. Tríceps push down — 1+3 × 12 @ RER 2
5. Elevaciones laterales de hombro — 1+3 × 15 @ RER 1
6. Fondos con excéntrica acentuada — 1+2 × 10 @ RER 2
7. Elevaciones de piernas — 1+2 × 12 @ RER 1

**PPL Av Jalón D2 B2**
1. Jalón al pecho polea alta supina — 1+3 × 12 @ RER 2
2. Seal row — 2+3 × 10 @ RER 3
3. Pull over — 1+3 × 20 @ RER 2
4. **A1:** Curl pronado — 1+2 × 15 @ RER 1, 0min (drop set mecánico)
5. **A3:** Curl martillo — 1+2 × 12 @ RER 2, 0min
6. **A3:** Curl supino — 1+2 × 20 @ RER 1
7. Vuelos invertidos — 1+2 × 20 @ RER 1

> **AMRAP (week 12, Avanzados):** same exercise list as Bloque #2. Reps field = "AMRAP". Handle at plan override, NOT a separate session.

### 4.2 Excel templates (~17 unique sessions, English names — TRANSLATION TO SPANISH REQUIRED to match his library)

Source files in [`/Users/emilioloboguerrero/app/excel_bejarano/`](./). Session exercise lists below use English as in source. Translation decisions pending.

#### Home 5-day FB (Reporte_EntrenoCasa.xlsm) — Spanish, bodyweight
- **FB Casa 1:** Sentadilla búlgara, Flexiones inclinadas, Curl acostado toalla, Remo invertido con sábana, Curl bíceps, Doble crunch + cardio 30min
- **FB Casa 2:** Flexiones con déficit, Aperturas en piso, Hip thrust una pierna, Remo unilateral, Pike push ups, Enterradoras, Comandos + cardio
- **FB Casa 3:** Remo unilateral, Remo invertido con sábana, Sentadilla goblet, Elev. talón parado, Remo mentón, Curl bíceps concentrado, Enterradoras + cardio
- **FB Casa 4:** Peso muerto rumano, Fondos, Curl nórdico, Extensión cuádriceps, Pull over, Elevación lateral isométrica, Face pull, Enterradoras + cardio
- **FB Casa 5:** Pike push up, Elevación lateral individual, Remo invertido con sábana, Abducción con peso, Curl bíceps, Crunch en bicicleta, Elevaciones de talón parado, Push ups spiderman + cardio

#### Gym 3-Day FB (English, 3 sessions)
- **FB Gym 1:** Back squat, Chest-Supported Row, Barbell RDL, Machine Shoulder Press, Leg Press, Preacher Curl, Decline Plate-Weighted Crunch + Plank
- **FB Gym 2:** Bench Press, Barbell RDL, Pull-Up, Leg Extension, Cable Lateral Raise, Seated Leg Curl, Overhead Triceps Extension
- **FB Gym 3:** Lat Pulldown, Walking Lunge, Skull Crusher, Barbell Hip Thrust, Cable Lateral Raise + Hanging Leg Raise, Cable Curl, Skull Crusher

#### Gym 4-Day UL-UL (4 sessions — Legs 1/2 are reused in 5- and 6-day files)
- **UL Legs 1:** Back squat, Pausa Abajo Squat, Barbell RDL, Walking Lunge, Seated Leg Curl, Leg Press Calf Raise, Decline Crunch + Plank
- **UL Upper 1:** Bench Press, Chest-Supported Row, Seated DB Shoulder Press, Remo Unilateral arrodillado, Cable Lateral Raise, Preacher Curl, Overhead Triceps Extension
- **UL Legs 2:** Deadlift, Barbell RDL, Leg Press, Good Morning, Leg Extension, Seated Calf Raise, Hanging Leg Raise + V sit-up
- **UL Upper 2:** Barbell Incline Press, Pull-Up, Skull Crusher, Machine Shoulder Press, Cable Lateral Raise + Reverse Pec Deck, Cable Curl, Skull Crusher

#### Gym 5-Day PPL-UL (adds: PPL-UL Push, PPL-UL Pull, PPL-UL Upper)
- Legs 1, Legs 2: same as UL
- **5-PPL Push:** Bench Press, Bench Press pies encima banco, Seated DB Shoulder Press, PecFly arriba abajo, Cable Lateral Raise, Triceps Pressdown, Overhead Triceps Extension
- **5-PPL Pull:** Lat Pulldown, Chest-Supported Row, Remo Unilateral arrodillado, Cable Pullover, Face Pull, Bicep Curl, Preacher Curl
- **5-PPL Upper:** same as UL Upper 2

#### Gym 6-Day PPL (adds: 6-PPL Push 1, Pull 1, Push 2, Pull 2)
- Legs 1, Legs 2: same as UL
- **6-PPL Push 1:** same as 5-PPL Push
- **6-PPL Pull 1:** same as 5-PPL Pull
- **6-PPL Push 2:** Barbell Incline Press, Machine Shoulder Press, Skull Crusher, Cable Pec Flye, Cable Lateral Raise, Plate Front Raise, Diamond Push Up
- **6-PPL Pull 2:** 1-Arm Lat Pull-Down, Pull-Up, DB Row, Cable Shrug-In, Reverse Pec Deck, Cable Curl, Preacher Curl

#### Abdomen (Rutina_Abdomen.xlsm) — 1 session
- Hanging Leg Raise + V sit-up, Ab Wheel + Pallof Press, Decline Plate-Weighted Crunch + Plank

#### Glute Optimization x5 (5 sessions — heavy glute/leg focus)
- **Glute Legs 1:** Back squat, Barbell RDL, Barbell Hip Thrust, Good Morning, Machine Seated Hip Abduction, Decline Crunch + Plank
- **Glute Push 1:** Machine Shoulder Press, Lat Pulldown, Skull Crusher, DB Row, Cable Lateral Raise + Face Pull, DB Incline Curl + Overhead Triceps Extension
- **Glute Legs 2:** Barbell Hip Thrust, 45° Hyperextension, Leg Press, Kettlebell Swing + Sliding Leg Curl, Cable Glute Kickback + Cable Abduction, Hanging Leg Raise + V sit-up
- **Glute Pull 1:** Bench Press, 1-Arm Lat Pull-Down, Machine Shoulder Press, Chest-Supported Row, Cable Lateral Raise + Reverse Pec Deck, Preacher Curl, Skull Crusher
- **Glute Opt Legs 2:** Deadlift, Barbell Hip Thrust con Pausa Arriba 3s, Walking Lunge, Frog Pump, Leg Extension, Machine Seated Hip Abduction, Ab Wheel + Pallof Press

> **Superset encoding:** Excel uses letter codes A / B / C1+C2 / D / E1+E2 / F / G1+G2. Same convention as PDFs A1/A2/A3. Encode in exercise `order` (sequential) plus a `notes` field flagging "A1", "A2" for the UI to render as superset.

> **Excel "SUSTITUTO 1/2" columns** → populate `alternatives` array on each exercise.

---

## 5. Exercise name mapping

Felipe's library has 103 exercises (all Spanish, verbose naming like `PESO MUERTO RUMANO (RDL)`, `JALÓN AL PECHO AGARRE AMPLIO (PULL DOWN)`). The PDFs use shorter Spanish names. The Excel uses English.

### Exact matches (no action) — ~30 names
PRESS DE BANCA PLANA, FONDOS EN PARALELAS, PESO MUERTO, SEAL ROW, CURL DE BÍCEPS SUPINO, SENTADILLA BÚLGARA, FACE PULL, CRUNCH EN CABLE, RUEDA ABDOMINAL, SISSY SQUAT, HIPEREXTENSIÓN 45°, CURL DE PIERNA ACOSTADO, CURL DE PIERNA SENTADO, GLUTE HAM RAISE, DOMINADA PRONO, DOMINADA NEUTRA, REMO EN BARRA HORIZONTAL, REMO EN CABLE AGARRE ABIERTO, REMO EN CABLE AGARRE CERRADO, REMO UNILATERAL CON MANCUERNA, CURL DE BÍCEPS MARTILLO, CURL DE BÍCEPS PRONO, CURL DE BÍCEPS INCLINADO, CRUNCH CONVENCIONAL, ENCOGIMIENTO DE HOMBROS, ELEVACIONES DE TALONES CON RODILLA FLEXIONADA, CAMINATA CON BANDA LATERAL, SENTADILLA GOBLET, PRESS MILITAR CON MANCUERNA SENTADO, PULL THROUGH, PATADA DE TRÍCEPS.

### Renames — library → PDF short form
**Proposed:** rename Felipe's library entries to match the PDF short names (which are also what he uses in sessions day-to-day).

| Library (current) | Rename to |
|---|---|
| SENTADILLA TRASERA | SENTADILLA |
| PESO MUERTO RUMANO (RDL) | PESO MUERTO RUMANO |
| TRICEP PUSH DOWN | TRÍCEPS PUSH DOWN |
| FROG PUMP | FROG PUMPS |
| ELEVACIÓN DE TALÓN CON RODILLA EXTENDIDA | ELEVACIONES DE TALONES CON RODILLA EXTENDIDA |
| CURL DE BÍCEPS PREDICADOR | CURL PREDICADOR |
| CURL DE BÍCEPS EN BARRA | CURL EN BARRA |
| CURL DE BÍCEPS BAYESIAN | CURL BAYESIAN |
| CURL DE BÍCEPS SPIDERMAN | CURL SPIDERMAN |
| PRESS DE BANCA INCLINADO | PRESS INCLINADO |
| PRESS DE BANCA INCLINADO CON MANCUERNAS | PRESS INCLINADO CON MANCUERNAS |
| PRESS MILITAR EN MÁQUINA | (keep — PDF has same w/ accent) |
| VUELOS PARA PECTORAL EN POLEA (DE ABAJO A ARRIBA) | VUELOS EN POLEA PARA PECTORAL |
| BUENOS DÍAS CON BARRA | BUENOS DÍAS |
| PLANCHA (PLANK) | PLANCHA |
| ELEVACIONES DE PIERNAS (ABS) | ELEVACIONES DE PIERNAS |
| CLAM SHELL | CLAM |
| PRENSA DE PIERNA UNILATERAL | PRENSA A UNA PIERNA |
| CRUNCH DOBLE EN V | CRUNCH DOBLE |
| EXTENSIÓN DE RODILLA EN MÁQUINA UNA PIERNA | EXTENSIÓN DE RODILLA A UNA PIERNA |
| CURL DE PIERNA ACOSTADO A UNA PIERNA | CURL DE PIERNA A UNA PIERNA |
| DOMINADA SUPINA (CHIN UPS) | CHIN UP |
| HIP THRUST UNILATERAL CON MANCUERNA | HIP THRUST UNILATERAL |
| REMO CON APOYO EN PECHO EN MÁQUINA | REMO CON APOYO EN PECHO |
| ABDUCCIÓN DE CADERA SENTADO EN MÁQUINA | ABDUCCIÓN DE CADERA SENTADO |
| ELEVACIONES LATERALES DE HOMBRO MÁQUINA | ELEVACIONES LATERALES EN MÁQUINA |
| ELEVACIONES LATERALES DE HOMBRO EN CABLE | ELEVACIONES LATERALES EN CABLE |
| REMO AL MENTÓN | REMO ERGUIDO |
| PRESS FRANCES CON MANCUERNAS | ROMPE CRÁNEOS (alias for same exercise) |
| TRICEP PUSH DOWN | (already in renames above) |

### Ambiguous — PDF says less than library offers; pick a default
Recommended defaults:

| PDF says | → Library variant |
|---|---|
| JALÓN AL PECHO POLEA ALTA | JALÓN AL PECHO AGARRE AMPLIO (PULL DOWN) |
| PRESS MILITAR EN BARRA | PRESS MILITAR EN BARRA PARADO |
| PRESS MILITAR CON MANCUERNAS | PRESS MILITAR CON MANCUERNAS PARADO |
| HIP THRUST | HIP THRUST CON BARRA |
| ELEVACIONES LATERALES DE HOMBRO | ELEVACIONES LATERALES DE HOMBRO MANCUERNA |
| VUELOS INVERTIDOS | VUELOS INVERTIDOS CON MANCUERNA |
| ABDUCCIÓN DE CADERA | ABDUCCIÓN DE CADERA SENTADO EN MÁQUINA |
| PULL OVER | PULL OVER EN POLEA |
| REMO EN CABLE (Avanzados solo) | REMO EN CABLE AGARRE NEUTRO |
| REMO EN BARRA (Avanzados B2 Jalón D1) | REMO EN BARRA HORIZONTAL |

### Missing from library — need to add (~10)
- PULL DOWN SUPINO (or map to `JALÓN AL PECHO POLEA ALTA SUPINA` — same thing)
- JALÓN AL PECHO POLEA ALTA SUPINA (if not deduping above)
- SENTADILLA BOX
- CURL DE PIERNA ACOSTADO CONSTANTE
- PRESS INCLINADO AGARRE CERRADO
- ELEVACIONES LATERALES DE HOMBRO 21s
- PRESS DE BANCA CERRADO EN MULTIPOWER
- FONDOS CON EXCÉNTRICA ACENTUADA
- HIP THRUST CON PAUSA
- EXTENSIÓN DE RODILLA (bilateral — library only has unilateral)
- CURL PIERNA NÓRDICO (library has CURL DE PIERNA NÓRDICO — exact match, no action)
- ENTERRADORAS (library has it)
- SENTADILLA FRONTAL O CON SAFETY BAR — use `SENTADILLA FRONTAL` + note, or add new variant

### Excel-only names (English — need translation decisions)
Many Excel names need a decision: translate to existing Spanish library entry, or create new English entries? Examples:
- `Back squat` → `SENTADILLA`
- `Bench Press` → `PRESS DE BANCA PLANA`
- `Lat Pulldown` → `JALÓN AL PECHO AGARRE AMPLIO (PULL DOWN)`
- `Skull Crusher` → `ROMPE CRÁNEOS` (aka `PRESS FRANCES CON MANCUERNAS`)
- `Pull-Up` → `DOMINADA PRONO`
- `Chin-up` → `CHIN UP` / `DOMINADA SUPINA`
- `Chest-Supported Row` → no direct match — **add?**
- `DB Row` → `REMO UNILATERAL CON MANCUERNA`
- `Kettlebell Swing` → no match — **add?**
- `Cable Pullover` → map to `PULL OVER EN POLEA`
- `Pausa Abajo Squat` → **add?** (tempo variant)
- `Frog Pump` → `FROG PUMPS` (renamed from FROG PUMP)
- `Sliding Leg Curl` → **add?**
- `Pallof Press` → **add?**
- `PecFly` → `VUELOS PARA PECTORAL EN POLEA` (or `PEC DEC`?)
- `Plate Front Raise`, `DB Front Raise` → **add?**
- `Diamond Push Up` → **add?**
- `Good Morning` → `BUENOS DÍAS`
- `Machine Seated Hip Abduction` → `ABDUCCIÓN DE CADERA SENTADO EN MÁQUINA`
- `Cable Glute Kickback` → no match — **add?**
- `Cable Abduction` → `ABDUCCIÓN DE CADERA EN POLEA`

**Recommendation:** translate all Excel names to Spanish matching existing library entries. For names with no library match, add new Spanish entries (not English).

---

## 6. Pending decisions — RESOLVED 2026-04-23

See §0 for the locked decisions.

---

## 7. Implementation plan

Target script: `scripts/seed-felipe-sessions.js` (mirror the `scripts/dump-felipe-library.js` pattern — firebase-admin with `applicationDefault()` ADC).

### Phases
1. **--dry-run** — print every intended write to stdout (session title → exercises → sets). No writes. Review.
2. **--rename-exercises** — apply §5 renames to `exercises_library/{jeoVyzhUrBeJofT62MOe}`. Note: renaming a field means `delete old + create new`, which breaks existing `primary` references. Since his test session references old names, we'd have to migrate that too. **Safer:** add new entries as aliases OR decide per-session which primary name to use.
3. **--add-missing** — add new exercise entries to library with empty `muscle_activation` + `implements: []` (Felipe fills in via UI later).
4. **--seed** — create library sessions + exercises + sets. Idempotent via title: skip if session with same title exists.

### defaultDataTemplate (hardcoded)
```js
const TEMPLATE = {
  measures:   ["reps", "weight", "intensity"],
  objectives: ["reps", "intensity", "previous"],
  customMeasureLabels:   {},
  customObjectiveLabels: {}
};
```

### Per-exercise write
```js
{
  name: "",                              // empty — UI reads from primary
  order: n,
  primary: { [EXERCISE_LIB_ID]: "EXACT NAME" },
  measures:   TEMPLATE.measures,
  objectives: TEMPLATE.objectives,
  // if superset member:
  notes: "A1" / "A2" / "A3",
  // if alternatives in source:
  alternatives: [{ primary: { [id]: "SUB NAME 1" } }, ...]
}
```

### Per-set write
```js
{
  order: n,
  title: `Serie ${n+1}`,
  reps: "8-10" | "12" | "AMRAP",   // string
  intensity: "RER 2" | "7/10",     // match Felipe's format
  // No weight. No restSeconds unless explicit.
}
```

Rest field: **note only, don't store** unless session exercise has notable rest (>2min). Felipe's test session doesn't store rest.

---

## 8. Source files (all read, parsed, dumped)

- [RUTINA_NOVATOS_FULLBODY_final_BEJARANOFIT (1).pdf](../RUTINA_NOVATOS_FULLBODY_final_BEJARANOFIT%20%281%29.pdf) (70 pages)
- [RUTINA_INTERMEDIOS_TP_final_BEJARANOFIT.pdf](../RUTINA_INTERMEDIOS_TP_final_BEJARANOFIT.pdf) (80 pages)
- [RUTINA_AVANZADOS_PPL_final_BEJARANOFIT.pdf](../RUTINA_AVANZADOS_PPL_final_BEJARANOFIT.pdf) (80 pages)
- 7 Excel files in [excel_bejarano/](./) (Reporte_EntrenoCasa, 3 DIAS FULL BODY, 4 DIAS UL-UL, 5 DIAS PPL-UL, Abdomen, GluteOptimization x5, PushPullLegs)

---

## 9. API default changed (pending deploy)

[`functions/src/api/routes/creator.ts:4203`](../functions/src/api/routes/creator.ts#L4203): default measures updated from `["reps","weight"]` → `["reps","weight","intensity"]`. Not deployed yet. Affects *new sessions created via API only*. Admin-SDK seed script bypasses this.

---

## 10. Opening prompt for next chat

Paste this verbatim to resume:

> Continuing Felipe Bejarano library seeding. **Check your auto-memory first**, then read [`excel_bejarano/HANDOFF.md`](excel_bejarano/HANDOFF.md) top to bottom. State of play: research done, ~40 sessions identified across 3 PDF routines + 7 Excel templates, exercise name mapping drafted with pending decisions in §6. Nothing written to Firestore yet. I want to address §6 pending decisions and then build the seed script.
