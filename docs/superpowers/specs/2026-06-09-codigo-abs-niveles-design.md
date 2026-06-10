# Código ABS — Suscripción mensual con niveles (modelo shell → planificaciones)

**Fecha:** 2026-06-09
**Autor:** Emilio + Claude
**Estado:** Diseño para revisión (v2 — modelo shell→planes)

---

## 1. Contexto y objetivo

Convertir el concepto del manuscrito "Código A.B.S" de Felipe Bejarano (libro finito: 100 días, 50 rutinas, 3 enfoques A/B/C, 5 fases) en el **nuevo producto flagship de Felipe en WAKE**: una suscripción mensual donde el macro se renueva y las rutinas cambian, para que la gente siga pagando sin aburrirse de los mismos ejercicios.

> El manuscrito está **incompleto** (teoría + R1–21; faltan R22–50, el nivel Intermedio y el capítulo de nutrición). Completar el contenido es homework de Felipe, no código.

### Decisiones de producto (cerradas)

1. **ABS es flagship.** Reusa la maquinaria de suscripción (general, `monthly_first_monday`, cron del primer lunes, acceso rodante, política historial-se-queda/contenido-se-bloquea). El Método pasa a segundo plano.
2. **Tres niveles:** Principiante / Intermedio / Avanzado.
3. **Modelo shell → planificaciones (idea de Emilio):** el programa ABS es un **caparazón**; cada nivel **apunta a una planificación entera e independiente** (`plans/{planId}`), autorizada con las herramientas que ya existen para asesorías. Los niveles pueden ser **rutinas completamente distintas**, no solo "mismo patrón, otro ejercicio".
4. **El nivel se elige por programa**, no en onboarding. Se pregunta al **primer ingreso a la Hoy/main screen, antes de la primera sesión** (no en el checkout, para no fricciónar el pago). Default mientras no elige = el default del programa.
5. **Etiqueta de nivel visible y cambiable.** En el reverso del Hoy card: etiqueta (Principiante/Intermedio/Avanzado) + dropdown para cambiar de planificación cuando quiera.
6. **Implementación entera y reutilizable** (no "v1 mínimo"): cualquier programa futuro podrá ser un shell multi-planificación.
7. **Todo aditivo.** Programas sin niveles se comportan exactamente como hoy.
8. **Subimos el primer año completo** (12 meses) de las 3 planificaciones de una vez.

---

## 2. Ground truth (verificado en código + BD de producción wolf-20b8b)

### Árbol de PLANES = idéntico a cursos
`plans/{planId}/modules/{moduleId}/sessions/{sessionId}/exercises/{exerciseId}/sets/{setId}`
- **Plan root:** `title`, `description`, `creator_id`, `creatorName`, `discipline?`.
- **Module:** `title` ("Semana 7"), `order`. (En asesorías un módulo = una semana.)
- **Session:** `title`, `order`, `dayIndex`, `isRestDay?`, `source_library_session_id`, `image_url`, `defaultDataTemplate`.
- **Exercise:** `primary: {libId: exId}`, `alternatives`, `measures`, `objectives`, custom labels (mismo shape que cursos; nombre/video se hidratan de la librería).
- **Set:** `reps` (rangos/AMRAP), `intensity` ("N/10"), `rir?`, `restSeconds`, `duration?`, `rep_sequence?` (arco), `notes`.

### Autoría de planes (dashboard) — ya existe y se reusa
`/plans`, `/plans/new`, `/plans/{planId}` → `PlanDetailScreen` + `PlanStructureSidebar` + `PlanWeeksGrid` + `PlanSessionDetailScreen`, reusando **los mismos componentes de edición de sesión/ejercicio que los cursos** (`LibrarySessionDetailScreen`). Servicio `plansService.js`. CRUD completo en [creator.ts](../../../functions/src/api/routes/creator.ts) bajo `/creator/plans/...`.

### Indirección shell→plan — ya existe (es lo que generalizamos)
En [workout.ts](../../../functions/src/api/routes/workout.ts) el path **one_on_one** (~323–593) y el **plan-based** (~595–688) resuelven contenido así:
`planAssignments[clave] → {planId, moduleId} → plans/{planId}/modules/{moduleId}/sessions/...`
Hoy la clave es la semana ISO ("2026-W21"). **Nuestro cambio: la clave/selección será (nivel + mes vigente), no la asignación manual por semana.**

### Cadencia mensual — ya existe
- Read general (~690–900): filtra `courses/{id}/modules` por `order <= current_block_index`.
- Cron `advanceMonthlyDropCourse` ([index.ts](../../../functions/src/index.ts) ~2704–2843, `every monday 01:00` BOG): busca el siguiente módulo con `published_at != null` y `order > current_block_index`; escribe `program_state/{courseId}` + `courses.current_block_id/index`. Idempotente por `current_block_started_at` (mes BOG). Cron de verificación día 2–8.
- Access gate `courseAccessIsActive()` (~119–137): `expires_at` + gracia 3 días + `status==active`/`is_trial`. Cadenced → exige suscripción activa; no-cadenced → "published-means-public".

### Selección de sesión (scheduling weekly)
Las sesiones `weekly` (`dayIndex` 1..7) **se repiten cada semana del mes**; hoy NO hay noción de "semana-del-mes" que cambie ejercicios (solo `rep_sequence` varía reps por semana).

### Offline / descarga
El agente **no encontró `courseDownloadService`** (mi memoria lo mencionaba). Hoy parece ser solo el cache en memoria de `sessionService` (TTL 5 min). **A confirmar** antes de tocar offline; el único cambio necesario sería incluir el nivel en la clave de cache.

---

## 3. Arquitectura (3 pilares aditivos)

### Pilar 1 — Niveles vía shell→planes
- **Course (shell) nuevo campo `level_plans`:**
  ```
  level_plans: { principiante: planIdP, intermedio: planIdI, avanzado: planIdA }
  ```
- **Course nuevo campo `levels`:** `{ options:["principiante","intermedio","avanzado"], default:"principiante" }`.
- **Enrollment nuevo campo `users.courses[courseId].level`:** el nivel elegido. Si falta → `course.levels.default`.
- Cada nivel = un `plans/{planId}` independiente (12 módulos-mes). Sin `level_plans` → el curso no es escalable (comportamiento actual).

### Pilar 2 — Cadencia mensual sobre los planes
- `program_state/{courseId}.current_block_index` = el **mes vigente** (ordinal, cohort-sync). Lo avanza el cron del primer lunes, igual que hoy.
- **Cambio en el cron:** cuando el curso tiene `level_plans`, en vez de mirar `courses/{id}/modules`, mira los módulos de los planes de nivel: avanza al `order = current+1` **solo si ese mes está publicado en las 3 planificaciones** (ningún nivel se queda sin contenido). Escribe `program_state` + `course.current_block_index` igual que hoy.

### Pilar 3 — Variedad semanal dentro del mes (el "que cambien cada semana")
Para que las rutinas cambien semana a semana con **ejercicios distintos** (no solo reps), añadimos un eje de semana:
- **Session nuevo campo `weekIndex`** (0..4) además de `dayIndex`. Un mes-módulo trae hasta 4–5 semanas × 3 días de sesiones distintas.
- **`weekInBlock` (cohort-sync, computado, sin cron nuevo):**
  `weekInBlock = clamp(floor((hoy − program_state.current_block_started_at) / 7d), 0, maxWeekIndex)`.
- **Selección:** las sesiones de hoy = del mes vigente, donde `weekIndex == weekInBlock` y `dayIndex == díaDeHoy`.
- Aditivo: sesiones sin `weekIndex` → se repiten cada semana (comportamiento actual del Método intacto).

### Resolución completa del read para ABS (general + level_plans)
```
userLevel   = users.courses[courseId].level ?? course.levels.default
planId      = course.level_plans[userLevel]
monthModule = plans[planId].modules where order == program_state.current_block_index
weekInBlock = clamp(floor((today − current_block_started_at)/7d), 0, maxWeek)
todaySessions = monthModule.sessions where weekIndex == weekInBlock AND dayIndex == hoy
```
Sin `level_plans` o sin `weekIndex` → comportamiento idéntico al de hoy. **Cero migración, no rompe nada.**

### Por qué es la arquitectura correcta
- Reusa el árbol de planes, el editor de planes y la indirección shell→plan que ya existen.
- Niveles = planificaciones enteras (máxima libertad para Felipe).
- Cadencia mensual cohort-sync intacta; variedad semanal vía `weekIndex` computado (sin cron nuevo).
- Generaliza a cualquier programa futuro.

---

## 4. Mapeo del macro

| Capa | Doc | Notas |
|---|---|---|
| Programa ABS (shell) | `courses/{id}` | `general`, `monthly_first_monday`, `subscription_price`, `levels`, `level_plans`, creator Felipe |
| Planificación (×3, una por nivel) | `plans/{planId}` | 12 módulos-mes; autorizada con el editor de planes existente |
| Mes (bloque) | `plans/.../modules/{id}` | `order` 0–11; `published_at` = gate del cron; tema en `title` |
| Semana | `weekIndex` en sesiones | la rutina cambia por semana dentro del mes |
| Día/Rutina | `plans/.../sessions/{id}` | enfoque A/B/C vía `dayIndex` (~3/sem) |
| Serie | `plans/.../sets/{id}` | `reps`/`AMRAP`/`duration`, `intensity`, `restSeconds`, `rep_sequence` |

---

## 5. Cambios por superficie (revisión de TODO lo que toca)

### A. Esquema (aditivo)
- `course.level_plans`, `course.levels`, `users.courses[courseId].level`, `session.weekIndex`.
- Planes: sin cambios de esquema (se reusan). Sin migración de datos.

### B. API (functions)
1. **Read workout** ([workout.ts](../../../functions/src/api/routes/workout.ts)): nueva rama "general + level_plans" que resuelve `nivel → plan → módulo(order==current_block_index) → sesiones(weekIndex==weekInBlock)`. Reusa el helper de lectura de planes (one_on_one). Aplica en `/workout/daily`, `/workout/session-exercises`, `/workout/programs/:courseId/modules`, `/current-block`.
2. **Cron** `advanceMonthlyDropCourse` ([index.ts](../../../functions/src/index.ts)): rama que gatea la publicación sobre los `level_plans` (los 3 planes deben tener el siguiente mes publicado).
3. **Nuevo endpoint** `PATCH /users/me/courses/:courseId/level` → set/cambia `users.courses[courseId].level` (valida contra `course.levels.options`).
4. **Enrollment** ([courseAssignment.ts](../../../functions/src/api/services/courseAssignment.ts) + trial grant en [payments.ts](../../../functions/src/api/routes/payments.ts)): **NO** escribe `level` (lo deja ausente, para que el modal de primer ingreso pueda dispararse); el read cae a `course.levels.default` mientras esté ausente. Preservar el `level` elegido en renovación.
5. **Creator** ([creator.ts](../../../functions/src/api/routes/creator.ts)): endpoint para setear `level_plans` en el shell (extender `PATCH /creator/programs/:programId` o un `assign-level-plan`). **No se tocan allowlists de ejercicios** (no hay variantes por ejercicio). Agregar `weekIndex` a la allowlist de sesiones de plan.

### C. Plataforma de creadores (apps/creator-dashboard)
- **Vista del programa (shell):** nueva config **"Planificaciones por nivel"** — mapear cada nivel a un plan existente (o crear uno). Reusa la lista de planes + el patrón assign-plan. Diseño según `feedback_creator_dashboard_design`.
- **Editor de sesión de plan:** agregar el selector de `weekIndex` (junto a `dayIndex`) para autorizar semanas distintas dentro de un mes.
- **Editor de planes:** sin cambios (Felipe crea 3 planes con lo que existe).

### D. Compras / enrollment + dónde se pregunta el nivel
- Flujo de compra intacto (`CourseDetailScreen` → `prepareSubscription` → `/payments/subscription` → MP → webhook escribe enrollment **sin** `level`).
- **Modal de nivel** en la **Hoy/main screen al primer ingreso** (gate: `users.courses[courseId].level` ausente), antes de la primera sesión → `PATCH .../level`. Mientras esté ausente, el contenido se sirve con `course.levels.default`.

### E. Experiencia de entrenamiento (PWA)
- **Hoy card (reverso):** etiqueta del nivel + **dropdown** para cambiar de planificación → `PATCH .../level` → refetch.
- El servidor resuelve el contenido por (nivel, mes, semana); el cliente solo renderiza.
- `sessionService` cache key: incluir `level` (cambiar de nivel refetchea).
- Offline: confirmar `courseDownloadService`; si existe, pasar `level` al fetch del bloque.

### F. Onboarding
- **Sin cambios.** El nivel es por-programa.

### G. Carga del primer año (contenido)
- Crear shell **"Código ABS"** (general, monthly_first_monday, `subscription_price`, `levels`, `level_plans`, capacity si beta).
- Crear **3 planes** (principiante/intermedio/avanzado), cada uno con **12 módulos-mes**, sesiones con `weekIndex`+`dayIndex` (enfoques A/B/C), sets con `rep_sequence`+`intensity`.
- Librería base de ~15–20 movimientos (reusada por los 3 planes).
- Vía **seed script** (patrón `scripts/seed-metodo-bejarano.js`). Todo `draft`/`published_at` controlado hasta revisión de Felipe.

---

## 6. Decisiones (resueltas)

1. **Variedad semanal (Pilar 3):** ✅ **Ejercicios distintos cada semana** vía `weekIndex` (~12 sesiones/mes por nivel = 4 semanas × 3 días). Es la implementación entera.
2. **Avance del cron con 3 planes:** ✅ gatear a que **los 3 niveles** tengan el siguiente mes publicado (ningún nivel se queda sin contenido).
3. **Cambiar de nivel a mitad de mes:** ✅ mantiene el mismo `weekInBlock` (cohort-sync); solo cambia de planificación, no reinicia la semana.

## 7. Fuera de alcance
- Capítulo de nutrición del manuscrito (producto aparte).
- Completar contenido R22–50 / nivel Intermedio (homework de Felipe).
- Personalización por usuario tipo asesoría (copy-on-write `client_plan_content`) — ABS es cohort, no 1-a-1.
