# Código ABS — Niveles: Plan 3 — PWA (experiencia del usuario)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Que el usuario elija su nivel al primer ingreso al programa (modal en Hoy, antes de la primera sesión), vea su nivel en el reverso del Hoy card con un dropdown para cambiarlo, y que el contenido mostrado corresponda a su nivel.

**Architecture:** El servidor ya resuelve el contenido por nivel (Plan 1); la PWA solo (1) detecta si falta elegir nivel y muestra un modal, (2) escribe el nivel vía `PATCH /users/me/courses/:courseId/level`, (3) muestra etiqueta + dropdown en `TodayWorkoutCard.web.jsx`, y (4) incluye el nivel en la clave de cache de `sessionService` para que cambiar de nivel refetchee. Lógica pura (gate del modal, builder de cache key) testeada con jest; el wiring visual se verifica con build/lint/manual (no hay tests de render en el repo).

**Tech Stack:** Expo SDK 54 / React Native Web (JS, `.web.jsx`), React Router v6, React Query, jest, eslint. Prereq: Plan 1 (la API expone `PATCH .../level` y resuelve por nivel). Logging vía `apps/pwa/src/utils/logger.js` (no `console.log`). Strings en español. Sin emojis.

**Verificación global:** `npm --prefix apps/pwa run test` · `npm --prefix apps/pwa run lint`. (Evitar `build:pwa` salvo necesidad: usa cache de Metro y puede mezclar config de entorno — ver `feedback_pwa_build_metro_cache`; si se construye, `--clear` y verificar `wolf-20b8b` en el bundle.)

---

## Task 1: Helper puro del gate del modal de nivel

**Files:**
- Create: `apps/pwa/src/utils/levelGate.js`
- Test: `apps/pwa/src/__tests__/levelGate.test.js`

- [ ] **Step 1: Test que falla**

```javascript
// levelGate.test.js
import { shouldAskLevel, effectiveLevel } from '../utils/levelGate';

describe('shouldAskLevel', () => {
  const course = { levels: { options: ['principiante', 'avanzado'], default: 'principiante' } };
  it('asks when course has levels and entry has no level', () => {
    expect(shouldAskLevel(course, { status: 'active' })).toBe(true);
  });
  it('does not ask once a level is set', () => {
    expect(shouldAskLevel(course, { status: 'active', level: 'avanzado' })).toBe(false);
  });
  it('does not ask for non-leveled courses', () => {
    expect(shouldAskLevel({}, { status: 'active' })).toBe(false);
  });
});

describe('effectiveLevel', () => {
  const course = { levels: { options: ['principiante', 'avanzado'], default: 'principiante' } };
  it('returns the chosen level', () => {
    expect(effectiveLevel(course, { level: 'avanzado' })).toBe('avanzado');
  });
  it('falls back to default', () => {
    expect(effectiveLevel(course, {})).toBe('principiante');
  });
  it('returns null when not leveled', () => {
    expect(effectiveLevel({}, {})).toBeNull();
  });
});
```

- [ ] **Step 2: Verificar que falla**

Run: `npm --prefix apps/pwa run test -- levelGate`
Expected: FAIL.

- [ ] **Step 3: Implementar**

```javascript
// apps/pwa/src/utils/levelGate.js
export function effectiveLevel(course, entry) {
  const opts = course?.levels?.options;
  if (!Array.isArray(opts) || opts.length === 0) return null;
  const chosen = entry?.level;
  if (typeof chosen === 'string' && opts.includes(chosen)) return chosen;
  return course.levels.default;
}

export function shouldAskLevel(course, entry) {
  const opts = course?.levels?.options;
  if (!Array.isArray(opts) || opts.length === 0) return false;
  return !(typeof entry?.level === 'string' && opts.includes(entry.level));
}
```

- [ ] **Step 4: Verificar que pasa**

Run: `npm --prefix apps/pwa run test -- levelGate`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/pwa/src/utils/levelGate.js apps/pwa/src/__tests__/levelGate.test.js
git commit -m "feat(abs-pwa): level gate + effectiveLevel helpers"
```

---

## Task 2: Servicio para setear el nivel del curso

**Files:**
- Create: `apps/pwa/src/services/courseLevelService.js`

- [ ] **Step 1: Implementar** (siguiendo el patrón de otros servicios que usan `apiClient`)

```javascript
// apps/pwa/src/services/courseLevelService.js
import apiClient from './apiClient'; // confirmar la ruta real del cliente HTTP

class CourseLevelService {
  async setLevel(courseId, level) {
    const res = await apiClient.patch(`/users/me/courses/${courseId}/level`, { level });
    return res.data;
  }
}

export default new CourseLevelService();
```

> Confirmar el import real del cliente HTTP (cómo lo importan otros servicios de la PWA).

- [ ] **Step 2: Lint**

Run: `npm --prefix apps/pwa run lint`
Expected: ok.

- [ ] **Step 3: Commit**

```bash
git add apps/pwa/src/services/courseLevelService.js
git commit -m "feat(abs-pwa): courseLevelService.setLevel"
```

---

## Task 3: Modal de selección de nivel + montaje en Hoy

**Files:**
- Create: `apps/pwa/src/components/hoy/LevelPickerModal.web.jsx`
- Modify: `apps/pwa/src/screens/HoyScreen.web.jsx`

- [ ] **Step 1: Leer `HoyScreen.web.jsx`** para entender cómo obtiene el course activo + su entry del usuario (vía `useCoursesEnriched` y el doc de usuario). Identificar dónde montar el modal (encima del carrusel).

- [ ] **Step 2: Crear `LevelPickerModal.web.jsx`**

- Recibe `{ course, courseEntry, visible, onClose }`.
- Muestra título "¿A qué nivel quieres entrenar?" + las opciones de `course.levels.options` como tarjetas (Principiante/Intermedio/Avanzado), con copy claro. Sin emojis. Estética dark cinematic (`docs/STANDARDS.md`): fade + translateY, canvas `#1a1a1a`.
- Al elegir: `useMutation` → `courseLevelService.setLevel(course.id, level)` → al éxito invalida las queries de workout (`['workout','daily',...]`, `['preview','todaySession',...]`) y cierra. Estado de carga + error en español.

- [ ] **Step 3: Montar en `HoyScreen.web.jsx`**

```jsx
import LevelPickerModal from '../components/hoy/LevelPickerModal.web.jsx';
import { shouldAskLevel } from '../utils/levelGate';
// ... dentro del render, para el course activo y su entry:
const askLevel = shouldAskLevel(activeCourse, activeCourseEntry);
// ...
{askLevel && (
  <LevelPickerModal course={activeCourse} courseEntry={activeCourseEntry} visible onClose={() => {}} />
)}
```

El gate se apaga solo cuando el `PATCH` escribe el nivel y el doc de usuario se refetchea (entry.level deja de estar ausente). No permitir cerrar sin elegir en el primer ingreso (es 1 toque, sin fricción).

- [ ] **Step 4: Lint**

Run: `npm --prefix apps/pwa run lint`
Expected: ok.

- [ ] **Step 5: Verificación manual (pwa:dev)**

Con un usuario suscrito a un course con `levels` y sin `level`: al entrar a Hoy aparece el modal; al elegir, desaparece y el card carga el contenido del plan correcto. Usar `?wake_debug=1` para logs.

- [ ] **Step 6: Commit**

```bash
git add apps/pwa/src/components/hoy/LevelPickerModal.web.jsx apps/pwa/src/screens/HoyScreen.web.jsx
git commit -m "feat(abs-pwa): level picker modal on first program entry"
```

---

## Task 4: Etiqueta de nivel + dropdown en el reverso del Hoy card

**Files:**
- Modify: `apps/pwa/src/components/TodayWorkoutCard.web.jsx`

- [ ] **Step 1: Leer `TodayWorkoutCard.web.jsx`** y localizar el reverso del card (el estado "dado la vuelta" donde está "Empezar").

- [ ] **Step 2: Añadir, solo cuando `effectiveLevel(course, courseEntry)` no es null:**
- Una etiqueta del nivel actual (Principiante/Intermedio/Avanzado).
- Un dropdown con `course.levels.options`; al cambiar → `courseLevelService.setLevel(course.id, nuevoNivel)` (vía `useMutation`) → invalidar `['workout','daily',...]` + `['preview','todaySession',...]`. Mantener cohort-sync de la semana (no reinicia `weekInBlock`; eso lo maneja el server). Estado de carga + error en español. Sin emojis.

- [ ] **Step 3: Lint**

Run: `npm --prefix apps/pwa run lint`
Expected: ok.

- [ ] **Step 4: Verificación manual**

Voltear el card; ver la etiqueta; cambiar de nivel desde el dropdown → el contenido del card se actualiza al plan del nuevo nivel.

- [ ] **Step 5: Commit**

```bash
git add apps/pwa/src/components/TodayWorkoutCard.web.jsx
git commit -m "feat(abs-pwa): level label + switcher on Hoy card back"
```

---

## Task 5: Incluir el nivel en la clave de cache de `sessionService`

**Files:**
- Modify: `apps/pwa/src/services/sessionService.js`
- Test: `apps/pwa/src/__tests__/sessionCacheKey.test.js` (si la construcción de la key se extrae a función pura)

- [ ] **Step 1: Leer `sessionService.js`** (la cache en memoria con clave `${userId}|${courseId}[|targetDate]`, TTL 5 min).

- [ ] **Step 2: Extraer la construcción de la key a una función pura y testearla**

```javascript
// dentro de sessionService.js, exportar:
export function buildSessionCacheKey({ userId, courseId, targetDate, level }) {
  return [userId, courseId, targetDate || '', level || ''].join('|');
}
```

```javascript
// sessionCacheKey.test.js
import { buildSessionCacheKey } from '../services/sessionService';
it('keys differ by level so switching level refetches', () => {
  const a = buildSessionCacheKey({ userId: 'u', courseId: 'c', level: 'principiante' });
  const b = buildSessionCacheKey({ userId: 'u', courseId: 'c', level: 'avanzado' });
  expect(a).not.toBe(b);
});
```

- [ ] **Step 3: Verificar que pasa**

Run: `npm --prefix apps/pwa run test -- sessionCacheKey`
Expected: PASS.

- [ ] **Step 4: Usar la key con nivel** en todas las lecturas/escrituras de la cache de `sessionService`, pasando el `level` efectivo. Confirmar también que las `queryKey` de React Query relevantes (`['preview','todaySession', userId, courseId]`) incluyan el nivel donde aplique, para que cambiar de nivel invalide correctamente.

- [ ] **Step 5: Lint + test**

Run: `npm --prefix apps/pwa run lint && npm --prefix apps/pwa run test`
Expected: ok / PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/pwa/src/services/sessionService.js apps/pwa/src/__tests__/sessionCacheKey.test.js
git commit -m "feat(abs-pwa): include level in session cache key"
```

---

## Task 6: Verificación integral del Plan 3

- [ ] **Step 1:** `npm --prefix apps/pwa run test` → PASS (levelGate + sessionCacheKey + tests existentes).
- [ ] **Step 2:** `npm --prefix apps/pwa run lint` → sin errores nuevos.
- [ ] **Step 3 (manual, `npm run pwa:dev`):** primer ingreso → modal; elegir nivel → card carga plan correcto; voltear card → etiqueta + cambiar nivel → contenido cambia.

## Self-review (cobertura del spec — Plan 3)
- Modal de nivel en Hoy al primer ingreso: Tasks 1, 3 ✓
- Etiqueta + dropdown en el reverso del card: Task 4 ✓
- Persistencia vía `PATCH .../level`: Task 2 ✓
- Cache key con nivel (cambiar nivel refetchea): Task 5 ✓
- Onboarding sin cambios: no se toca (✓)
