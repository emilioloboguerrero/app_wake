# Creator Dashboard Rebuild — Complete Implementation Guide

Master checklist for the full creator dashboard rebuild. Every task is granular and checkable. All work commits to `api-infrastructure` branch. Never deploy. Always use worktrees and remove them after merging.

**Key rules:**
- Always read `docs/STANDARDS.md` before writing any UI code
- Always use components from `apps/creator-dashboard/src/components/ui/` when possible
- All user-facing strings in Spanish
- Fun, casual tone (like talking to a friend). No emojis.
- All animations: fade + translateY, never fade alone. Spring easing `cubic-bezier(0.22,1,0.36,1)`
- Canvas always `#1a1a1a`. Content: white in opacity tones. No gold.

---

## Phase 0: Bug Fixes (PARALLEL — all independent)

These fix broken functionality. Each touches different files, run all simultaneously.

### 0A. Fix `checkInByToken` — Missing API Endpoint
**Status:** [x] Complete
**Problem:** Frontend calls `POST /creator/events/:eventId/checkin-by-token` but this endpoint doesn't exist in the API. Only `POST /creator/events/:eventId/registrations/:regId/check-in` exists (line 491 of `functions/src/api/routes/events.ts`).
**Files:**
- `functions/src/api/routes/events.ts` — add new route handler
- `apps/creator-dashboard/src/services/eventService.js` — verify service call matches new endpoint
- `apps/creator-dashboard/src/screens/EventCheckinScreen.jsx` — verify integration
**Tasks:**
- [x] Add `POST /creator/events/:eventId/checkin-by-token` route in `events.ts`
- [x] Handler: validate auth, look up registration by token in `event_signups/{eventId}/registrations` where `checkInToken == token`, mark as checked in
- [x] Return registration data on success, 404 if token not found
- [x] Verify `eventService.checkInByToken(eventId, token)` matches the new route path
- [ ] Test: scan QR → registration found → check-in confirmed

### 0B. Fix `username-check` — Missing API Endpoint
**Status:** [x] Done
**Problem:** `ProfileScreen.jsx` (line 135) calls `GET /creator/username-check?username=...` but this endpoint doesn't exist anywhere in the API routes.
**Files:**
- `functions/src/api/routes/creator.ts` — add new route handler
- `apps/creator-dashboard/src/screens/ProfileScreen.jsx` — verify service call
**Tasks:**
- [x] Add `GET /creator/username-check` route in `creator.ts`
- [x] Handler: validate auth, query `users` collection where `username == req.query.username` and `userId != auth.userId`, return `{ available: boolean }`
- [x] Verify `ProfileScreen.jsx` correctly handles the response and sets `usernameAvailable` state
- [ ] Test: type username → debounce fires → shows available/taken indicator

### 0C. Fix `updateAssignment` — Wrong API Path
**Status:** [ ] Not started
**Problem:** `nutritionFirestoreService.js` (line 147) calls `PATCH /creator/nutrition/assignments/:assignmentId` but the actual API route is `PATCH /creator/clients/:clientId/nutrition/assignments/:assignmentId` (line 866 of `creator.ts`). Missing `clientId` in path.
**Files:**
- `apps/creator-dashboard/src/services/nutritionFirestoreService.js` — fix service method signature and path
- `apps/creator-dashboard/src/screens/ClientProgramScreen.jsx` — pass `clientId` to service call
**Tasks:**
- [ ] Update `nutritionFirestoreService.updateAssignment(assignmentId, data)` → `updateAssignment(clientId, assignmentId, data)`
- [ ] Fix API path to `/creator/clients/${clientId}/nutrition/assignments/${assignmentId}`
- [ ] Update all callers in `ClientProgramScreen.jsx` to pass `clientId`
- [ ] Test: update nutrition assignment for a client → changes saved → no 404

---

## Phase 1: Infrastructure (SEQUENTIAL)

These set up shared systems used by all subsequent phases.

### 1A. Fix GlowingEffect — Remove Hardcoded Gold
**Status:** [x] Complete
**Context:** All 12 UI components in `src/components/ui/` are already built (originally sourced from 21st.dev, now fully local). Audit found 11/12 compliant with the design system. Only GlowingEffect has an issue: hardcoded gold `#d79f1e` in its conic gradient, violating the "no gold" rule. It's used in 17 files.
**Files:**
- `apps/creator-dashboard/src/components/ui/GlowingEffect.jsx` — fix gradient colors
- `apps/creator-dashboard/src/components/ui/GlowingEffect.css` — if color changes needed here

**Component evaluation (completed):**

| Component | Status | Reason |
|---|---|---|
| GlowingEffect | FIX | Hardcoded gold `#d79f1e` in conic gradient — violates design system |
| DisplayCards | KEEP | Dark theme compliant, white opacity tones, spring easing |
| TubelightNavBar | KEEP | Excellent — spring physics, proper dark theme tokens |
| BentoGrid/BentoCard | KEEP | CSS custom properties, dark theme compliant |
| NumberTicker | KEEP | Pure motion component, inherits parent color |
| ShimmerSkeleton | KEEP | CSS-only animation, uses design tokens |
| ProgressRing | KEEP | White opacity defaults, smooth animation |
| AnimatedList | KEEP | Correct spring easing, fade+translateY pattern |
| Toast/ToastContainer | KEEP | Excellent — proper dark tints, spring easing, accessible |
| SpotlightTutorial | KEEP | Custom tutorial system, dark overlay, spring easing |
| MenuDropdown | KEEP | Design tokens, semantic HTML |
| Tooltip | KEEP | CSS custom properties, no hardcoded colors |

**Tasks:**
- [x] Remove hardcoded gold `#d79f1e` from GlowingEffect gradient — replace with white opacity tones or a configurable `--accent` CSS variable
- [x] Verify the fix doesn't break the glow visual across the 17 screens that use it
- [ ] Test: hover over elements with GlowingEffect → glow renders without gold

### 1B. Set Up react-window Virtualization
**Status:** [x] Complete
**Context:** `react-window` v2.2.3 is installed but unused. Needed for lists that can exceed ~50 items.
**Files:**
- `apps/creator-dashboard/src/components/ui/VirtualList.jsx` — new wrapper component
**Tasks:**
- [x] Create `VirtualList` wrapper component that uses `react-window` `FixedSizeList`
- [x] Props: `items`, `renderItem`, `itemHeight`, `height` (container), `emptyState`
- [x] Style: transparent background, smooth scrollbar matching dark theme
- [x] Export from `src/components/ui/index.js`
- [x] Usage threshold: apply when list can exceed 50 items (client roster, exercise library, event registrations)

### 1C. Create Shared Error State Components
**Status:** [x] Complete
**Context:** Need three levels of error handling on every screen. Create reusable components.
**Files:**
- `apps/creator-dashboard/src/components/ui/ErrorStates.jsx` — new file
- `apps/creator-dashboard/src/components/ui/ErrorStates.css` — new file
- `apps/creator-dashboard/src/components/ui/index.js` — add exports
**Tasks:**
- [x] **InlineError** component: `({ message, field })` — small red text below a field. `rgba(224,84,84,0.9)`, 0.82rem, fade+translateY entrance
- [x] **FullScreenError** component: `({ title, message, onRetry, icon })` — centered on page. Icon (alert triangle), title, message, "Intentar de nuevo" button. Fade+translateY entrance. Use when entire page data fails to load.
- [x] Style all per STANDARDS.md (dark canvas, white opacity tones, spring easing)
- [x] Export: `InlineError`, `FullScreenError` from `ui/index.js`
- [x] Toast errors already exist via `useToast()` — no new component needed for that level

### 1D. Create Revenue Display Component
**Status:** [x] Complete
**Context:** Revenue logic needs specific rules: low-ticket shows net revenue (15% Wake cut applied silently), one-on-one shows client/call count only (no revenue). Clicking card shows breakdown.
**Files:**
- `apps/creator-dashboard/src/components/creator/RevenueCard.jsx` — new file
- `apps/creator-dashboard/src/components/creator/RevenueCard.css` — new file
**Tasks:**
- [x] Component props: `{ programs, revenueData, dateRange, onDateRangeChange }`
- [x] **Default view (card):** Show net revenue number (gross × 0.85) with NumberTicker animation. Small info icon indicating breakdown available.
- [x] **Expanded view (on click):** Show breakdown — gross revenue, Wake fee (15%), net revenue. Per-program breakdown if multiple programs.
- [x] **Toggle in same widget:** Low-ticket programs show revenue. One-on-one shows client count + call count instead.
- [x] **Date range selector:** Options — last 7 days, last 30 days, last 90 days, this year, all time
- [x] Never show "Wake cut" or "commission" text — just show "Ingresos netos" and "Ingresos brutos"
- [x] Follow BentoCard styling for card wrapper

---

## Phase 2: Screen-by-Screen Rebuild

Each screen gets: visual polish, all 3 error levels, fun copy, SpotlightTutorial content. Screens that don't share files can run in **PARALLEL**.

### Parallel Group A (independent screens)

#### 2A. Dashboard Screen (Inicio)
**Status:** [x] Complete
**File:** `apps/creator-dashboard/src/screens/DashboardScreen.jsx` + `.css`
**Current:** ~9000 LOC. Draggable widget grid, 6 widgets, tutorial spotlight.

**Tasks — Decomposition:**
- [x] Extract widget components into separate files under `src/components/dashboard/`:
  - [x] `ClientsWidget.jsx` — avatar grid + count
  - [x] `CallsWidget.jsx` — upcoming calls list
  - [x] `RevenueWidget.jsx` — use new RevenueCard component (Phase 1D)
  - [x] `AdherenceWidget.jsx` — ProgressRing + percentage
  - [x] `SessionsWidget.jsx` — completed sessions count
  - [x] `UpcomingCallsWidget.jsx` — detailed call list
- [x] Main `DashboardScreen.jsx` should drop to <500 LOC after extraction

**Tasks — Layout:**
- [x] Implement BentoGrid layout (already using BentoGrid/BentoCard) — verify it's a proper bento box layout with varied card sizes
- [x] Widget sizes: Revenue and Clients should be `2x1` (wide), others `1x1`
- [x] Keep drag-to-reorder with dnd-kit

**Tasks — Revenue Widget:**
- [x] Replace current revenue card with new RevenueCard from Phase 1D
- [x] Toggle: low-ticket shows revenue, one-on-one shows client+call count
- [x] Selectable date range

**Tasks — Error States:**
- [x] Each widget: if query fails, show inline error inside the widget card ("No pudimos cargar tus ingresos. Toca para reintentar.") with retry
- [x] If ALL queries fail: show FullScreenError ("Algo no está funcionando. Revisa tu conexion e intenta de nuevo.")
- [x] Loading: each widget shows SkeletonCard independently

**Tasks — Copy Pass:**
- [x] Widget titles: keep short and clear ("Clientes activos", "Llamadas esta semana", "Ingresos netos", "Adherencia", "Sesiones completadas")
- [x] Empty states per widget:
  - No clients: "Todavia no tienes clientes. Invita al primero desde Clientes."
  - No calls: "Sin llamadas programadas. Configura tu disponibilidad."
  - No revenue: "Cuando vendas tu primer programa, aqui vas a ver tus ingresos."
  - No sessions: "Tus clientes no han completado sesiones aun."

**Tasks — Tutorial:**
- [x] Update SpotlightTutorial steps for dashboard (screenKey: "dashboard"):
  1. Widget grid: "Este es tu centro de control. Puedes arrastrar las tarjetas para organizar tu dashboard."
  2. Revenue card: "Aqui ves tus ingresos. Toca para ver el desglose completo."
  3. Clients card: "Tu roster de clientes activos. Clickea cualquier avatar para ir a su perfil."
  4. Feedback button: "Algo que no funcione o que quieras ver? Mandanos feedback directo desde aca."

#### 2B. Nutrition Screen + Editors
**Status:** [ ] Not started
**Files:**
- `apps/creator-dashboard/src/screens/NutritionScreen.jsx` + `.css`
- `apps/creator-dashboard/src/screens/MealEditorScreen.jsx` + `.css`
- `apps/creator-dashboard/src/screens/PlanEditorScreen.jsx` + `.css`

**Tasks — Error States:**
- [ ] NutritionScreen: FullScreenError if meals AND plans queries fail. Inline error per tab if only one fails.
- [ ] MealEditorScreen: FullScreenError if meal load fails. Toast on save failure ("No pudimos guardar la receta. Intenta de nuevo."). InlineError on field validation.
- [ ] PlanEditorScreen: same pattern as MealEditorScreen.

**Tasks — Copy Pass:**
- [ ] Empty states:
  - No meals: "Tu biblioteca de recetas esta vacia. Crea tu primera receta y empieza a armar planes."
  - No plans: "Todavia no tienes planes de nutricion. Crea uno y asignalo a tus clientes."
- [ ] CTA buttons: "Crear receta", "Crear plan"
- [ ] Toast messages: "Receta guardada", "Plan guardado", "Receta eliminada"
- [ ] Error toasts: "No pudimos guardar los cambios. Revisa tu conexion."

**Tasks — Tutorial:**
- [ ] NutritionScreen (screenKey: "nutrition"):
  1. Tabs: "Recetas son tus comidas individuales. Planes son combinaciones de recetas para una semana."
  2. Create button: "Crea recetas con busqueda de alimentos integrada. Los macros se calculan automaticamente."
  3. Plan assignment: "Una vez que tengas un plan, puedes asignarlo directamente a un cliente desde su perfil."

#### 2C. Events Screens
**Status:** [x] Complete
**Files:**
- `apps/creator-dashboard/src/screens/EventsScreen.jsx` + `.css`
- `apps/creator-dashboard/src/screens/EventEditorScreen.jsx` + `.css`
- `apps/creator-dashboard/src/screens/EventResultsScreen.jsx` + `.css`
- `apps/creator-dashboard/src/screens/EventCheckinScreen.jsx` + `.css`

**Tasks — Error States:**
- [x] EventsScreen: FullScreenError if events query fails. Per-tab empty states.
- [x] EventEditorScreen: Toast on save failure. InlineError on field validation (title required, date required, capacity must be positive).
- [x] EventResultsScreen: FullScreenError if registrations query fails.
- [x] EventCheckinScreen: Specific error for QR scan failure ("No reconocimos ese codigo. Pide al asistente que muestre su QR de nuevo."). Toast on check-in failure.

**Tasks — Copy Pass:**
- [x] Empty states:
  - No active events: "No tienes eventos activos. Crea uno y compartelo con tu audiencia."
  - No drafts: "Ningun borrador guardado."
  - No past events: "Aqui van a aparecer tus eventos pasados con sus resultados."
  - No registrations: "Nadie se ha registrado todavia. Comparte el link de tu evento."
- [x] Check-in success: "Listo, {nombre} esta adentro."
- [x] Check-in already done: "{nombre} ya habia hecho check-in."

**Tasks — Tutorial:**
- [x] EventsScreen (screenKey: "events"):
  1. Event list: "Tus eventos aparecen organizados por estado. Los activos son los que estan abiertos para registro."
  2. Create button: "Crea eventos con campos personalizados. Cada registro genera un QR unico para check-in."
  3. Results: "Despues del evento, revisa quien asistio y descarga los datos."

#### 2D. Availability Screen
**Status:** [x] Complete
**Files:**
- `apps/creator-dashboard/src/screens/AvailabilityCalendarScreen.jsx` + `.css`
- `apps/creator-dashboard/src/screens/AvailabilityDayScreen.jsx` + `.css`

**Tasks — Error States:**
- [x] Calendar: FullScreenError if availability query fails.
- [x] Day view: Toast on slot creation failure ("No pudimos crear el horario. Intenta de nuevo.").
- [x] Conflict detection: InlineError if slot overlaps with existing ("Ya tienes un horario en ese rango.").

**Tasks — Copy Pass:**
- [x] Empty calendar: "Tu calendario esta libre. Agrega horarios para que tus clientes puedan agendar llamadas."
- [x] Empty day: "Sin horarios para este dia. Agrega uno o usa la creacion por lotes."
- [x] Batch creation: "Crea varios horarios de una vez. Selecciona la duracion, los descansos y listo."
- [x] Booked slot: "Llamada con {nombre} — {hora}"
- [x] Available slot: "Disponible — {hora}"

**Tasks — Tutorial:**
- [x] AvailabilityCalendarScreen (screenKey: "availability"):
  1. Calendar: "Tu calendario de disponibilidad. Los dias con puntos ya tienen horarios creados."
  2. Batch creation: "Usa la creacion por lotes para llenar tu semana rapido."
  3. Booked calls: "Las llamadas agendadas aparecen directamente en el calendario."

#### 2E. Profile Screen
**Status:** [x] Complete
**File:** `apps/creator-dashboard/src/screens/ProfileScreen.jsx` + `.css`

**Tasks — Error States:**
- [x] Profile load: FullScreenError if profile query fails.
- [x] Profile picture upload: Toast on failure ("No pudimos subir la foto. Intenta con otra imagen o revisa tu conexion.").
- [x] Username check: InlineError when taken ("Ese nombre de usuario ya esta en uso."). Success indicator when available ("Disponible").
- [x] Save failures: Toast ("No pudimos guardar los cambios.").

**Tasks — Copy Pass:**
- [x] Section titles: "Tu foto", "Informacion basica", "Ubicacion", "Tu bio", "Instagram", "Navegacion"
- [x] Username field helper: "Este es tu link unico: wake.co/{username}"
- [x] Instagram section: "Conecta tu Instagram para mostrar tu feed en tu perfil publico."
- [x] Nav preferences: "Escoge que secciones quieres ver en tu menu. Puedes cambiar esto cuando quieras."

**Tasks — Tutorial:**
- [x] ProfileScreen (screenKey: "profile"):
  1. Profile picture: "Tu foto aparece en tu perfil publico y en el panel de tus clientes."
  2. Username: "Tu nombre de usuario es tu link unico. Compartelo con tus clientes."
  3. Instagram: "Conecta tu feed de Instagram para darle vida a tu perfil."
  4. Nav preferences: "Puedes esconder secciones que no uses para mantener tu menu limpio."

### Parallel Group B (independent screens)

#### 2F. Programs Screen
**Status:** [x] Complete
**File:** `apps/creator-dashboard/src/screens/ProgramsScreen.jsx` + `.css`

**Tasks — Error States:**
- [x] FullScreenError if programs query fails.
- [x] Per-tab errors if only one program type fails to load.
- [x] Toast on program creation failure.

**Tasks — Copy Pass:**
- [x] Empty states:
  - No group programs: "Todavia no tienes programas grupales. Crea uno y empieza a vender."
  - No one-on-one plans: "Sin planes individuales. Crea un plan base y personalizalo por cliente."
- [x] Tabs: "Programas grupales", "Planes individuales"
- [x] Create CTAs: "Nuevo programa", "Nuevo plan"

**Tasks — Tutorial:**
- [x] ProgramsScreen (screenKey: "programs"):
  1. Tabs: "Los programas grupales son los que vendes a multiples clientes. Los planes individuales se personalizan por persona."
  2. Create button: "Empieza con la estructura basica. Despues puedes arrastrar sesiones desde tu biblioteca."
  3. Program card: "Cada programa muestra cuantos clientes estan inscritos y su tasa de completitud."

#### 2G. Program Detail Screen
**Status:** [ ] Not started
**File:** `apps/creator-dashboard/src/screens/ProgramDetailScreen.jsx` + `.css`
**Current:** ~9000 LOC. Three tabs (Lab, Config, Content), drag-drop builder.

**Tasks — Decomposition:**
- [ ] Extract into separate files under `src/components/program/`:
  - [ ] `ProgramLabTab.jsx` — analytics charts (enrollments, sessions, completion)
  - [ ] `ProgramConfigTab.jsx` — metadata form (name, description, type, duration, image)
  - [ ] `ProgramContentTab.jsx` — structure editor (modules, sessions, exercises)
  - [ ] `ProgramExerciseEditor.jsx` — exercise editing panel
  - [ ] `ProgramWeekRow.jsx` — single week row in content view
- [ ] Main `ProgramDetailScreen.jsx` should drop to <500 LOC

**Tasks — Error States:**
- [ ] FullScreenError if program load fails ("No pudimos cargar este programa. Puede que haya sido eliminado.").
- [ ] Per-tab errors: analytics fail → show error in Lab tab only, content loads fine.
- [ ] Drag-drop failures: Toast ("No pudimos mover esa sesion. Intenta de nuevo.").
- [ ] Image upload failure: Toast with specific message.
- [ ] Save failures: Toast ("Los cambios no se guardaron. Revisa tu conexion.").

**Tasks — Copy Pass:**
- [ ] Tab names: "Estadisticas", "Configuracion", "Contenido"
- [ ] Empty content: "Este programa no tiene contenido todavia. Agrega una semana para empezar a construir."
- [ ] Empty analytics: "Cuando tengas clientes inscritos, aqui vas a ver como van."
- [ ] Drag hint: "Arrastra sesiones desde tu biblioteca al dia que quieras."

**Tasks — Tutorial:**
- [ ] ProgramDetailScreen (screenKey: "program-detail"):
  1. Tabs: "Estadisticas te muestra como van tus clientes. Configuracion es la info del programa. Contenido es donde armas la estructura."
  2. Content editor: "Cada fila es un dia de la semana. Arrastra sesiones desde la biblioteca o crea nuevas directo aca."
  3. Library sidebar: "Tu biblioteca aparece al costado. Arrastra lo que necesites al programa."
  4. Week volume: "Revisa el volumen muscular por semana para equilibrar tu programacion."

#### 2H. Library Screens
**Status:** [ ] Not started
**Files:**
- `apps/creator-dashboard/src/screens/LibraryManagementScreen.jsx` + `.css`
- `apps/creator-dashboard/src/screens/LibrarySessionDetailScreen.jsx` + `.css`
- `apps/creator-dashboard/src/screens/LibraryModuleDetailScreen.jsx` + `.css`
- `apps/creator-dashboard/src/screens/LibraryExercisesScreen.jsx` + `.css`
- `apps/creator-dashboard/src/screens/LibraryContentScreen.jsx` + `.css`
- `apps/creator-dashboard/src/screens/CreateLibrarySessionScreen.jsx` + `.css`
- `apps/creator-dashboard/src/screens/CreateLibraryModuleScreen.jsx` + `.css`

**Tasks — Virtualization:**
- [ ] Apply `VirtualList` (Phase 1B) to exercise list in `LibraryExercisesScreen` and `LibraryManagementScreen` exercises tab (can exceed 50+ items)

**Tasks — Error States:**
- [ ] LibraryManagementScreen: FullScreenError if library query fails. Per-tab empty states.
- [ ] Session/Module detail: FullScreenError if item load fails. Toast on save/delete failures.
- [ ] Exercise completeness: keep existing yellow badge pattern (working correctly).

**Tasks — Copy Pass:**
- [ ] Empty states:
  - No exercises: "Tu biblioteca de ejercicios esta vacia. Crea ejercicios y usalos en tus sesiones."
  - No sessions: "Sin sesiones guardadas. Crea una sesion y reutilizala en multiples programas."
  - No modules: "Los modulos agrupan sesiones. Crea uno para organizar mejor tu biblioteca."
- [ ] Completeness warning: "A este ejercicio le falta: {missing items}. No es obligatorio, pero mejora la experiencia de tus clientes."
- [ ] Propagation: "Los cambios se aplican a todos los programas que usen esta sesion. Los clientes con copias personalizadas no se ven afectados."

**Tasks — Tutorial:**
- [ ] LibraryManagementScreen (screenKey: "library"):
  1. Tabs: "Ejercicios son los bloques basicos. Sesiones combinan ejercicios. Modulos agrupan sesiones."
  2. Completeness: "El punto amarillo significa que al ejercicio le falta video, musculos o equipamiento. Funciona igual, pero queda mejor completo."
  3. Drag: "Puedes arrastrar modulos para reordenarlos. Las sesiones se arrastran dentro de los modulos."
  4. Reuse: "Todo lo que creas aca lo puedes usar en cualquier programa. Editar la fuente actualiza todos los programas conectados."

### Parallel Group C (client screens — touch same service layer, run SEQUENTIALLY within group)

#### 2I. Clients Screen (ProgramsAndClientsScreen)
**Status:** [ ] Not started
**File:** `apps/creator-dashboard/src/screens/ProgramsAndClientsScreen.jsx` + `.css`

**Tasks — Client Highlight Card:**
- [ ] Add 3-highlight activity card at top of client profile (right panel):
  1. **Latest PR:** Show most recent personal record — exercise name, weight, date. Query from `exerciseHistory`. If no PR in last 30 days, show "Sin PRs recientes".
  2. **Consistency:** Percentage of planned sessions completed in current week/month. Calculate: `(completedSessions / plannedSessions) × 100`. Show as ProgressRing.
  3. **Nutrition Adherence:** If client has nutrition plan assigned, show adherence % (average of days where actual calories were within ±10% of target). If no plan: "Sin plan asignado".
- [ ] Card styling: 3-column row, each with icon + label + value. Subtle background `rgba(255,255,255,0.03)`, rounded 16px.

**Tasks — Quick Actions:**
- [ ] Add quick action buttons in client header (below name/status):
  - "Asignar sesion" → opens SessionAssignmentModal
  - "Agendar llamada" → navigates to availability with client preselected
  - "Ver programa" → scrolls to Planificacion tab
- [ ] Style: small pill buttons, glass style (secondary button from STANDARDS.md)

**Tasks — Access End-Date Management:**
- [ ] In Planificacion tab, add access management section:
  - Display: "Acceso hasta: {date}" with days remaining count
  - DatePicker to extend/shorten access date
  - Auto-save on date change (useAutoSave pattern)
  - Warning when < 7 days remaining: "El acceso de {nombre} vence en {n} dias."
  - Expired state: red text "Acceso vencido desde {date}."

**Tasks — Virtualization:**
- [ ] Apply `VirtualList` to client roster (left sidebar) if creator has 50+ clients

**Tasks — Error States:**
- [ ] Client list load failure: FullScreenError.
- [ ] Client detail load failure: error in right panel only, left roster still works.
- [ ] Action failures (assign, schedule): Toast with specific message.

**Tasks — Copy Pass:**
- [ ] Empty roster: "Todavia no tienes clientes. Invita a tu primer cliente desde el boton de arriba."
- [ ] No client selected: "Selecciona un cliente de la lista para ver su perfil completo."
- [ ] Tab labels: "Planificacion", "Nutricion", "Lab", "Llamadas"

**Tasks — Tutorial:**
- [ ] ProgramsAndClientsScreen (screenKey: "clients"):
  1. Roster: "Tu lista de clientes. El punto verde significa que estan activos esta semana."
  2. Tabs: "Planificacion para ver su programa. Nutricion para su plan alimenticio. Lab para sus metricas. Llamadas para agendar."
  3. Highlight card: "De un vistazo: su ultimo PR, que tan constante es, y como va con la nutricion."
  4. Quick actions: "Acciones rapidas para asignar sesiones o agendar llamadas sin salir de la pantalla."

#### 2J. Client Program Screen
**Status:** [ ] Not started
**File:** `apps/creator-dashboard/src/screens/ClientProgramScreen.jsx` + `.css`

**Tasks — Error States:**
- [ ] FullScreenError if client program load fails.
- [ ] Per-tab errors (e.g., nutrition tab fails but planificacion works).
- [ ] Assignment failures: Toast ("No pudimos asignar la sesion. Intenta de nuevo.").
- [ ] Nutrition update failures: Toast (relies on Phase 0C fix).

**Tasks — Copy Pass:**
- [ ] Empty plan: "Este cliente no tiene un plan asignado. Asignale uno desde Planificacion."
- [ ] No calls: "Sin llamadas agendadas con {nombre}."
- [ ] No lab data: "{nombre} no ha registrado datos todavia. Los vas a ver aca cuando empiece."

**Tasks — Tutorial:**
- [ ] ClientProgramScreen (screenKey: "client-program"):
  1. Week view: "La semana de tu cliente. Cada celda es un dia con las sesiones asignadas."
  2. Nutrition: "El plan de nutricion asignado con los macros objetivo y la adherencia real."
  3. Lab: "Metricas de progreso: peso corporal, volumen de entrenamiento, adherencia."

### Phase 2 — Standalone

#### 2K. Onboarding Refinements
**Status:** [ ] Not started
**File:** `apps/creator-dashboard/src/screens/CreatorOnboardingScreen.jsx` + `.css`

**Current flow (7 steps, 0-6):**
0. Welcome — logo + "Tu negocio de fitness, sin friccion." + animated background orbs
1. Profile picture — optional upload with progress bar
2. Discipline — training / nutrition / both (choice cards)
3. Delivery type — groups / one-on-one / both (choice cards)
4. Client range — 0 / 1-5 / 6-20 / 20+ (chips)
5. How they found us — free text (optional)
6. Founder note — Emilio signature + "hola@wake.co"

**Tasks:**
- [ ] Step 0 (Bienvenida): Already exists. Verify animation quality matches STANDARDS.md. Polish if needed.
- [ ] Step 6 (Founder note): Leave space for handwritten signature image. Add a clear placeholder comment in code: `{/* TODO: Replace with actual handwritten signature image */}`. Current uses Caveat font for "Emilio" — keep as fallback.
- [ ] Copy review — verify all step copy matches fun/casual tone:
  - Step 0: "Tu negocio de fitness, sin friccion." — keep
  - Step 1: "Tu cara conecta con tus clientes. No es obligatoria." — keep
  - Step 2: "Esto define como organizamos tu espacio." — keep
  - Step 3: "Puedes cambiar esto mas adelante." — keep
  - Step 4: "Un numero aproximado esta perfecto." — keep
  - Step 5: "Es opcional. Nos ayuda a crecer como tu." — keep
  - Step 6: verify founder message tone
- [ ] Error handling: verify upload failures show inline error + allow retry or skip
- [ ] Verify progress dots animation matches STANDARDS.md (pulse on current, opacity change on complete)

#### 2L. Login Screen
**Status:** [ ] Not started
**File:** `apps/creator-dashboard/src/screens/LoginScreen.jsx` + `.css`

**Tasks — Error States:**
- [ ] Wrong credentials: InlineError below password field ("Email o contrasena incorrectos.")
- [ ] Network failure: Toast ("No pudimos conectar con el servidor. Revisa tu conexion.")
- [ ] Account disabled: InlineError ("Esta cuenta ha sido deshabilitada. Contacta soporte.")

**Tasks — Copy Pass:**
- [ ] Title: "Entra a tu dashboard"
- [ ] Fields: "Email", "Contrasena"
- [ ] CTA: "Entrar"
- [ ] Forgot password: "Olvidaste tu contrasena?"

---

## Phase 3: Cross-Cutting Polish (SEQUENTIAL — touches many files)

### 3A. DashboardLayout Visual Polish
**Status:** [ ] Not started
**File:** `apps/creator-dashboard/src/components/DashboardLayout.jsx` + `.css`

**Tasks:**
- [ ] Verify sidebar matches STANDARDS.md dark theme (canvas `#1a1a1a`, borders `rgba(255,255,255,0.07)`)
- [ ] Nav items: verify hover states have translateY(-1px) + background lighten
- [ ] Active nav item: verify glow/highlight indicator
- [ ] Sidebar footer: verify profile button styling
- [ ] Header (StickyHeader): verify parallax scroll effect, proper text shadows
- [ ] Mobile menu toggle: verify smooth slide-in animation (spring easing)
- [ ] Add "?" tutorial replay button to header (right side, next to feedback button)
  - [ ] Icon: question mark in circle, `rgba(255,255,255,0.4)`, 32px
  - [ ] On click: resets current screen's SpotlightTutorial localStorage key and triggers replay
  - [ ] Tooltip: "Replay tutorial"

### 3B. Command Palette Polish
**Status:** [ ] Not started
**File:** `apps/creator-dashboard/src/components/CommandPalette.jsx` + `.css`

**Tasks:**
- [ ] Verify it opens with Cmd/Ctrl+K
- [ ] Verify search covers: screens, clients, programs, actions
- [ ] Error state: if search fails, show inline message ("No pudimos buscar. Intenta de nuevo.")
- [ ] Empty state: "No encontramos resultados para '{query}'."
- [ ] Verify animations: fade+scale entrance, spring easing

### 3C. Global Copy Audit
**Status:** [ ] Not started

**Tasks:**
- [ ] Audit every `showToast` call across all screens — ensure messages are specific and in casual Spanish
- [ ] Audit every empty state — ensure fun, helpful copy (not just "No hay datos")
- [ ] Audit every button/CTA — ensure clear, action-oriented copy
- [ ] Audit every modal title and body — ensure conversational tone
- [ ] Verify no English strings remain in user-facing UI
- [ ] Verify no emojis in UI copy

### 3D. Loading States Audit
**Status:** [ ] Not started

**Tasks:**
- [ ] Every screen must show ShimmerSkeleton or SkeletonCard during initial load
- [ ] No blank screens during loading
- [ ] Skeletons must match the layout of the loaded content (not generic rectangles)
- [ ] Verify all skeletons use standard shimmer animation from ShimmerSkeleton component

---

## Execution Sequence

```
PHASE 0 (Bug Fixes) — ALL PARALLEL
├── 0A: checkInByToken endpoint         [worktree: fix/checkin-token]
├── 0B: username-check endpoint         [worktree: fix/username-check]
└── 0C: updateAssignment path           [worktree: fix/update-assignment]
    ↓ merge all into api-infrastructure
PHASE 1 (Infrastructure) — SEQUENTIAL
├── 1A: 21st.dev component evaluation   [worktree: feat/21st-components]
├── 1B: VirtualList component           [worktree: feat/virtual-list]
├── 1C: Error state components          [worktree: feat/error-states]
└── 1D: Revenue display component       [worktree: feat/revenue-card]
    ↓ merge all into api-infrastructure
PHASE 2 (Screen Rebuilds) — GROUPED PARALLEL
│
├── Group A (PARALLEL — no shared files)
│   ├── 2A: Dashboard                   [worktree: rebuild/dashboard]
│   ├── 2B: Nutrition                   [worktree: rebuild/nutrition]
│   ├── 2C: Events                      [worktree: rebuild/events]
│   ├── 2D: Availability               [worktree: rebuild/availability]
│   └── 2E: Profile                     [worktree: rebuild/profile]
│       ↓ merge all into api-infrastructure
│
├── Group B (PARALLEL — no shared files)
│   ├── 2F: Programs list               [worktree: rebuild/programs]
│   ├── 2G: Program detail              [worktree: rebuild/program-detail]
│   └── 2H: Library screens             [worktree: rebuild/library]
│       ↓ merge all into api-infrastructure
│
├── Group C (SEQUENTIAL — shared service layer)
│   ├── 2I: Clients screen              [worktree: rebuild/clients]
│   └── 2J: Client program              [worktree: rebuild/client-program]
│       ↓ merge into api-infrastructure
│
└── Standalone
    ├── 2K: Onboarding                  [worktree: rebuild/onboarding]
    └── 2L: Login                       [worktree: rebuild/login]
        ↓ merge into api-infrastructure

PHASE 3 (Cross-Cutting) — SEQUENTIAL
├── 3A: DashboardLayout polish          [worktree: polish/layout]
├── 3B: Command palette polish          [worktree: polish/command-palette]
├── 3C: Global copy audit               [worktree: polish/copy-audit]
└── 3D: Loading states audit            [worktree: polish/loading-states]
    ↓ merge all into api-infrastructure
```

### Merge Protocol
1. Agent finishes work in worktree
2. Commit all changes with descriptive message
3. Switch to `api-infrastructure` branch
4. Merge worktree branch: `git merge <worktree-branch>`
5. Remove worktree: `git worktree remove <path>`
6. Delete branch: `git branch -d <worktree-branch>`
7. Mark task as complete in this document (change `[ ]` to `[x]`)

### Rules
- **Never deploy.** All work stays on `api-infrastructure`.
- **Always use worktrees.** Remove after merging.
- **Always read STANDARDS.md** before writing UI code.
- **Always use `src/components/ui/` components** — never create parallel implementations.
- **All strings in Spanish.** Fun casual tone. No emojis.
- **Commit granularly** — one logical change per commit, not entire phases.
