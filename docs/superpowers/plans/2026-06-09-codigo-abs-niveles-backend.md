# Código ABS — Niveles (shell→planes): Plan 1 — Backend

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que la API resuelva el contenido de un programa-shell según el nivel elegido por el usuario (`nivel → plan → módulo del mes vigente → sesiones de la semana actual`), de forma aditiva y sin romper ningún programa existente.

**Architecture:** Un programa (course) puede declarar `level_plans` (mapa nivel→planId) y `levels`. El usuario guarda su nivel en `users.courses[courseId].level`. La lectura de workout, cuando el course tiene `level_plans`, lee el contenido desde `plans/{planId}` (reusando la indirección que ya usa one_on_one) eligiendo el módulo por `current_block_index` (cron mensual existente) y las sesiones por `weekIndex == weekInBlock` (computado, sin cron nuevo). Toda la lógica nueva pura vive en `functions/src/api/services/levelResolution.ts` con tests vitest; el wiring en los handlers es mínimo.

**Tech Stack:** Firebase Functions (TypeScript, Node 22), Express routes en `functions/src/api/routes/`, vitest, eslint, tsc.

---

## Hoja de ruta (esta feature = 4 planes secuenciados, cada uno entrega software funcional)

- **Plan 1 — Backend (este doc):** esquema + resolución de lectura + endpoint de nivel + enrollment + cron + allowlists de creador.
- **Plan 2 — Plataforma de creadores:** config "Planificaciones por nivel" en el shell + selector `weekIndex` en el editor de sesión de plan.
- **Plan 3 — PWA:** modal de nivel en Hoy (primer ingreso) + etiqueta/dropdown en el reverso del Hoy card + clave de cache con nivel.
- **Plan 4 — Contenido/seed:** crear shell ABS + 3 planes (12 meses) + librería base + seed del año.

Spec de referencia: [docs/superpowers/specs/2026-06-09-codigo-abs-niveles-design.md](../specs/2026-06-09-codigo-abs-niveles-design.md).

**Verificación global del Plan 1** (correr desde la raíz del repo):
- Tests: `npm --prefix functions run test`
- Tipos: `npm --prefix functions run build`
- Lint: `npm --prefix functions run lint`

> `wolf-20b8b` es PRODUCCIÓN. Ningún `firebase deploy` en este plan sin confirmación explícita del usuario.

---

## Contrato de esquema (aditivo — referencia para todas las tareas)

```
courses/{courseId}:
  levels?:      { options: string[], default: string }        // ej: { options:["principiante","intermedio","avanzado"], default:"principiante" }
  level_plans?: { [levelKey: string]: string }                // levelKey -> planId

users/{uid}.courses[courseId]:
  level?: string                                              // ausente => usar course.levels.default

plans/{planId}/modules/{moduleId}/sessions/{sessionId}:
  weekIndex?: number                                          // 0..4; ausente => sesión se repite toda semana (comportamiento actual)
```

Reglas:
- Course sin `level_plans` => comportamiento idéntico al de hoy (lee de `courses/{id}/modules`).
- Session sin `weekIndex` => no se filtra por semana (idéntico a hoy).
- `level` ausente en el enrollment => el read usa `course.levels.default`.

---

## Task 1: Helpers puros de resolución (`levelResolution.ts`)

**Files:**
- Create: `functions/src/api/services/levelResolution.ts`
- Test: `functions/src/api/services/levelResolution.test.ts`

- [ ] **Step 1: Escribir los tests que fallan**

```typescript
// functions/src/api/services/levelResolution.test.ts
import { describe, it, expect } from "vitest";
import {
  resolveUserLevel,
  resolveLevelPlanId,
  computeWeekInBlock,
  sessionMatchesWeek,
} from "./levelResolution";

describe("resolveUserLevel", () => {
  const course = { levels: { options: ["principiante", "intermedio", "avanzado"], default: "principiante" } };
  it("returns the entry level when present and valid", () => {
    expect(resolveUserLevel(course, { level: "avanzado" })).toBe("avanzado");
  });
  it("falls back to course default when entry level is absent", () => {
    expect(resolveUserLevel(course, {})).toBe("principiante");
  });
  it("falls back to default when entry level is not a valid option", () => {
    expect(resolveUserLevel(course, { level: "elite" })).toBe("principiante");
  });
  it("returns null when course has no levels", () => {
    expect(resolveUserLevel({}, { level: "avanzado" })).toBeNull();
  });
});

describe("resolveLevelPlanId", () => {
  const course = {
    levels: { options: ["principiante", "avanzado"], default: "principiante" },
    level_plans: { principiante: "planP", avanzado: "planA" },
  };
  it("maps the resolved level to its plan id", () => {
    expect(resolveLevelPlanId(course, { level: "avanzado" })).toBe("planA");
  });
  it("uses the default level's plan when entry level absent", () => {
    expect(resolveLevelPlanId(course, {})).toBe("planP");
  });
  it("returns null when course has no level_plans", () => {
    expect(resolveLevelPlanId({ levels: course.levels }, { level: "avanzado" })).toBeNull();
  });
});

describe("computeWeekInBlock", () => {
  const day = 24 * 60 * 60 * 1000;
  const start = Date.parse("2026-06-01T05:00:00Z");
  it("returns 0 during the first 7 days", () => {
    expect(computeWeekInBlock(start, start + 3 * day, 3)).toBe(0);
  });
  it("returns 1 in the second week", () => {
    expect(computeWeekInBlock(start, start + 9 * day, 3)).toBe(1);
  });
  it("clamps to maxWeekIndex", () => {
    expect(computeWeekInBlock(start, start + 60 * day, 3)).toBe(3);
  });
  it("never goes negative if now < start", () => {
    expect(computeWeekInBlock(start, start - 5 * day, 3)).toBe(0);
  });
  it("returns 0 when startedAt is null", () => {
    expect(computeWeekInBlock(null, start + 30 * day, 3)).toBe(0);
  });
});

describe("sessionMatchesWeek", () => {
  it("matches when weekIndex equals weekInBlock", () => {
    expect(sessionMatchesWeek({ weekIndex: 2 }, 2)).toBe(true);
  });
  it("does not match a different weekIndex", () => {
    expect(sessionMatchesWeek({ weekIndex: 1 }, 2)).toBe(false);
  });
  it("matches any week when weekIndex is absent (legacy)", () => {
    expect(sessionMatchesWeek({}, 2)).toBe(true);
    expect(sessionMatchesWeek({ weekIndex: null }, 0)).toBe(true);
  });
});
```

- [ ] **Step 2: Correr los tests para verificar que fallan**

Run: `npm --prefix functions run test -- levelResolution`
Expected: FAIL ("Cannot find module './levelResolution'").

- [ ] **Step 3: Implementar el módulo**

```typescript
// functions/src/api/services/levelResolution.ts
// Pure helpers for shell->plan level resolution. No Firestore I/O here so they
// are unit-testable. All consumers (workout read, cron) call into these.

export interface CourseLevels {
  options: string[];
  default: string;
}

interface CourseLike {
  levels?: CourseLevels;
  level_plans?: Record<string, string>;
}

interface EntryLike {
  level?: string | null;
}

/**
 * Resolve the effective level for a user on a course.
 * - entry.level wins if it is a valid option
 * - otherwise course.levels.default
 * - null when the course declares no levels (not a leveled program)
 */
export function resolveUserLevel(
  course: CourseLike,
  entry: EntryLike | null | undefined
): string | null {
  const levels = course.levels;
  if (!levels || !Array.isArray(levels.options) || levels.options.length === 0) {
    return null;
  }
  const chosen = entry?.level;
  if (typeof chosen === "string" && levels.options.includes(chosen)) {
    return chosen;
  }
  return levels.default;
}

/** Map the resolved level to its planId. null when the course has no level_plans. */
export function resolveLevelPlanId(
  course: CourseLike,
  entry: EntryLike | null | undefined
): string | null {
  const level = resolveUserLevel(course, entry);
  if (!level) return null;
  const map = course.level_plans;
  if (!map || typeof map !== "object") return null;
  return map[level] ?? null;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Cohort-synced current week within the live block.
 * weekInBlock = clamp(floor((now - startedAt)/7d), 0, maxWeekIndex)
 */
export function computeWeekInBlock(
  startedAtMs: number | null,
  nowMs: number,
  maxWeekIndex: number
): number {
  if (startedAtMs === null || !Number.isFinite(startedAtMs)) return 0;
  const raw = Math.floor((nowMs - startedAtMs) / WEEK_MS);
  if (raw < 0) return 0;
  if (raw > maxWeekIndex) return maxWeekIndex;
  return raw;
}

/** A session belongs to the current week if its weekIndex matches, or if it has none (legacy). */
export function sessionMatchesWeek(
  session: { weekIndex?: number | null },
  weekInBlock: number
): boolean {
  const wi = session.weekIndex;
  if (wi === undefined || wi === null) return true;
  return wi === weekInBlock;
}
```

- [ ] **Step 4: Correr los tests para verificar que pasan**

Run: `npm --prefix functions run test -- levelResolution`
Expected: PASS (todos los `describe`).

- [ ] **Step 5: Commit**

```bash
git add functions/src/api/services/levelResolution.ts functions/src/api/services/levelResolution.test.ts
git commit -m "feat(abs): pure helpers for level->plan->week resolution"
```

---

## Task 2: Resolver `maxWeekIndex` de un módulo de plan (helper I/O fino + test)

El read necesita saber el `weekIndex` máximo de las sesiones del módulo vigente para clampear. Lo extraemos como helper puro sobre la lista de sesiones ya leídas.

**Files:**
- Modify: `functions/src/api/services/levelResolution.ts`
- Modify: `functions/src/api/services/levelResolution.test.ts`

- [ ] **Step 1: Añadir el test que falla**

```typescript
// append to levelResolution.test.ts
import { maxWeekIndexOf } from "./levelResolution";

describe("maxWeekIndexOf", () => {
  it("returns the highest weekIndex present", () => {
    expect(maxWeekIndexOf([{ weekIndex: 0 }, { weekIndex: 3 }, { weekIndex: 1 }])).toBe(3);
  });
  it("returns 0 when no session has a weekIndex (legacy)", () => {
    expect(maxWeekIndexOf([{}, { weekIndex: null }])).toBe(0);
  });
  it("returns 0 for empty input", () => {
    expect(maxWeekIndexOf([])).toBe(0);
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npm --prefix functions run test -- levelResolution`
Expected: FAIL ("maxWeekIndexOf is not a function").

- [ ] **Step 3: Implementar**

```typescript
// append to levelResolution.ts
/** Highest weekIndex among sessions; 0 when none declare one. */
export function maxWeekIndexOf(sessions: Array<{ weekIndex?: number | null }>): number {
  let max = 0;
  for (const s of sessions) {
    if (typeof s.weekIndex === "number" && s.weekIndex > max) max = s.weekIndex;
  }
  return max;
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `npm --prefix functions run test -- levelResolution`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add functions/src/api/services/levelResolution.ts functions/src/api/services/levelResolution.test.ts
git commit -m "feat(abs): maxWeekIndexOf helper"
```

---

## Task 3: Rama de lectura para `general + level_plans` en `GET /workout/daily`

Hoy el handler ([functions/src/api/routes/workout.ts](../../../functions/src/api/routes/workout.ts) ~277) ramifica por `deliveryType`: `one_on_one` (~323), un bloque `else` "legacy low-ticket / general" (~690) que lee de `courses/{id}/modules`. Añadimos: **antes** del bloque `else` general, una rama para cuando `course.level_plans` existe, que lee de `plans/{planId}` el módulo cuyo `order == current_block_index` y filtra sesiones por `weekIndex == weekInBlock`.

**Files:**
- Modify: `functions/src/api/routes/workout.ts` (handler `GET /workout/daily`, ~688)

- [ ] **Step 1: Leer el contexto del handler**

Abre `functions/src/api/routes/workout.ts` y lee de la línea 277 a la 900. Identifica: la variable `course`, `courseAccess` (el entry del usuario, = `courses[courseId]`), `MAX_SESSIONS_PER_MODULE`, `toLocalDateISO`, y el bloque `else` que empieza en `// ── Legacy low-ticket / general: resolve from course modules structure ──` (~690). La rama nueva va como `else if` ANTES de ese `else`.

- [ ] **Step 2: Importar los helpers**

Cerca del tope de `workout.ts`, junto a los otros imports de `../services/...`, añade:

```typescript
import {
  resolveLevelPlanId,
  computeWeekInBlock,
  sessionMatchesWeek,
  maxWeekIndexOf,
} from "../services/levelResolution";
```

- [ ] **Step 3: Insertar la rama `general + level_plans`**

Reemplaza la línea `} else {` que abre el bloque legacy (~689) por `} else if (resolveLevelPlanId(course, courseAccess)) {` + el cuerpo siguiente, y deja el `} else {` legacy a continuación intacto:

```typescript
    } else if (resolveLevelPlanId(course, courseAccess)) {
      // ── General shell with per-level plans (Código ABS) ──
      // nivel -> plan -> módulo (mes vigente por current_block_index) -> sesiones (semana actual)
      const planId = resolveLevelPlanId(course, courseAccess)!;
      const currentBlockIndex = typeof course.current_block_index === "number" ?
        course.current_block_index : null;

      if (currentBlockIndex === null) {
        res.json({ data: { hasSession: false, isRestDay: false,
          emptyReason: "no_planning_this_week", session: null,
          progress: { completed: 0, total: null }, allSessions: [] } });
        return;
      }

      // Find the live month-module of this plan: order === currentBlockIndex
      const liveModSnap = await db.collection("plans").doc(planId)
        .collection("modules").where("order", "==", currentBlockIndex).limit(1).get();
      if (liveModSnap.empty) {
        res.json({ data: { hasSession: false, isRestDay: false,
          emptyReason: "no_planning_this_week", session: null,
          progress: { completed: 0, total: null }, allSessions: [] } });
        return;
      }
      const liveMod = liveModSnap.docs[0];
      const liveModuleId = liveMod.id;
      const liveModuleTitle = (liveMod.data().title as string) ?? "";

      // current_block_started_at lives in program_state; used for weekInBlock
      const stateSnap = await db.collection("program_state").doc(courseId).get();
      const startedRaw = stateSnap.exists ? stateSnap.data()?.current_block_started_at : null;
      const startedAtMs = startedRaw && typeof startedRaw.toMillis === "function" ?
        startedRaw.toMillis() : null;

      const sessionsSnap = await db.collection("plans").doc(planId)
        .collection("modules").doc(liveModuleId)
        .collection("sessions").orderBy("order", "asc")
        .limit(MAX_SESSIONS_PER_MODULE).get();

      const allModSessions = sessionsSnap.docs.map((sess) => ({
        moduleId: liveModuleId,
        sessionId: sess.id,
        order: sess.data().order ?? 0,
        moduleOrder: currentBlockIndex,
        title: (sess.data().title as string) ?? "",
        moduleTitle: liveModuleTitle,
        image_url: (sess.data().image_url as string) ?? null,
        dayIndex: typeof sess.data().dayIndex === "number" ? (sess.data().dayIndex as number) : null,
        weekIndex: typeof sess.data().weekIndex === "number" ? (sess.data().weekIndex as number) : null,
      }));

      // Filter to the current cohort week, then behave like the weekly path below.
      const maxWeek = maxWeekIndexOf(allModSessions);
      const weekInBlock = computeWeekInBlock(startedAtMs, Date.now(), maxWeek);
      const weekSessions = allModSessions.filter((s) => sessionMatchesWeek(s, weekInBlock));

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayWeekdayIdx = ((today.getDay() + 6) % 7) + 1; // 1..7 Lun..Dom
      const weekStart = new Date(today);
      weekStart.setDate(today.getDate() - (todayWeekdayIdx - 1));

      // Completions scoped to this calendar week (same reasoning as weekly path)
      const weekStartIso = weekStart.toISOString();
      const weekCompletedSnap = await db.collection("users").doc(auth.userId)
        .collection("sessionHistory")
        .where("courseId", "==", courseId)
        .where("completedAt", ">=", weekStartIso).get();
      completedSessionIds = new Set(
        weekCompletedSnap.docs.map((d) => d.data().sessionId as string | undefined)
          .filter((id): id is string => typeof id === "string" && id.length > 0)
      );

      // Content for plan sessions lives under plans/, not courses/
      sessionCollection = "plans";
      sessionCollectionId = planId;

      const sessionsWithDate = weekSessions.map((s) => {
        const dayIdx = s.dayIndex ?? (s.order ?? 0) + 1;
        const date = new Date(weekStart.getTime() + (dayIdx - 1) * 86400000);
        return { ...s, dayIndex: dayIdx, plannedDate: toLocalDateISO(date) };
      });
      sessionsWithDate.sort((a, b) => a.dayIndex - b.dayIndex);
      resolvedAllSessions = sessionsWithDate.map((s) => ({
        sessionId: s.sessionId, title: s.title, moduleId: s.moduleId,
        moduleTitle: s.moduleTitle, order: s.order, image_url: s.image_url,
        plannedDate: s.plannedDate,
      }));

      // Pick today's target session (matches how the weekly path selects below)
      const todayIso = toLocalDateISO(today);
      const todaysSession = sessionsWithDate.find((s) => s.plannedDate === todayIso) ?? null;
      targetModuleId = todaysSession ? todaysSession.moduleId : null;
      targetSessionId = requestedSessionId ?? (todaysSession ? todaysSession.sessionId : null);
    } else {
      // ── Legacy low-ticket / general: resolve from course modules structure ──
```

> Nota para el ejecutor: confirma cómo el bloque weekly existente (~801–880) setea `targetModuleId`/`targetSessionId` y el shape final de `resolvedAllSessions`, y alinea el snippet de arriba con esa convención (nombres de campos, `sessionCollection`/`sessionCollectionId`, y cómo se elige `targetSessionId` por `plannedDate === today`). El objetivo: que el resto del handler (lectura de ejercicios desde `sessionCollection/sessionCollectionId/.../sessions/{targetSessionId}`) funcione sin más cambios.

- [ ] **Step 4: Verificar tipos y lint**

Run: `npm --prefix functions run build`
Expected: compila sin errores de tipo.
Run: `npm --prefix functions run lint`
Expected: sin errores nuevos.

- [ ] **Step 5: Commit**

```bash
git add functions/src/api/routes/workout.ts
git commit -m "feat(abs): /workout/daily resolves content via level->plan->week"
```

---

## Task 4: Misma resolución en `GET /workout/session-exercises`

Este endpoint ([workout.ts](../../../functions/src/api/routes/workout.ts) ~1221) lee los ejercicios de una sesión concreta. Para programas con `level_plans` debe leer desde `plans/{planId}/modules/{moduleId}/sessions/{sessionId}` (no `courses/`).

**Files:**
- Modify: `functions/src/api/routes/workout.ts` (handler `GET /workout/session-exercises`, ~1221–1453)

- [ ] **Step 1: Leer el handler 1221–1453** y localizar dónde decide la colección base (`courses` vs `plans`) para leer la sesión + ejercicios. Hoy usa `courses/{courseId}/modules/{moduleId}/sessions/{sessionId}` salvo en one_on_one.

- [ ] **Step 2: Insertar la resolución por nivel**

Cerca del inicio del handler, después de cargar `course` y el entry del usuario (`courseAccess`/`courses[courseId]`), añade:

```typescript
const levelPlanId = resolveLevelPlanId(course, courses[courseId]);
// When set, read session/exercises from plans/{levelPlanId} instead of courses/{courseId}
const sessionBaseCollection = levelPlanId ? "plans" : "courses";
const sessionBaseId = levelPlanId ?? courseId;
```

Luego reemplaza las referencias `db.collection("courses").doc(courseId)` usadas para leer la sesión/ejercicios por `db.collection(sessionBaseCollection).doc(sessionBaseId)`. (El `moduleId` viene en query/params; el cliente lo obtiene de `/workout/daily`, que ya devuelve el `moduleId` del plan.)

- [ ] **Step 3: Build + lint**

Run: `npm --prefix functions run build && npm --prefix functions run lint`
Expected: compila y sin errores nuevos.

- [ ] **Step 4: Commit**

```bash
git add functions/src/api/routes/workout.ts
git commit -m "feat(abs): /workout/session-exercises reads plan content for leveled courses"
```

---

## Task 5: `current-block` + `programs/:courseId/modules` resuelven el plan

Las vistas de estructura/semana ([workout.ts](../../../functions/src/api/routes/workout.ts): `/current-block` ~2921, `/programs/:courseId/modules` ~2758) deben, para cursos con `level_plans`, listar los módulos/semana desde el plan del nivel del usuario en vez de `courses/{id}/modules`.

**Files:**
- Modify: `functions/src/api/routes/workout.ts` (~2758–3072)

- [ ] **Step 1: Leer ambos handlers (2758–3072).**

- [ ] **Step 2: En `/programs/:courseId/modules`**, después de cargar `course` y el entry del usuario, resolver:

```typescript
const levelPlanId = resolveLevelPlanId(course, (userCourses ?? {})[courseId]);
const modulesBase = levelPlanId
  ? db.collection("plans").doc(levelPlanId).collection("modules")
  : db.collection("courses").doc(courseId).collection("modules");
```
y usar `modulesBase` donde hoy se itera `courses/{id}/modules`. El filtro de cadencia (`order <= current_block_index`) se mantiene igual.

- [ ] **Step 3: En `/current-block`**, el `current_block_id/index` del shell sigue siendo la fuente del mes vigente; si necesita el título del módulo, leerlo desde `plans/{levelPlanId}/modules` (order==index) cuando haya `level_plans`.

- [ ] **Step 4: Build + lint**

Run: `npm --prefix functions run build && npm --prefix functions run lint`
Expected: ok.

- [ ] **Step 5: Commit**

```bash
git add functions/src/api/routes/workout.ts
git commit -m "feat(abs): structure endpoints resolve modules from level plan"
```

---

## Task 6: Endpoint `PATCH /users/me/courses/:courseId/level`

**Files:**
- Modify: `functions/src/api/routes/profile.ts`
- Test: `functions/src/api/services/levelResolution.test.ts` (añadir validación pura) — o crear `functions/src/api/routes/profile.level.test.ts` si el handler se extrae a un helper puro.

- [ ] **Step 1: Test del validador puro**

Extraemos la validación a `levelResolution.ts` para testearla. Añade a `levelResolution.test.ts`:

```typescript
import { isValidLevelChoice } from "./levelResolution";

describe("isValidLevelChoice", () => {
  const course = { levels: { options: ["principiante", "avanzado"], default: "principiante" } };
  it("accepts a declared option", () => {
    expect(isValidLevelChoice(course, "avanzado")).toBe(true);
  });
  it("rejects an undeclared option", () => {
    expect(isValidLevelChoice(course, "elite")).toBe(false);
  });
  it("rejects when the course has no levels", () => {
    expect(isValidLevelChoice({}, "avanzado")).toBe(false);
  });
});
```

- [ ] **Step 2: Verificar que falla**

Run: `npm --prefix functions run test -- levelResolution`
Expected: FAIL ("isValidLevelChoice is not a function").

- [ ] **Step 3: Implementar el validador**

```typescript
// append to levelResolution.ts
export function isValidLevelChoice(course: CourseLike, level: string): boolean {
  const opts = course.levels?.options;
  return Array.isArray(opts) && opts.includes(level);
}
```

- [ ] **Step 4: Verificar que pasa**

Run: `npm --prefix functions run test -- levelResolution`
Expected: PASS.

- [ ] **Step 5: Añadir la ruta en `profile.ts`**

Junto a las otras rutas `/users/me/...`, añade (ajustando imports `db`, `validateAuth`, `WakeApiServerError`, `admin`/`FieldValue` según el patrón del archivo):

```typescript
router.patch("/users/me/courses/:courseId/level", async (req, res) => {
  const auth = await validateAuth(req);
  const { courseId } = req.params;
  const level = (req.body?.level ?? "") as string;

  const [userSnap, courseSnap] = await Promise.all([
    db.collection("users").doc(auth.userId).get(),
    db.collection("courses").doc(courseId).get(),
  ]);
  if (!courseSnap.exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Programa no encontrado");
  }
  const entry = (userSnap.data()?.courses ?? {})[courseId];
  if (!entry) {
    throw new WakeApiServerError("FORBIDDEN", 403, "No tienes acceso a este programa");
  }
  if (!isValidLevelChoice(courseSnap.data()!, level)) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "Nivel inválido", "level");
  }
  await db.collection("users").doc(auth.userId).update({
    [`courses.${courseId}.level`]: level,
  });
  res.status(200).json({ data: { courseId, level } });
});
```

- [ ] **Step 6: Build + lint**

Run: `npm --prefix functions run build && npm --prefix functions run lint`
Expected: ok.

- [ ] **Step 7: Commit**

```bash
git add functions/src/api/routes/profile.ts functions/src/api/services/levelResolution.ts functions/src/api/services/levelResolution.test.ts
git commit -m "feat(abs): PATCH /users/me/courses/:courseId/level"
```

---

## Task 7: Enrollment preserva `level` en renovación (no lo setea en compra)

**Files:**
- Modify: `functions/src/api/services/courseAssignment.ts` (`buildCourseEntry`, ~91–134)

- [ ] **Step 1: Leer `buildCourseEntry`** (~91–134). Hay dos ramas: nueva compra y renovación (preserva `purchased_at` + `completedTutorials` del entry existente).

- [ ] **Step 2: En la rama de RENOVACIÓN**, preservar también `level` si existía:

```typescript
// dentro de la rama de renovación, junto a purchased_at/completedTutorials:
...(existing.level !== undefined ? { level: existing.level } : {}),
```

No agregar `level` en la rama de nueva compra (debe quedar ausente para que el modal de primer ingreso se dispare).

- [ ] **Step 3: Build + lint**

Run: `npm --prefix functions run build && npm --prefix functions run lint`
Expected: ok.

- [ ] **Step 4: Commit**

```bash
git add functions/src/api/services/courseAssignment.ts
git commit -m "feat(abs): preserve user level across subscription renewal"
```

---

## Task 8: Cron gatea el avance sobre los planes de nivel

`advanceMonthlyDropCourse` ([index.ts](../../../functions/src/index.ts) ~2704–2843) hoy busca el siguiente módulo publicado en `courses/{id}/modules`. Para cursos con `level_plans`, el contenido del mes vive en los planes; el cron debe avanzar al índice `current+1` solo si **los 3 planes** tienen ese mes (`order == current+1`) con `published_at != null`.

**Files:**
- Modify: `functions/src/index.ts` (`advanceMonthlyDropCourse`, ~2704–2843)
- Test: `functions/src/api/services/levelResolution.test.ts` (lógica pura del gate)

- [ ] **Step 1: Test del gate puro**

Añade a `levelResolution.test.ts`:

```typescript
import { allLevelPlansPublishAt } from "./levelResolution";

describe("allLevelPlansPublishAt", () => {
  it("true only when every level plan has the index published", () => {
    const perPlan = { principiante: true, avanzado: true };
    expect(allLevelPlansPublishAt(perPlan)).toBe(true);
  });
  it("false when any level plan is missing/unpublished at the index", () => {
    expect(allLevelPlansPublishAt({ principiante: true, avanzado: false })).toBe(false);
  });
  it("false for empty input", () => {
    expect(allLevelPlansPublishAt({})).toBe(false);
  });
});
```

- [ ] **Step 2: Verificar que falla**

Run: `npm --prefix functions run test -- levelResolution`
Expected: FAIL.

- [ ] **Step 3: Implementar el gate puro**

```typescript
// append to levelResolution.ts
/** True only if every level plan reports a published next-block. */
export function allLevelPlansPublishAt(perPlanPublished: Record<string, boolean>): boolean {
  const vals = Object.values(perPlanPublished);
  if (vals.length === 0) return false;
  return vals.every(Boolean);
}
```

- [ ] **Step 4: Verificar que pasa**

Run: `npm --prefix functions run test -- levelResolution`
Expected: PASS.

- [ ] **Step 5: Ramificar el cron**

En `advanceMonthlyDropCourse`, antes de la consulta a `courseRef.collection("modules")`, detectar `level_plans` en el course doc. Si existe, calcular `nextIndex = currentBlockIndex + 1` y para cada `planId` de `level_plans`, leer `plans/{planId}/modules` donde `order == nextIndex` y verificar `published_at != null`; construir `perPlanPublished` y avanzar solo si `allLevelPlansPublishAt(perPlanPublished)`. El resto (escribir `program_state` + `course.current_block_index/id`, idempotencia por `current_block_started_at`) se mantiene igual. `current_block_id` para cursos con `level_plans` puede setearse al moduleId del plan default en ese índice (solo informativo; el read usa el índice).

- [ ] **Step 6: Build + lint**

Run: `npm --prefix functions run build && npm --prefix functions run lint`
Expected: ok.

- [ ] **Step 7: Commit**

```bash
git add functions/src/index.ts functions/src/api/services/levelResolution.ts functions/src/api/services/levelResolution.test.ts
git commit -m "feat(abs): monthly cron gates advance on all level plans published"
```

---

## Task 9: Allowlists de creador (`level_plans`, `levels`, `weekIndex`)

**Files:**
- Modify: `functions/src/api/routes/creator.ts`

- [ ] **Step 1: Localizar la allowlist de `PATCH /creator/programs/:programId`** (campos editables del course-shell) y añadir `"level_plans"` y `"levels"`. Si esa allowlist no existe explícita, añadirla validando que `level_plans` sea `Record<string,string>` y `levels` tenga `{options:string[], default:string}`.

- [ ] **Step 2: Localizar las allowlists de sesión de plan** — `POST /creator/plans/:planId/modules/:moduleId/sessions` (~5083) y su `PATCH` (~5275) — y añadir `"weekIndex"` a los campos permitidos (validar `number` entero ≥ 0).

- [ ] **Step 3: Build + lint**

Run: `npm --prefix functions run build && npm --prefix functions run lint`
Expected: ok.

- [ ] **Step 4: Commit**

```bash
git add functions/src/api/routes/creator.ts
git commit -m "feat(abs): allow level_plans/levels on program and weekIndex on plan sessions"
```

---

## Task 10: Verificación integral del Plan 1

- [ ] **Step 1: Tests**

Run: `npm --prefix functions run test`
Expected: PASS (incluye `levelResolution.test.ts` + los tests existentes de middleware).

- [ ] **Step 2: Tipos**

Run: `npm --prefix functions run build`
Expected: compila limpio.

- [ ] **Step 3: Lint**

Run: `npm --prefix functions run lint`
Expected: sin errores nuevos.

- [ ] **Step 4: Smoke manual (sin deploy)**

Con un course de prueba que tenga `level_plans` + 3 planes mínimos + `program_state.current_block_index = 0` + sesiones con `weekIndex`, verificar (emulador o staging, NO prod) que `GET /workout/daily?courseId=...` devuelve la sesión del plan correcto según `users.courses[courseId].level`, y que cambiar `level` vía `PATCH .../level` cambia el contenido servido. Documentar el resultado.

- [ ] **Step 5: Confirmar antes de cualquier deploy**

No correr `firebase deploy --only functions` sin go explícito del usuario (`wolf-20b8b` es prod).

---

## Self-review (cobertura del spec — Plan 1)

- Pilar 1 (level_plans/levels/level): Tasks 1, 6, 7, 9 ✓
- Pilar 2 (cadencia sobre planes): Task 8 ✓ (lectura por índice en Task 3)
- Pilar 3 (weekIndex): Tasks 1, 2, 3, 9 ✓
- Read resolution en todos los endpoints: Tasks 3 (daily), 4 (session-exercises), 5 (current-block + modules) ✓
- Aditividad (sin level_plans/weekIndex == comportamiento actual): garantizado por los fallbacks de `resolveLevelPlanId`/`sessionMatchesWeek` ✓
- Fuera de Plan 1 (van en Planes 2–4): UI de creador, UI de PWA, seed del contenido.
