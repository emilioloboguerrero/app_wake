# Wake Platform — Consolidated UI/UX Audit

*First-principles review across PWA, Creator Dashboard, and shared surfaces. 207 raw findings deduped and prioritized for launch.*

---

## 1. Executive summary — systemic themes

The platform is visually mature (cinematic dark system, thoughtful loading/empty states, real analytics tooling). What holds it back from a confident launch is not aesthetics — it is a handful of **patterns that repeat on nearly every screen**. Fixing the pattern once, everywhere, is worth more than chasing individual screens.

**Theme A — Silent failures and error states disguised as "normal."**
This is the single most pervasive and most damaging pattern. Saves, uploads, and mutations fail with no user-facing feedback across both apps: workout notes (`WorkoutCompletionScreen`), progress-photo upload and weigh-in save (`LabScreen`), onboarding photo (`OnboardingEducation`), profile save (`ProfileScreen`), nutrition autosave (`PlanEditorScreen`, `MealEditorScreen`, `NutritionProgramEditorScreen`), event mutations (`EventRegistrationsScreen`, `EventsManagementScreen`). Worse, **failed loads masquerade as legitimate empty states**: a network error tells the user they have zero sessions (`SessionsScreen`), zero clients (`ClientesScreen` non-primary tabs), that the coach hasn't replied yet (`VideoExchangeThreadView`), or that access is denied (`EventCheckinScreen`). Users cannot distinguish "nothing here" from "it broke," and cannot recover. *Why it matters: it silently erodes trust in the data — the one thing a fitness/coaching product cannot afford — and turns transient blips into dead ends.*

**Theme B — The primary action is hidden, and often breaks entirely on touch.**
The most important action on a screen is repeatedly undiscoverable or drag-only. Starting today's workout is buried behind an unhinted card flip (`TodayWorkoutCard`) or an unlabeled image tap (`DailyWorkoutScreen`). Assigning a nutrition plan, adding a food, and adding a library session are **drag-only** — which does not fire on touch at all, making core coach workflows non-functional on tablets/phones (`ClientProgramScreen`, `PlanEditorScreen`, `LibraryModuleDetailScreen`). Macro remaining/consumed toggling has zero affordance (`NutritionScreen`). A fully-styled "Filtrar" button is a no-op (`ProgramLibraryScreen`). *Why it matters: an affordance the user cannot find is a feature that does not exist; a drag-only one on a mobile-first product is a broken one.*

**Theme C — Spanish copy is not launch-ready.**
Systematic missing diacritics (`sesión`, `información`, `nutrición`, `conexión`, `días`), including the anatomically embarrassing `anos`→`años` (`CompleteProfileScreen`) and `Si`→`Sí` on a destructive confirm (`PlanEditorScreen`). Register flips mid-flow between Colombian tuteo and Argentine voseo inside the checkout funnel (`ProgramSubscriptionScreen`, `PaymentSuccessScreen`, `EmailLinkSignInScreen`). Untranslated English leaks onto the most-shared screens (`No muscle data available`, `No media available`, and a raw `Option 2 - Fullscreen` dev placeholder). A **founder's personal Gmail** is the official support/payments/account-deletion channel in three places. *Why it matters: for a Colombia-first, real-money product, this reads as unfinished and untrustworthy exactly where users decide whether to pay.*

**Theme D — Destructive actions lack confirmation or safe recovery.**
Irreversible actions fire on a single tap: permanent progress-photo delete (`LabScreen`), client/invite removal (`ClientesScreen`), un-publishing a live purchasable program (`GroupProgramView`). Meanwhile *reversible* detaches demand type-the-exact-name friction (`LibraryContentScreen`, `LibraryModuleDetailScreen`) — the friction is inverted. Confirmation UX is also inconsistent (custom `ConfirmDeleteModal` vs native `window.confirm` vs tiny inline confirm), and error recovery sometimes means `window.location.reload()`, the worst option on a flaky connection. *Why it matters: one mis-tap causing unrecoverable data or revenue loss is the definition of launch-embarrassing.*

**Theme E — Accessibility floor is unmet, consistently.**
Sub-44px tap targets on the highest-frequency and most destructive controls appear in every single batch (session dots at 18px, dismiss/flip buttons at 28px, event action buttons ~32px, destructive client delete at 28px). Low-contrast text below WCAG AA is systemic (`rgba(255,255,255,0.18–0.4)` for placeholders, secondary labels, and key reassurance copy). Focus outlines are globally stripped (`InstallScreen.css`), and animations ignore `prefers-reduced-motion`. *Why it matters: these compound outdoors, on phones, and for a meaningful slice of users — and they are cheap to fix in bulk.*

---

## 2. P0 — launch-embarrassing (fix before launch)

**1. Session detail crashes to a white screen on any reload or shared link.**
`SessionDetailScreen` · The `!session` branch renders `marginTop: headerTotalHeight + getGapAfterHeader()` — neither is defined/imported — throwing a ReferenceError during render. The screen only seeds `session` from `location.state`, which is null on hard reload/deep-link, so the crash fires for anyone reloading or opening a shared `/sessions/:id` URL. `handleExercisePress` also references an unimported `logger`, dead-tapping exercises offline.
*Fix:* remove the undefined expression (use a plain centered spinner), add a React Query fetch keyed on `sessionId` so the screen recovers its own data, and import the logger.
*File:* `apps/pwa/src/screens/SessionDetailScreen.js:164`

**2. Coaches are shown fabricated analytics.**
`ClientesScreen` (Asesorías) · `AsesoriaCard` generates a fake adherence sparkline with `Math.random()` whenever `adherenceHistory` is empty. Invented "engagement" data that looks real can drive real decisions about a client.
*Fix:* never synthesize data — render a flat/empty chart or `Sin datos suficientes` when history is missing.
*File:* `apps/creator-dashboard/src/screens/ClientesScreen.jsx:434`

**3. Progress photos are hard-deleted on a single unconfirmed tap.**
`LabScreen` (photo lightbox) · `onDelete` immediately rewrites the entry and calls `bodyProgressService.cleanupPhoto`, permanently removing the file from Storage. No confirm, no undo — one accidental tap loses a user's progress photo forever.
*Fix:* gate behind the tap-twice `¿Confirmar?` pattern already present in `BodyEntryModal`, and/or defer the Storage cleanup so it is undoable. Never hard-delete user media on one tap.
*File:* `apps/pwa/src/screens/LabScreen.web.js:3027`

**4. Account deletion is routed to a personal Gmail.**
Creator `ProfileScreen` · "Solicitar eliminación de cuenta" opens a `mailto:` hardcoded to `emilioloboguerrero@gmail.com`, and silently does nothing for users without a desktop mail client. A data-rights request going to a founder's personal inbox is both untrustworthy and a compliance liability. *(The same personal Gmail also ships as the payments/PQRS contact in `SubscriptionsScreen:658` and support contact in `SupportScreen.web.jsx:39` — treat as one fix.)*
*Fix:* route to a branded address (e.g. `soporte@wakelab.co`) or a real in-app endpoint; add a fallback message if the mail client doesn't open. Replace all three instances via one shared constant.
*File:* `apps/creator-dashboard/src/screens/ProfileScreen.jsx:597`

---

## 3. P1 — clearly hurts UX (grouped by theme)

### A. Silent failures & errors disguised as empty/waiting
- **Failed loads shown as "empty."** Add a distinct error+`Reintentar` state, separate from true-empty: `SessionsScreen.js:277` (looks like zero history), `ClientesScreen.jsx:1226` (empty on non-`clientes` tabs), `VideoExchangeThreadView.web.jsx:15` (masquerades as "en espera del coach"), `EventCheckinScreen.web.jsx:45` (transient blip → misleading "Acceso no autorizado").
- **Saves/uploads fail silently.** Surface a Spanish error toast and keep the surface open on failure: workout notes save (`WorkoutCompletionScreen.js:1524`), photo upload (`LabScreen.web.js:431`), weigh-in/goal save (`LabScreen.web.js:458`), nutrition autosave (`PlanEditorScreen.jsx:445`, `MealEditorScreen.jsx:183`), onboarding photo (`OnboardingEducation.web.jsx:483`).
- **Stuck / dead-end mutations.** `EventRegistrationsScreen.web.jsx:88` — no `onError`/`finally`, so buttons hang on "Registrando…" forever; wrap in try/catch/finally. `EventsManagementScreen.web.jsx:61` — clipboard failure still shows "✓ Copiado"; `:52` — optimistic status flip reverts with no explanation.
- **Wrong feedback on the wrong control.** `LoginScreen.js:471` — shared `isLoading` spins the email button when Google is tapped; track which action is in flight.
- **Dead-end error states with no retry** (refetch already exists): `ResourcesScreen.web.jsx:239`, `CourseStructureScreen.web.js:199`, `OneOnOneScreen.jsx:229`, `UpcomingCallDetailScreen.js:389`, `CreatorProfileScreen.js:1650`.

### B. Hidden / drag-only / broken-on-touch primary actions
- **Core action undiscoverable.** Surface an explicit `Empezar` affordance on the card front (`TodayWorkoutCard.web.jsx:678`, `DailyWorkoutScreen.js:821`).
- **Drag-only actions that fail on touch — add a click/`+` fallback.** Nutrition plan assignment (`ClientProgramScreen.jsx:1811`), add food/recipe to a plan (`PlanEditorScreen.jsx:988`), add session to a module (`LibraryModuleDetailScreen.jsx:438`).
- **No-op / dead controls shipped.** Implement or hide: dead "Filtrar" button (`ProgramLibraryScreen.js:618`), unreachable delete-option path (`PlanEditorScreen.jsx:1358`), orphaned duplicate screen with a guaranteed `showToast` ReferenceError (`ProgramsAndClientsScreen.jsx:898` — delete it).
- **Misleading affordances.** "Cambiar" (tarjeta) only reveals "you can't change it" text (`ProgramSubscriptionScreen.jsx:249`); email field is editable but silently dropped on save (`ProfileScreen.js:992`); "Verificar acceso" shown to non-owners on the buy page (`CourseDetailScreen.js:1726`).
- **Forgot-password hidden until a failed attempt** (`LoginScreen.js:505`); non-tappable legal text at sign-up (`:446`).

### C. Destructive actions & unsafe recovery
- **One-tap destructive, no confirm.** Client/invite removal (`ClientesScreen.jsx:1355`), un-publishing a live program (`GroupProgramView.jsx:373`).
- **Inverted friction / inconsistent confirms.** Type-the-name required for *reversible* detaches (`LibraryContentScreen.jsx:943`, `LibraryModuleDetailScreen.jsx:553`); native `window.confirm` vs custom modal for the same gesture (`BundleDetailScreen.jsx:245`).
- **Worst-case recovery.** `window.location.reload()` instead of `refetch()` on error (`ProgramasScreen.jsx:421`).
- **Silent value rejection.** Money fields snap back with no message when below a hidden floor (`GroupProgramView.jsx:187`).

### D. Copy not launch-ready
- **Grammatically wrong primary copy.** `NutritionScreen.web.jsx:2327` — "Proteína faltan" / "Grasa faltan" (singular noun + plural verb); reframe to "Te faltan…" / "Restante".
- **English leaks on shared/celebratory screens.** `WorkoutCompletionScreen.js:2102` (`Option 2 - Fullscreen`, `No muscle data available`), `CourseDetailScreen.js:1655` (`No media available`).
- **Voseo mid-funnel** → standardize on Colombian tuteo (`ProgramSubscriptionScreen.jsx`, `PaymentSuccessScreen.web.jsx`, `EmailLinkSignInScreen.web.jsx`).
- **Pervasive missing accents** across `ClientProgramScreen.jsx`, `EventsScreen.jsx`, `ProfileScreen.jsx`, etc. (`sesión`, `información`, `conexión`, `días`, `Sí`).
- **Contradictory instructions.** Nutrition empty state says "Asígnale uno desde Planificación" while the hint below says "Arrastra un plan desde el panel izquierdo" (`ClientProgramScreen.jsx:1872`).

### E. Onboarding & completion flow
- **Dead disabled CTAs with no reason.** `Continuar`/`Guardar` stay dim with no indication of the missing field (`OnboardingEducation.web.jsx:1127`, `LoginScreen.js:469`) — validate on press and highlight the offending field.
- **Fabricated ~4.9s completion delay that can hang** if the real save is slower than the animation (`OnboardingEducation.web.jsx:604`) — drive the transition off the actual save promise.

### F. Event check-in (door-side tool, both apps)
- **Camera dies after every scan**, forcing a tap + cold-start per attendee — impractical for a real line. Auto-resume scanning instead of returning to idle (`EventCheckinScreen.web.jsx:169`, `EventCheckinScreen.jsx:88`).
- **Silent camera-permission failure** (`EventCheckinScreen.web.jsx:109`) and **wrong "checked in at" time** — `new Date()` fallback shows the current moment, not the historical check-in (`:253`).

### G. Accessibility (P1-level)
- **Systemic low-contrast text** below AA — raise secondary text to ≥`rgba(255,255,255,0.55)` (`LabScreen.web.js:984`, `OnboardingEducation.css:443` placeholders at 0.18).
- **Focus outlines globally stripped** with no `:focus-visible` replacement (`InstallScreen.css:224`).
- **Sub-44px critical targets.** Monthly session dots at 18px (`MonthlyBlockCalendar.jsx:140`); event action buttons ~32px (`EventsManagementScreen.web.jsx:357`); destructive client delete at 28px (`ClientesScreen.jsx:202`).

### H. Consistency / correctness (creator)
- **Two parallel client-management systems** with divergent routes, layouts, and terminology (`OneOnOneScreen.jsx` vs `ClientScreen`/`ClientesScreen`) — consolidate onto one.
- **Hardcoded "Activo" pill for every client** regardless of real status (`OneOnOneScreen.jsx:269`).
- **Default dashboard tab chosen from optimistic pre-fetch flags, never reconciled** — single-mode coaches land on the wrong empty dashboard (`DashboardScreen.jsx:53`).
- **"Cancelar" that doesn't cancel** — name edit persists anyway (`MealEditorScreen.jsx:705`).
- **Completed courses silently vanish** — category computed but never rendered (`AllPurchasedCoursesScreen.js:181`).
- **Mandatory pre-cancellation survey** gating a legally-sensitive action (`SubscriptionsScreen.js:357`) — make it optional, matching `ProgramSubscriptionScreen`.

---

## 4. P2 — polish (condensed)

- **Remove shipped placeholders / dead UI:** "Próximamente" share card (`WorkoutCompletionScreen.js:1880`), unreachable info modal (`SubscriptionsScreen.js:801`), dead `MediaPickerModal` (`MealEditorScreen.jsx:712`), vestigial swipe-to-modules code (`ProgramLibraryScreen.js:393`).
- **Off-system styling:** iOS-blue `#007AFF` CTAs on error screens (`WarmupScreen`, `BundleDetailScreen`, `CourseDetailScreen.web.js`) — restyle to the white-on-dark system; legacy white-glow cards in the PRs/Volume family clash with Lab's glass cards.
- **No-op / broken animations:** `fadeUp` keyframe never defined so entrance never plays (`PaymentSuccessScreen`, `PaymentCancelledScreen`); infinite pulse/aurora loops ignore `prefers-reduced-motion` (`HoyEmptyState`, `AuroraBackground`); invisible drag preview (`NutritionWeeksGrid.jsx:120`).
- **Redundant / confusing confirmations:** double confirmation modal on finishing a workout (`WorkoutExecutionScreen.js:4269`); leaked debug string "Ejercicios: 0" (`:5485`).
- **Terminology drift:** `Módulo` vs `Semana` (library); `Plan` vs `Programa` (nutrition); "Gestionar" vs "Gestionar suscripción"; three names for 1:1 across nav/title/tabs.
- **Status treatment inconsistency:** saturated badges vs white dots for identical subscription statuses (`SubscriptionsScreen` vs `ProgramSubscriptionScreen`); local per-screen toasts vs global `ToastContext` (`MiHorarioView`, `ProximasLlamadasView`).
- **No positive save confirmation** on autosave-heavy money/config screens (`GroupProgramView`, `PlanEditorScreen`, `NutritionProgramEditorScreen`) — add a subtle "Guardando…/Guardado" chip.
- **Alignment / layout nits:** Lab title indent vs 24px content margin (`LabScreen.web.js:2918`); "Todos mis programas" title `marginLeft` vs card gutter + duplicate `courseTitle` style (`AllPurchasedCoursesScreen.js`).
- **Overlays not back/Escape-dismissable, no focus trap:** PDF/YouTube overlays (`ResourcesScreen`), install guide modals (`InstallScreen`), `RowModal` (`EventRegistrationsScreen`).
- **Thin/unscannable rows & fixed-height cards:** PR rows show name only, no value/chevron (`PRsScreen`); fixed `height:600` swipe cards (`ExerciseDetailContent`); `getItemLayout` fights variable-height note cards (`SessionsScreen.js:319`).
- **Cognitive overload:** 13-control profile settings modal with destructive actions inline (`ProfileScreen.js`); 15+ card flat config bento (`GroupProgramView.jsx:565`) — group under labelled sections / "Avanzado".
- **Misleading error copy:** "Puede que haya sido eliminado" on transient 500s (`ProgramDetailScreen.jsx:55`); "El enlace expiró. Pedí uno nuevo desde /acceso" exposes a raw path.
- **Invented fallback targets** scored as real goals when a plan has no macros set (`HoyScreen.web.jsx:504`).

---

## 5. Quick wins — do these first (highest impact / lowest effort)

1. **Kill the personal Gmail everywhere.** Replace all three (`SubscriptionsScreen`, `SupportScreen`, creator `ProfileScreen`) with one branded `SUPPORT_EMAIL` constant, e.g. `soporte@wakelab.co`. Trivial edit, large trust gain.
2. **Delete English/dev leaks.** Remove `Option 2 - Fullscreen` and the "Próximamente" share card (`WorkoutCompletionScreen`); translate `No muscle data available`→`Sin datos musculares`, `No media available`→`Sin contenido`.
3. **Fix the two humiliating typos.** `anos`→`años` (`CompleteProfileScreen.jsx:146`) and `Si`→`Sí` on the delete confirm (`PlanEditorScreen.jsx:1085`).
4. **Fix the macro header grammar** — "Proteína faltan" → "Restante" / "Te faltan 40 g" (`NutritionScreen.web.jsx:2218/2327`). It is the largest copy on the screen.
5. **Add a confirm to the progress-photo delete** by reusing the existing tap-twice pattern (`LabScreen.web.js:3027`). Prevents irreversible data loss with a few lines.
6. **Delete the orphaned `ProgramsAndClientsScreen.jsx`** — dead duplicate that would white-screen on a `showToast` ReferenceError if ever routed.
7. **Kill the leaked debug string** "Ejercicios: 0" (`WorkoutExecutionScreen.js:5485`) — replace with a helpful Spanish message.
8. **Add `Reintentar` to the no-retry error states** that already expose `refetch` (`ResourcesScreen`, `SessionsScreen`, `OneOnOneScreen`, `UpcomingCallDetailScreen`) — one shared error component, several dead ends closed.
9. **Hide or rename the two mislabeled controls** — hide the dead "Filtrar" button (`ProgramLibraryScreen`), rename `Filtrar`→`Ordenar` where the panel only sorts (`BibliotecaScreen`).
10. **Fix the wrong check-in timestamp** — parse `new Date(ts)` instead of falling back to `new Date()` (`EventCheckinScreen.web.jsx:253`), so "Entró a las HH:MM" is truthful.

*Two slightly larger but high-leverage follow-ups: (a) add a shared error+retry state so failed loads stop masquerading as empty across `SessionsScreen`/`ClientesScreen`/`VideoExchange`/`EventCheckin`; (b) make the event-check-in camera stay live and auto-resume — it is the least door-ready screen and used in front of real people.*