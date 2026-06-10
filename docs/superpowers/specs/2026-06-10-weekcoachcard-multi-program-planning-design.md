# WeekCoachCard — planificación multi-programa por día

**Fecha:** 2026-06-10
**Archivo afectado:** `apps/pwa/src/components/WeekCoachCard.web.jsx` (único)
**Tipo:** UI/UX + agregación de datos in-componente. Sin cambios de API, sin otros archivos.

---

## Problema

En la pantalla Hoy (`HoyScreen.web.jsx`), la tarjeta derecha del carrusel (`WeekCoachCard`) muestra la planificación de la semana, una fila por día, **scoped a un coach** (`creator_id` environment). Todos los programas del mismo coach se fusionan en ese environment (`envCourses = selected.workouts`).

Cuando un usuario tiene **varios programas del mismo coach**, hoy se pierde información: la fila de cada día solo muestra **una** sesión.

Causa raíz, en el `useMemo` de agregación (`WeekCoachCard.web.jsx:645-683`):

- `sessionTitleByDate` es `Map<ymd, unTitulo>` con lógica **"first match wins"** (`titles.set(ymd, s.title)` solo `if (!titles.has(ymd))`).
- `completedDateMap` / `plannedDateMap` también son de valor único por fecha.
- `statusForDate(ymd)` (`:696`) devuelve un único estado por día.

Consecuencia: si el coach tiene Programa A y Programa B con sesión el mismo día, solo se ve el **nombre del primero** (orden pinned-first). Y peor: si A está **completado** y B **planeado**, la fila muestra "✓ completada" y **oculta el estado real del segundo programa**. El punto del calendario se fusiona, pero el nombre y el estado por sesión se pierden.

Realísticamente pueden caer **hasta 3 sesiones** el mismo día.

---

## Solución elegida

**Líneas apiladas por programa** dentro de la misma fila de día. Cada sesión su propia mini-línea con su propio nombre y su propio estado (`✓` / planeada). Los días con una sola sesión quedan **idénticos** a la versión actual (cero regresión).

Decisiones tomadas durante el brainstorming:
- **Solapamiento máximo:** hasta 3 sesiones por día.
- **Formato:** líneas apiladas (no inline con separador, no contador).
- **Diferenciación:** solo nombre de sesión (sin etiqueta de programa).
- **Tap:** la fila completa selecciona el día (`onSelectDate(ymd)`), comportamiento actual. Sin plomería nueva con el carrusel.

---

## Cambio de datos (aditivo, no rompe el calendario del mes)

En el mismo `useMemo` que ya recorre `envCourses` (`:645-683`), **agregar** un mapa nuevo:

```
sessionsByDate: Map<ymd, Entry[]>
Entry = { courseId, title, status }   // status: 'completed' | 'planned'
```

Reglas de construcción (recorriendo `envCourses` en su orden actual = pinned-first):

- **Programas date-scheduled** (`one_on_one` o `scheduling === 'weekly'`, detectados por `hasPlanned`): por cada sesión con `plannedDate` →
  `{ courseId, title: s.title || null, status: completedIds.has(s.sessionId) ? 'completed' : 'planned' }`.
- **Programas legacy** (`general`, rama `else`): por cada fecha completada de `moduleCalendarQueries` →
  `{ courseId, title: (ymd === todayYmd ? sessionState.session?.title : null), status: 'completed' }`.
- **Dedup por `courseId`** dentro de cada día (una línea por programa por día; nos quedamos con la primera entrada de ese curso para esa fecha).

**No se tocan** `completedDateMap`, `plannedDateMap` ni `sessionTitleByDate`: siguen alimentando los puntos del calendario del mes (cara trasera) y la navegación "qué curso posee la fecha". `sessionsByDate` es puramente **aditivo** y solo lo consume el render del strip de la semana en la cara frontal.

---

## Render de cada fila de día (cara frontal, `:780-875`)

Sustituir el bloque que arma `titleNode` (un solo nodo) por un render de **lista de líneas**:

1. `entries = sessionsByDate.get(ymd) || []`
2. `named = entries.filter(e => e.title)`
3. **Si `named.length >= 1`** → renderizar una mini-línea por entrada nombrada:
   - Nombre de sesión (flex, `text-overflow: ellipsis`, una línea).
   - Indicador propio a la derecha: `✓` si `status === 'completed'`; si es `planned`, estilo de texto "planeada" (igual que hoy) sin `✓`.
   - Orden = orden de `entries` (pinned-first).
4. **Si `named.length === 0`** → exactamente la lógica de fallback actual:
   - `status === 'completed'` → "Sesión completada"
   - fin de semana → "Descanso"
   - `planned` → "Sesión planeada"
   - else → "Sin sesión"
   - (Esto cubre el caso borde de dos entradas legacy sin título: colapsan en **una** línea de fallback en vez de duplicar "Sesión completada".)

**Celda izquierda (día + número):** no se repite. Se alinea **arriba** (align-items flex-start) y las líneas de sesión se apilan a su derecha en el cuerpo de la fila.

**Pastilla "Hoy":** se mantiene **a nivel de día** (una sola vez). Regla: si hoy tiene ≥1 sesión completada, el `✓` aparece en esa(s) línea(s); la condición de "hoy" la comunica el resaltado de fila + la pastilla. Si ninguna línea está completada, la pastilla "Hoy" se muestra en la primera línea (como hoy). Evitar duplicar la pastilla por línea.

**Estado de selección / hoy / weekResolving:** sin cambios — el resaltado aplica a toda la fila; el skeleton se muestra cuando `weekResolving` (igual que hoy).

---

## Layout / altura

La lista de la semana (`styles.weekList`) crece en altura **solo** en días con solape. Las filas actuales ya son altas y tienen padding generoso, así que apilar 2-3 líneas cabe sin apretar.

Verificar durante la implementación que la tarjeta dimensione a contenido sin recortar las 7 filas (ajustar `flex`/altura del contenedor si la tarjeta tuviera altura fija). El selector de coach (`coachWrap`, `marginTop: auto`) debe seguir anclado abajo.

---

## Ejemplo visual (mismo estilo actual)

Día con dos programas del mismo coach (Método Bejarano + Código ABS):

```
 MIÉ    Pierna (Quads)              HOY
 10     Abdomen día 3                ✓

 VIE    Pierna (Posterior)
 12     Abdomen día 4
```

Día con una sola sesión (sin cambios respecto a producción):

```
 LUN    Empuje
 8
```

---

## No-regresión / alcance

- Único archivo: `WeekCoachCard.web.jsx`. Cambian (a) el `useMemo` de agregación (se añade `sessionsByDate`) y (b) el render del cuerpo de la fila.
- Sin cambios de API, sin cambios en hooks, sin tocar la cara del mes, el overlay de videos (`VideoExchangeOverlay`), el selector de coach ni `onSeeProgram`.
- Días de una sola sesión: render idéntico (la rama `named.length === 0` y el caso de una sola línea nombrada reproducen el comportamiento actual).
- El calendario del mes (cara trasera) no cambia: sigue leyendo `completedDateMap` / `plannedDateMap`.

---

## Verificación

El efecto solo es visible con **dos programas activos del mismo coach** con sesión el mismo día. Opciones para validar (a confirmar antes de cualquier escritura en prod o deploy — `wolf-20b8b` es producción):

1. **Datos de prueba locales:** correr la PWA en dev e inyectar un segundo curso del mismo `creator_id` en la respuesta de `envCourses` / `sessionState` para ver el apilado sin tocar prod.
2. **Lectura read-only en prod:** buscar si ya existe algún usuario con 2+ cursos del mismo `creator_id` y validar el render con esa cuenta tras el deploy.
3. **Asignar un segundo programa de Felipe** a una cuenta de prueba en prod (requiere confirmación explícita previa).

Casos a cubrir en la verificación:
- Día con 1 sesión → idéntico a hoy.
- Día con 2 y 3 sesiones nombradas → se apilan, cada una con su estado.
- Día con una completada + una planeada → `✓` en la completada, estilo planeada en la otra (hoy esto se rompe).
- Día "Hoy" con varias sesiones → pastilla "Hoy" una sola vez.
- Días de descanso / sin sesión / fin de semana → fallback intacto.
