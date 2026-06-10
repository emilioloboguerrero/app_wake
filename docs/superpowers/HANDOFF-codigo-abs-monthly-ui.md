# HANDOFF — Código ABS: usar la UI de "plan mensual" (drops) del Método, no el editor de planificación

## Tarea principal (lo único que falta en código)
En la **app de creador**, la edición de contenido del programa **Código ABS** debe usar **exactamente la misma UI y funciones del programa mensual del Método Bejarano** — el **"CALENDARIO DE DROPS"** (meses como bloques/drops en un calendario, con "+ Crear drop", publicar bloque, etc.) — **NO** el editor de planificación por semanas (`PlanDetailScreen`) que está embebido ahora.

La ÚNICA diferencia con el Método: un **dropdown arriba para elegir la planificación (nivel)** — Principiante / Intermedio / Avanzado — que cambia cuál de las 3 planificaciones estás viendo/editando en ese mismo calendario de drops. Por defecto entra a la primera (principiante).

Es **el mismo tipo de programa que el Método Bejarano** (monthly-drop, `block_cadence: monthly_first_monday`), solo que el contenido vive en 3 planes (uno por nivel) en vez de en los módulos del curso.

## Qué está MAL ahora (revertir)
`apps/creator-dashboard/src/components/program/ProgramTrainingTab.jsx` actualmente, cuando el programa tiene `level_plans`, hace un early-return con un **dropdown + `<PlanDetailScreen embedded>`** (vista de planificación por semanas). ESO ES LO INCORRECTO. Hay que reemplazarlo por la vista de calendario de drops del Método (ver abajo), apuntada al plan del nivel seleccionado. También se hizo embebible `PlanDetailScreen` (props `planId`/`embedded`) — se puede dejar pero ya no se usará para esto.

## Cómo es la UI correcta (la del Método) y dónde está
- El Método (`courses/NTQIWMZBOxntwmUiXQZp`, `block_cadence: monthly_first_monday`) muestra su contenido en la pestaña **Contenido → Entrenamiento** con el **CALENDARIO DE DROPS** (lo que se ve en el screenshot del usuario: "JUNIO 2026 / Sin drop / + Crear drop", grilla de calendario).
- Ese componente es **`ProgramCadenceCalendar`** (renderizado por `ProgramTrainingTab` cuando `cadenceActive`). Lee los módulos del curso (`courses/{programId}/modules`) + `program_state` + la cadencia. La barra lateral izquierda ("Sesiones / Planes", "ARRASTRA A UN DÍA") es la librería del creador para construir drops.
- **El fix:** hacer que, para un curso con `level_plans`, ese MISMO calendario de drops (ProgramCadenceCalendar + su flujo de crear/editar/publicar drops y editar las sesiones del mes) opere sobre **los módulos del PLAN del nivel seleccionado** (`plans/{level_plans[level]}/modules`) en vez de `courses/{programId}/modules`. Más un **dropdown de nivel** arriba.
- Investigar a fondo `ProgramTrainingTab.jsx` + `ProgramCadenceCalendar` (y los hooks/servicios que cargan módulos del curso, p.ej. `programService` / la query de módulos) para parametrizar la fuente de módulos (curso vs `plans/{planId}`) y las acciones de drop. Probablemente haya que: (a) aceptar un `planId` opcional como fuente de módulos, (b) que "crear/editar drop" y "editar sesiones del mes" escriban en `plans/{planId}/modules/...`, (c) que la cadencia/`current_block_index` siga viviendo en el shell + `program_state` (eso ya es así).

## Arquitectura ya construida (NO rehacer)
**Modelo:** programa = caparazón; cada nivel apunta a una planificación (plan) entera. Datos en prod (`wolf-20b8b`):
- Shell: `courses/ezJWUr3wJvaeptIM5f86` — "Código ABS", `deliveryType: general`, `block_cadence: monthly_first_monday`, `status: draft`, `current_block_index: 0`, `current_block_id: "mes-1"`, `subscription_price: 49000` (placeholder), + campos de paridad con el Método (free_trial, tutorials, weekly, weight_suggestions, version, etc.).
  - `levels: { options: ["principiante","intermedio","avanzado"], default: "principiante" }`
  - `level_plans: { principiante: "T36ekPP74xxXGvzcEeTD", intermedio: "SJZ3Exve41jBmt20V6m2", avanzado: "dCvTp1BW2Yc5lomXCE9x" }`
- Cada plan: **12 módulos** `mes-1..mes-12` (order 0–11, título "Mes N — tema"), cada módulo = **3 sesiones** `enfoque-A/B/C` (dayIndex 1/3/5), ejercicios (`primary: {[LIB_ID]: key20char}`, `alternatives:{}`, measures/objectives), sets (`reps`, `intensity:"N/10"`, `rep_sequence:[4]` para la progresión de 4 semanas; holds usan `duration`). **SIN `weekIndex`** (modelo idéntico al Método: la variación de 4 semanas va en `rep_sequence`).
- Librería compartida de Felipe: `exercises_library/jeoVyzhUrBeJofT62MOe` (se le agregaron ~25 movimientos de abdomen; entradas en submap `exercises.{key}` + legacy por nombre).
- `program_state/ezJWUr3wJvaeptIM5f86`: `current_block_index: 0`, `current_block_id: "mes-1"`.

**Backend (ya desplegado a prod functions):**
- Resolución de lectura por nivel en `functions/src/api/routes/workout.ts`: `/workout/daily`, `/workout/session-exercises`, `/workout/programs/:id/modules`, `/current-block` resuelven `nivel→plan→módulo(order==current_block_index)→sesiones`. (Helpers en `functions/src/api/services/levelResolution.ts`, 47 tests.)
- `PATCH /users/me/courses/:courseId/level` (en `profile.ts`) setea `users.courses[courseId].level`.
- Cron `advanceMonthlyDropCourse` (en `functions/src/index.ts`) gatea el avance a que los 3 planes tengan el siguiente mes publicado.
- Allowlists de creador (en `creator.ts`) aceptan `levels`/`level_plans` (program PATCH) y `weekIndex` (plan sessions — ya no se usa weekIndex pero la allowlist está).
- `PUBLIC_COURSE_FIELDS` (en `securityHelpers.ts`) expone `levels`/`level_plans`.

**PWA (ya desplegada):** modal de nivel en Hoy al primer ingreso + switcher de nivel en el reverso del workout card + cache key con nivel. Helpers `apps/pwa/src/utils/levelGate.js`, `services/courseLevelService.js`. Hooks `useCoursesEnriched`/`useUserCourses` exponen `levels`/`level_plans`/`level`.

**Creador (ya construido):** `LevelPlansConfig.jsx` (pestaña Programa) mapea nivel→plan y escribe `course.levels`/`level_plans` (usa `programService.updateProgram`). **Esto está bien, dejarlo.** Lo que hay que arreglar es la pestaña **Contenido** (ProgramTrainingTab).

**Seed:** `scripts/seed-codigo-abs.js` — generador de 12 meses (4 fases × 3 meses, rota combos sobre ~25 movimientos), idempotente con `recursiveDelete` (reset). Correr: `APPLY_PROD=1 NODE_PATH=functions/node_modules node scripts/seed-codigo-abs.js --write`. Modos: dry-run (default) / `--validate` / `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 --write` (emulador).

## Estado de despliegue
- functions + hosting desplegados a prod; seed corrido (12 meses × 3 niveles, draft). Verificado vía MCP.
- Emilio (uid `EaulLBwn79Pgn7e8RAgN6umeygU2`) tiene acceso al curso draft para verlo en la PWA.
- Código en rama local `feat/codigo-abs-niveles` (y `feat/codigo-abs-completo` en remoto, PR #21). El ruleset de GitHub **bloquea push directo a ramas existentes/main** ("changes via PR") — push a una rama NUEVA sí funciona. Los deploys se hacen desde el working tree.

## Gotchas (aprendidos a la mala)
1. **`exercises_library` writes:** usar `ref.set({ exercises: {key: entry}, [name]: legacy }, {merge:true})` con objeto ANIDADO (merge profundo). NO usar claves con punto `"exercises.key"` en `set(merge)` (crea campos literales basura) NI `update()` (falla si el doc no existe, p.ej. en emulador limpio).
2. **App Check** bloquea llamadas scripteadas a la API de prod (no se puede curlear /workout/daily en prod). Verificar con emulador (capstone) + lecturas MCP.
3. **Lint creator-dashboard roto** (sin binario eslint). Tests PWA reales via `npm --prefix apps/pwa run test:unit` (vitest; el script `test` apunta a jest que no está). functions tests via vitest (los de reglas necesitan emulador firestore en :8080).
4. **Emulador:** el puerto 4000 (UI) lo dejan tomado procesos zombie → `pkill -f "emulators:start"` + matar puertos 4000/4400/8080 antes de reiniciar.
5. **`primary` debe ser key de 20 chars** (no el nombre) — resolver desde el submap de la librería.

## Pendiente no-código (Felipe/Emilio)
Refinar prescripciones reales M3–12 (hoy extrapoladas) + Intermedio (hoy interpolado) + grabar videos de los movimientos nuevos (`video_url:''`). Luego: publicar (`status` draft→published), definir precio real e imagen.

## Docs/memoria de referencia
- Spec: `docs/superpowers/specs/2026-06-09-codigo-abs-niveles-design.md`
- Planes: `docs/superpowers/plans/2026-06-09-codigo-abs-niveles-{backend,creadores,pwa,seed}.md`
- Memoria: `~/.claude/.../memory/project_codigo_abs_niveles.md`
