# Código ABS — Niveles: Plan 4 — Contenido / Seed

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Un script idempotente que crea en producción el programa-shell "Código ABS" + 3 planificaciones (Principiante/Intermedio/Avanzado), cada una con módulos-mes y sesiones marcadas por `weekIndex`+`dayIndex`, todo apuntando a una librería base de ejercicios de abdomen, dejando el shell con `levels` + `level_plans` cableados.

**Architecture:** Reusa el patrón de `scripts/seed-metodo-bejarano.js` (dry-run por defecto, `--validate`, `--write`, idempotente, `NODE_PATH=functions/node_modules`). Diferencias clave para ABS: el contenido vive en `plans/{planId}` (3 planes), no en `courses/{id}/modules`; el shell solo guarda `levels` + `level_plans`; las sesiones llevan `weekIndex`. Como el manuscrito está incompleto, el script se entrega con la **estructura completa + Mes 1 autorizado para los 3 niveles** como plantilla validada y extensible (extender el array de meses a medida que Felipe complete el contenido).

**Tech Stack:** Node script en `scripts/`, Firebase Admin SDK (vía `NODE_PATH=functions/node_modules`), Firestore. Builders puros testeables con vitest (en `functions`, donde está vitest) si se extraen a un módulo importable; si no, validación vía `--validate` + `--dry-run` + lectura de vuelta por MCP.

> **PRODUCCIÓN.** `wolf-20b8b` es prod. El `--write` NO se corre sin confirmación explícita del usuario (`feedback_deploy_confirmation`). Todo se crea en `status: draft` / módulos sin `published_at` hasta que Felipe revise y publique desde el dashboard.

**Prereqs:** Plan 1 desplegado (API resuelve por nivel) y, para probar de punta a punta, Planes 2–3. El contenido real (R22–50, nivel Intermedio, prescripciones por semana) es homework de Felipe.

---

## Contrato de datos que produce el seed (referencia)

```
courses/{absCourseId}  (shell)
  title: "Código ABS", creator_id: FELIPE_UID, deliveryType: "general",
  block_cadence: "monthly_first_monday", access_duration: "monthly",
  subscription_price: <COP>, status: "draft", scheduling: "weekly",
  levels: { options: ["principiante","intermedio","avanzado"], default: "principiante" },
  level_plans: { principiante: <planP>, intermedio: <planI>, avanzado: <planA> }
  (capacity: <n> si beta)

plans/{planX}  (×3, uno por nivel)
  title: "Código ABS — <Nivel>", creator_id: FELIPE_UID, discipline: "abdomen"
  modules/{m}  order 0..11, title "Mes N — <tema>", published_at: null (hasta publicar)
    sessions/{s}  title "<Enfoque>", order, dayIndex (1=Lun..), weekIndex 0..3,
                  source_library_session_id (opcional)
      exercises/{e}  primary:{[ABS_LIB_ID]: exId}, alternatives, measures, objectives, order
        sets/{set}  reps, intensity "N/10", restSeconds, rep_sequence?, order, title

program_state/{absCourseId}
  current_block_index: 0, current_block_id: <planP módulo order0 id>, current_block_started_at
```

---

## Task 1: Librería base de ejercicios de abdomen

**Files:**
- Create: `scripts/seed-codigo-abs-library.js`

- [ ] **Step 1: Definir la lista base** (~15–20 movimientos del manuscrito: crunch suelo, crunch en cable, crunch declinado, elevación pélvica, elevaciones de piernas colgado, plancha frontal, plancha lateral, woodchopper/giro ruso, dead bug, hollow hold, ab-wheel, deslizamiento fitball, farmer walk, pallof press, sit-up, crunch inverso, v-up, bicicletas). Cada uno con `name` canónico (displayName) y campos base (`muscle_activation`, `implements`).

- [ ] **Step 2: Escribir el script** que crea/asegura `exercises_library/{ABS_LIB_ID}` con esos ejercicios (idempotente por displayName), siguiendo cómo `seed-metodo-bejarano.js` lee la librería (`exercises_library/{LIB_ID}` → `buildNameToIdIndex`). Generar/fijar un `ABS_LIB_ID`. Modo dry-run por defecto, `--write` para commitear.

- [ ] **Step 3: Dry-run**

Run: `NODE_PATH=functions/node_modules node scripts/seed-codigo-abs-library.js`
Expected: imprime los ejercicios que crearía, sin escribir.

- [ ] **Step 4: Commit del script** (no de datos)

```bash
git add scripts/seed-codigo-abs-library.js
git commit -m "feat(abs-seed): ABS exercise library seed script (dry-run)"
```

- [ ] **Step 5: Escribir la librería (CON confirmación del usuario)**

Run (solo tras go explícito): `NODE_PATH=functions/node_modules node scripts/seed-codigo-abs-library.js --write`
Verificar por MCP: `exercises_library/{ABS_LIB_ID}` tiene los movimientos.

---

## Task 2: Modelo del macro (config) + builders puros

**Files:**
- Create: `scripts/codigo-abs-macro.js` (config + builders, importable)
- Test (opcional, recomendado): `functions/src/api/services/absMacro.test.ts` NO — el script es JS en `scripts/`. Si se quiere TDD, mover los builders puros a `scripts/codigo-abs-macro.js` y testear con un runner ligero, o validar vía `--validate`.

- [ ] **Step 1: Definir la estructura del macro** como datos: por nivel, un array de 12 meses; cada mes con tema (título) y, por semana (`weekIndex` 0..3) × día (`dayIndex` 1/3/5 → enfoques A/B/C), una sesión con sus ejercicios (por `name` de la librería) + sets (con `rep_sequence`/`intensity`). Autorizar **Mes 1 para los 3 niveles** como plantilla; dejar Meses 2–12 como TODO de contenido (Felipe).

```javascript
// scripts/codigo-abs-macro.js (forma; completar contenido real con Felipe)
const ENFOQUES = { A: 'Flexión espinal (grosor)', B: 'Oblicuos y rotación', C: 'Fuerza, densidad e isometría' };

// Helper para una sesión (un día de una semana)
function session({ title, dayIndex, weekIndex, exercises }) {
  return { title, dayIndex, weekIndex, exercises };
}
function ex({ name, sets }) { return { name, sets }; }
function set({ reps, intensity = '7/10', restSeconds = 60, repSequence = null }) {
  return { reps, intensity, restSeconds, ...(repSequence ? { rep_sequence: repSequence } : {}) };
}

// Mes 1 — "Adaptación" (mismo esqueleto por nivel; cambian las variantes de ejercicio)
const MES_1 = {
  principiante: [
    session({ title: ENFOQUES.A, dayIndex: 1, weekIndex: 0, exercises: [
      ex({ name: 'Elevación pélvica - rodillas al pecho', sets: [set({ reps: '10-12' }), set({ reps: '10-12' }), set({ reps: '10-12' })] }),
      ex({ name: 'Crunch suelo', sets: [set({ reps: '12-15' }), set({ reps: '12-15' }), set({ reps: '12-15' })] }),
      ex({ name: 'Plancha frontal', sets: [set({ reps: '40s', intensity: null }), set({ reps: '40s', intensity: null })] }),
    ]}),
    // ... weekIndex 0 días B(3)/C(5); luego weekIndex 1..3 (progresión + variantes)
  ],
  intermedio: [ /* ... */ ],
  avanzado: [
    session({ title: ENFOQUES.A, dayIndex: 1, weekIndex: 0, exercises: [
      ex({ name: 'Elevaciones de piernas colgado', sets: [set({ reps: '10-12' }), set({ reps: '10-12' }), set({ reps: '10-12' })] }),
      ex({ name: 'Crunch en cable', sets: [set({ reps: '12-15' }), set({ reps: '12-15' }), set({ reps: '12-15' })] }),
      ex({ name: 'Plancha frontal antebrazos altura de ojos', sets: [set({ reps: '40s', intensity: null }), set({ reps: '40s', intensity: null })] }),
    ]}),
  ],
};

const MACRO = {
  principiante: [{ monthIndex: 0, title: 'Mes 1 — Adaptación', sessions: MES_1.principiante }],
  intermedio:   [{ monthIndex: 0, title: 'Mes 1 — Adaptación', sessions: MES_1.intermedio }],
  avanzado:     [{ monthIndex: 0, title: 'Mes 1 — Adaptación', sessions: MES_1.avanzado }],
};

module.exports = { MACRO, ENFOQUES };
```

- [ ] **Step 2: Validar resolución de nombres** — un modo `--validate` (como en el seed del Método) que confirma que cada `name` del macro existe en `exercises_library/{ABS_LIB_ID}`.

Run: `NODE_PATH=functions/node_modules node scripts/seed-codigo-abs.js --validate`
Expected: "✓ all exercise references resolve to library IDs" (tras Task 3).

- [ ] **Step 3: Commit**

```bash
git add scripts/codigo-abs-macro.js
git commit -m "feat(abs-seed): macro config + builders (Mes 1 template, 3 niveles)"
```

---

## Task 3: Script de seed del shell + 3 planes

**Files:**
- Create: `scripts/seed-codigo-abs.js`

- [ ] **Step 1: Escribir el script** (modelado en `seed-metodo-bejarano.js`):
  1. `buildNameToIdIndex()` desde `exercises_library/{ABS_LIB_ID}`.
  2. `--validate`: verifica todos los `name` del MACRO (Task 2).
  3. Crear/asegurar el **shell course** "Código ABS" (idempotente por título+creator): `general`, `monthly_first_monday`, `access_duration: monthly`, `scheduling: "weekly"`, `subscription_price`, `status: draft`, `levels: {options:[...], default:'principiante'}`.
  4. Para cada nivel: crear un `plans/{planId}` ("Código ABS — <Nivel>"); por cada mes del MACRO crear `modules/{m}` (`order = monthIndex`, `title`, `published_at: null`); por cada sesión crear `sessions/{s}` con `title`, `order`, `dayIndex`, **`weekIndex`**; por cada ejercicio crear `exercises/{e}` con `primary: {[ABS_LIB_ID]: nameToId.get(name)}`, `measures`, `objectives`, `order`; por cada set crear `sets/{set}` con `reps`, `intensity`, `restSeconds`, `rep_sequence?`, `order`, `title`.
  5. Escribir `level_plans: { principiante, intermedio, avanzado }` en el shell con los IDs de los planes creados.
  6. Idempotente: re-correr no duplica (skip por título de plan/curso ya existente; upsert de módulos por `order`).
  7. Dry-run por defecto; `--write` para commitear.

- [ ] **Step 2: Dry-run**

Run: `NODE_PATH=functions/node_modules node scripts/seed-codigo-abs.js`
Expected: imprime el árbol que crearía (1 course shell + 3 planes × 1 mes × N sesiones), sin escribir.

- [ ] **Step 3: Commit del script**

```bash
git add scripts/seed-codigo-abs.js
git commit -m "feat(abs-seed): shell + 3 level plans seed script (dry-run)"
```

---

## Task 4: program_state inicial (Mes 1 vigente)

**Files:**
- Modify: `scripts/seed-codigo-abs.js` (flag `--seed-state`)

- [ ] **Step 1: Añadir** la creación de `program_state/{absCourseId}` con `current_block_index: 0`, `current_block_id` = id del módulo `order 0` del plan default, `current_block_started_at` = ahora (BOG), para que Mes 1 quede vigente sin esperar al cron. Solo bajo `--write --seed-state`.

- [ ] **Step 2: Commit**

```bash
git add scripts/seed-codigo-abs.js
git commit -m "feat(abs-seed): optional program_state seed (Mes 1 live)"
```

---

## Task 5: Ejecución en producción (CON confirmación) + verificación

- [ ] **Step 1: Validar**

Run: `NODE_PATH=functions/node_modules node scripts/seed-codigo-abs.js --validate`
Expected: todas las referencias resuelven.

- [ ] **Step 2: Confirmar con el usuario** antes de escribir (prod). Recordar: queda en `draft`, sin `published_at`.

- [ ] **Step 3: Escribir (solo tras go explícito)**

Run: `NODE_PATH=functions/node_modules node scripts/seed-codigo-abs.js --write`
y, si se quiere Mes 1 vigente para QA: `... --write --seed-state`.

- [ ] **Step 4: Verificar por MCP/console**
  - `courses/{absCourseId}`: `levels` + `level_plans` (3 IDs), `status: draft`.
  - `plans/{planP|planI|planA}`: 1 módulo (`order 0`), sesiones con `weekIndex` + `dayIndex`, ejercicios con `primary`, sets con `rep_sequence`.
  - Punta a punta (con Planes 1–3): suscribir un usuario de prueba, elegir nivel en Hoy, confirmar que el card carga el plan correcto y que cambiar de nivel cambia el contenido.

- [ ] **Step 5: NO publicar** (`status` y `published_at`) hasta que Felipe revise y complete Meses 2–12 + nivel Intermedio. La publicación se hace desde el dashboard (Plan 2) o un script aparte, con confirmación.

## Self-review (cobertura del spec — Plan 4)
- Shell ABS con `levels` + `level_plans`: Task 3 ✓
- 3 planes con módulos-mes + sesiones `weekIndex`/`dayIndex` + ejercicios/sets: Tasks 2–3 ✓
- Librería base reusada por los 3 planes: Task 1 ✓
- `program_state` para Mes 1 vigente: Task 4 ✓
- Idempotente, dry-run/validate/write, prod con confirmación, todo draft: Tasks 3–5 ✓
- Contenido R22–50 / Intermedio completo = homework de Felipe (fuera del código): documentado ✓
