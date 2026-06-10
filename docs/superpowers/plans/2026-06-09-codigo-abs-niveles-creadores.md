# Código ABS — Niveles: Plan 2 — Plataforma de creadores

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Que un creador pueda (a) mapear cada nivel del programa a un plan existente (`level_plans` + `levels`) desde la vista del programa-shell, y (b) marcar el `weekIndex` de cada sesión de plan en el editor.

**Architecture:** Reusa el editor de planes existente (`/plans/...`, `plansService`) sin tocarlo. Añade una sección de configuración "Planificaciones por nivel" en la vista del programa (`GroupProgramView.jsx`) que escribe `levels` + `level_plans` vía `PATCH /creator/programs/:programId` (allowlist habilitada en Plan 1, Task 9). Añade un control `weekIndex` en el editor de sesión de plan. La lógica pura (normalización del mapeo nivel→plan) se testea con vitest; el wiring visual se verifica con build/lint/manual (el repo no tiene tests de render de componentes).

**Tech Stack:** Vite + React 18 (JSX), `@tanstack/react-query` v5, vitest, eslint. Prereq: Plan 1 desplegado o en la misma rama (la API ya acepta `level_plans`/`levels`/`weekIndex`).

**Diseño:** seguir `feedback_creator_dashboard_design` (Hick's Law, baja carga cognitiva, copy con onda, mejor manejo de errores) y `docs/STANDARDS.md`.

**Verificación global:** `npm --prefix apps/creator-dashboard run test` · `npm run build:creator` · `npm --prefix apps/creator-dashboard run lint`.

---

## Task 1: Helper puro de normalización del mapeo nivel→plan

**Files:**
- Create: `apps/creator-dashboard/src/utils/levelPlans.js`
- Test: `apps/creator-dashboard/src/utils/levelPlans.test.js`

- [ ] **Step 1: Test que falla**

```javascript
// levelPlans.test.js
import { describe, it, expect } from 'vitest';
import { buildLevelConfig, isLevelConfigComplete } from './levelPlans';

describe('buildLevelConfig', () => {
  it('builds { levels, level_plans } from a mapping', () => {
    const out = buildLevelConfig(
      ['principiante', 'intermedio', 'avanzado'],
      'principiante',
      { principiante: 'p1', intermedio: 'p2', avanzado: 'p3' }
    );
    expect(out).toEqual({
      levels: { options: ['principiante', 'intermedio', 'avanzado'], default: 'principiante' },
      level_plans: { principiante: 'p1', intermedio: 'p2', avanzado: 'p3' },
    });
  });
  it('omits levels with no plan selected', () => {
    const out = buildLevelConfig(['principiante', 'avanzado'], 'principiante', { principiante: 'p1', avanzado: '' });
    expect(out.level_plans).toEqual({ principiante: 'p1' });
  });
});

describe('isLevelConfigComplete', () => {
  it('true when every option maps to a plan', () => {
    expect(isLevelConfigComplete(['a', 'b'], { a: 'p1', b: 'p2' })).toBe(true);
  });
  it('false when an option is unmapped', () => {
    expect(isLevelConfigComplete(['a', 'b'], { a: 'p1', b: '' })).toBe(false);
  });
});
```

- [ ] **Step 2: Verificar que falla**

Run: `npm --prefix apps/creator-dashboard run test -- levelPlans`
Expected: FAIL (módulo no existe).

- [ ] **Step 3: Implementar**

```javascript
// apps/creator-dashboard/src/utils/levelPlans.js
export function buildLevelConfig(options, defaultLevel, mapping) {
  const level_plans = {};
  for (const opt of options) {
    const planId = mapping?.[opt];
    if (planId) level_plans[opt] = planId;
  }
  return { levels: { options, default: defaultLevel }, level_plans };
}

export function isLevelConfigComplete(options, mapping) {
  return options.length > 0 && options.every((o) => !!mapping?.[o]);
}
```

- [ ] **Step 4: Verificar que pasa**

Run: `npm --prefix apps/creator-dashboard run test -- levelPlans`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/creator-dashboard/src/utils/levelPlans.js apps/creator-dashboard/src/utils/levelPlans.test.js
git commit -m "feat(abs-creator): level-plan config helpers"
```

---

## Task 2: Método de servicio para guardar la config de niveles

**Files:**
- Modify: `apps/creator-dashboard/src/services/programService.js`

- [ ] **Step 1: Localizar `programService`** y confirmar el patrón de `apiClient.patch`. Añadir:

```javascript
// programService.js
async setLevelConfig(programId, { levels, level_plans }) {
  const res = await apiClient.patch(`/creator/programs/${programId}`, { levels, level_plans });
  return res.data;
}
```

> Si ya existe un `updateProgram(programId, updates)` genérico, usar ese en el componente en vez de añadir método. Confirmar y preferir reuso (DRY).

- [ ] **Step 2: Lint**

Run: `npm --prefix apps/creator-dashboard run lint`
Expected: ok.

- [ ] **Step 3: Commit**

```bash
git add apps/creator-dashboard/src/services/programService.js
git commit -m "feat(abs-creator): programService.setLevelConfig"
```

---

## Task 3: Componente `LevelPlansConfig` + montaje en `GroupProgramView`

**Files:**
- Create: `apps/creator-dashboard/src/components/program/LevelPlansConfig.jsx`
- Modify: `apps/creator-dashboard/src/components/program/GroupProgramView.jsx`

- [ ] **Step 1: Leer `GroupProgramView.jsx`** y localizar dónde vive el toggle de `block_cadence` / la sección de settings del programa. La nueva sección "Planificaciones por nivel" va junto a esa.

- [ ] **Step 2: Crear `LevelPlansConfig.jsx`**

Comportamiento:
- Toggle "Este programa tiene niveles" (si off → no escribe `levels`/`level_plans`; el programa se comporta como hoy).
- Si on: lista fija de opciones `['principiante','intermedio','avanzado']`, un selector de "nivel por defecto", y por cada opción un `<select>` que lista los planes del creador (obtenidos con React Query vía `plansService.list()` — confirmar el método de listado; el agente vio `GET /creator/plans`).
- Botón "Guardar" deshabilitado hasta `isLevelConfigComplete`; al guardar llama `programService.setLevelConfig(programId, buildLevelConfig(options, default, mapping))` dentro de un `useMutation`, con toast de éxito/error (mejor manejo de errores).

```jsx
// LevelPlansConfig.jsx (esqueleto — completar estilos según STANDARDS.md)
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import programService from '../../services/programService';
import plansService from '../../services/plansService';
import { buildLevelConfig, isLevelConfigComplete } from '../../utils/levelPlans';

const OPTIONS = ['principiante', 'intermedio', 'avanzado'];

export default function LevelPlansConfig({ programId, initial }) {
  const qc = useQueryClient();
  const [enabled, setEnabled] = useState(!!initial?.levels);
  const [def, setDef] = useState(initial?.levels?.default ?? 'principiante');
  const [mapping, setMapping] = useState(initial?.level_plans ?? {});

  const { data: plans = [] } = useQuery({
    queryKey: ['creator', 'plans'],
    queryFn: () => plansService.list(),
  });

  const save = useMutation({
    mutationFn: () => programService.setLevelConfig(programId, buildLevelConfig(OPTIONS, def, mapping)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['creator', 'program', programId] }),
  });

  if (!enabled) {
    return (
      <button onClick={() => setEnabled(true)}>Activar niveles (planificaciones por nivel)</button>
    );
  }
  return (
    <section>
      <h3>Planificaciones por nivel</h3>
      {OPTIONS.map((opt) => (
        <div key={opt}>
          <label>{opt}</label>
          <select value={mapping[opt] ?? ''} onChange={(e) => setMapping((m) => ({ ...m, [opt]: e.target.value }))}>
            <option value="">— elegir plan —</option>
            {plans.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
        </div>
      ))}
      <label>Nivel por defecto
        <select value={def} onChange={(e) => setDef(e.target.value)}>
          {OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </label>
      <button disabled={!isLevelConfigComplete(OPTIONS, mapping) || save.isPending} onClick={() => save.mutate()}>
        {save.isPending ? 'Guardando…' : 'Guardar'}
      </button>
      {save.isError && <p role="alert">No se pudo guardar. Reintenta.</p>}
    </section>
  );
}
```

> Confirmar el método de listado de planes (`plansService.list()` o equivalente; el endpoint es `GET /creator/plans`) y el shape `{ id, title }`.

- [ ] **Step 3: Montar en `GroupProgramView.jsx`** pasando `programId` y el `initial` desde el course doc ya cargado (`{ levels, level_plans }`).

- [ ] **Step 4: Build + lint**

Run: `npm run build:creator && npm --prefix apps/creator-dashboard run lint`
Expected: compila y sin errores nuevos.

- [ ] **Step 5: Verificación manual (dev server)**

Abrir un programa de prueba, activar niveles, mapear los 3 a planes, guardar; confirmar en la BD (MCP/console) que `courses/{id}.levels` y `.level_plans` quedaron escritos.

- [ ] **Step 6: Commit**

```bash
git add apps/creator-dashboard/src/components/program/LevelPlansConfig.jsx apps/creator-dashboard/src/components/program/GroupProgramView.jsx
git commit -m "feat(abs-creator): level->plan config UI on program shell"
```

---

## Task 4: Selector de `weekIndex` en el editor de sesión de plan

**Files:**
- Modify: `apps/creator-dashboard/src/screens/PlanSessionDetailScreen.jsx`
- Modify: `apps/creator-dashboard/src/services/plansService.js` (solo si no existe `updateSession`)

- [ ] **Step 1: Leer `PlanSessionDetailScreen.jsx`** y localizar el header de la sesión donde se editan `title`/`dayIndex`. El selector `weekIndex` va ahí.

- [ ] **Step 2: Añadir el control**

Un `<select>` "Semana del mes" con opciones 0–4 (etiquetadas "Semana 1".."Semana 5" → value = índice) y una opción "Todas las semanas" (value vacío → no escribe `weekIndex`). Al cambiar, llama:

```javascript
await plansService.updateSession(planId, moduleId, sessionId, {
  weekIndex: value === '' ? null : Number(value),
});
```

> Confirmar la firma real de `plansService.updateSession` (PATCH `/creator/plans/:planId/modules/:moduleId/sessions/:sessionId`). Si no existe, añadirla siguiendo el patrón de los otros métodos del servicio.

- [ ] **Step 3: Build + lint**

Run: `npm run build:creator && npm --prefix apps/creator-dashboard run lint`
Expected: ok.

- [ ] **Step 4: Verificación manual**

En un plan de prueba, marcar `weekIndex` de una sesión; confirmar en BD que `plans/.../sessions/{id}.weekIndex` quedó escrito.

- [ ] **Step 5: Commit**

```bash
git add apps/creator-dashboard/src/screens/PlanSessionDetailScreen.jsx apps/creator-dashboard/src/services/plansService.js
git commit -m "feat(abs-creator): weekIndex selector on plan session editor"
```

---

## Task 5: Verificación integral del Plan 2

- [ ] **Step 1:** `npm --prefix apps/creator-dashboard run test` → PASS.
- [ ] **Step 2:** `npm run build:creator` → compila.
- [ ] **Step 3:** `npm --prefix apps/creator-dashboard run lint` → sin errores nuevos.
- [ ] **Step 4 (manual):** flujo completo — crear/elegir 3 planes, mapearlos a niveles en un programa, marcar `weekIndex` en sus sesiones; confirmar escrituras en BD.

## Self-review (cobertura del spec — Plan 2)
- Sección "Planificaciones por nivel" (mapeo nivel→plan): Tasks 1–3 ✓
- Selector `weekIndex`: Task 4 ✓
- Aditivo (toggle off = comportamiento actual): Task 3 ✓
- Reuso del editor de planes existente: no se toca (✓ por diseño)
