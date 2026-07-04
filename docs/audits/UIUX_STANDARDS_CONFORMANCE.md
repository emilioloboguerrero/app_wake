# Wake — STANDARDS.md Conformance Audit (Consolidated)

**Scope:** 159 deviations across ~50 screens in three apps (PWA, creator-dashboard, landing not audited) plus their CSS, verified against `docs/STANDARDS.md` and the brand feedback rules.

**Severity split:** 6 P0 · 60 P1 · 93 P2.

A single root cause dominates: legacy React-Native `StyleSheet` screens and older creator CSS predate the white-at-opacity + single-runtime-accent system and still carry hardcoded brand/semantic colors, opaque grey surfaces, and system fonts. The `.web.js`/`.web.jsx` router wrappers are thin — nearly every finding lives in the base `.js` component or the imported `.css`.

---

## 1. Executive Summary — Systemic Gaps

These rules are violated repeatedly, not as one-offs. Ordered by breadth and severity.

### G1 — Hardcoded brand/semantic color (the dominant violation)
> §2: "One accent extracted at runtime, not hardcoded. **No fallback brand color.**" · "screens without an image use white tones only."

Three distinct hardcoded palettes recur across **20+ screens**:
- **iOS system blue `#007AFF`** as the primary-action color: `DailyWorkoutScreen` (start button, badges, exercise bubbles, progress bar — 7 occurrences), `ProgramLibraryScreen`, `WarmupScreen`, `CourseStructureScreen`, `CourseDetailScreen`, `BundleDetailScreen`, `CreatorProfileScreen`.
- **Brand pink `rgba(255,87,168,X)`** painting entire imageless onboarding screens: `OnboardingEducation` (Aurora canvas + generated SVG scene + CSS CTA/pills/glow/rings) and `CompleteProfileScreen`'s `AuroraBackground`.
- **Traffic-light / green-red semantic chroma** on imageless screens: `SubscriptionsScreen` (`#f1c40f/#2ecc71/#3498db/#e67e22/#e74c3c`), plus `#4ade80`/`#f87171` greens & reds across every event screen (`EventsManagement`, `EventRegistrations`, `EventCheckin`, `EventResults`), `SessionsScreen`, `AllPurchasedCoursesScreen`, `LabScreen`, creator `NutritionScreen`, `ProgramsAndClientsScreen`, `BundleDetailScreen`.
- **Residual gold/amber `rgba(234,179,8)`** in `LibrarySessionDetailScreen` and `BibliotecaScreen` — the exact class of dead brand token the removed gold `#BFA84D` represented.

### G2 — Opaque grey surfaces instead of glass
> §2/§8: surfaces are glass `rgba(255,255,255,0.06–0.07)` + 1px `rgba(255,255,255,0.06)` rim on the single `#1a1a1a` canvas.

Solid `#2a2a2a` (and `#3a3a3a`, `#1e1e1e`, `#222`, `#0f0f0f`, `#1f1f1f`) fills used for cards, modals, sheets, and stat tiles across **~20 screens**: all four workout screens, `LabScreen`, `PRsScreen`, `WeeklyVolumeHistoryScreen`, `SubscriptionsScreen`, `ProfileScreen`, `CreatorProfileScreen`, `ProgramLibraryScreen`, all three event screens, `CourseStructureScreen`, `SessionsScreen`, `SessionDetailScreen`, `OneOnOneScreen`, `ClientProgramScreen`, plus creator popover/tooltip surfaces (`rgba(30,30,30,0.98)`). A recurring off-palette blue-grey close button `#44454B` appears in `PRsScreen`, `WeeklyVolumeHistoryScreen`, `SubscriptionsScreen`, `CreatorProfileScreen`.

### G3 — Error red drifts off the one sanctioned token
> §2/§9: "Error color is `rgba(224,84,84,0.9)`."

At least **eight** competing reds in place of the token: `#ff6b6b`/`#FF6B6B`, `#dc3545`, `#e57373`, `#ef4444`, `#f87171`, `rgba(255,68,68)`, `rgba(239,68,68)`, `rgba(255,80,80)`, `#F44336`, `#c0392b`, `rgba(255,115,100)`. Spans `CourseStructure`, `CreatorProfile`, `ProfileScreen`, `Login`, `EmailLinkSignIn`, `PaymentSuccess`, `ProgramSubscription`, and most creator library/nutrition/event CSS. Both global `--error` tokens (creator `rgba(239,68,68,0.9)`) themselves diverge from spec.

### G4 — Entrances missing, fade-only, or non-spring
> §5: "Every element entering the screen animates in — never just appears. **Always fade + translate.**" spring `cubic-bezier(0.22,1,0.36,1)`, 0.42–0.5s.

Zero-entrance screens: `EmailLinkSignIn`, `BundleDetailScreen`, `EventsManagementScreen`, `EventRegistrationsScreen`, `PRsScreen`, `WeeklyVolumeHistoryScreen`. **Undefined `fadeUp` keyframe** silently no-ops the card entrance on both `PaymentSuccessScreen` and `PaymentCancelledScreen`. Non-spring `Animated.timing` (RN default ease-in-out) on Hoy, Login, Nutrition, ProgramLibrary, Profile entrances. Sub-window durations: `cardEntranceAnim` 180ms, `prEntranceAnim` 230ms, `profileEntranceAnim` 220ms, creator sidebar 120ms, `cl-card` 0.22s.

### G5 — Spinner wheel instead of WakeLoader
> §6: the loading affordance is the WakeLoader shimmer, "explicitly not a spinner wheel."

Rotating border spinners in `EmailLinkSignIn` (`wake-spin`), `PaymentSuccessScreen` (`pp-spin`, linear), `EventCheckinScreen` (`pwaEcSpin`, linear), `ProgramDetailScreen` (`program-detail-migrating-spin`, linear).

### G6 — Empty states carry banned explanatory subtext
> feedback_no_subtext: empty/hero states are **headline + CTA only**.

Secondary subtext lines in `PRsScreen`, `WeeklyVolumeHistoryScreen`, `SubscriptionsScreen`, `OnboardingEducation` (completion hero), `EventsManagementScreen`, `ClientesScreen` (×3), `OneOnOneScreen`, `ProgramasScreen` (×2), `ProgramsAndClientsScreen` (×2), `EventsScreen`, `ApiKeysScreen`.

### G7 — Headings under weight, system fonts, boxed inputs
> §9: headings 700–800, font `'Inter'`. §8: inputs underline-only.

`fontWeight: 600` titles on 9 screens (PRs, WeeklyVolume, CourseStructure, Sessions, SessionDetail, AllPurchasedCourses, EventsManagement, EventRegistrations, EventCheckin). System font stack instead of Inter in `EmailLinkSignIn`, `VideoExchangeStandaloneScreen`, `ClientProgramScreen.css` (×6), `LibrarySessionDetailScreen.css` (×17), `MealEditorScreen.css`. Boxed inputs instead of `border-bottom:2px rgba(255,255,255,0.18)` in `Login`, `EmailLinkSignIn`, `OnboardingEducation`, creator `ProfileScreen`.

### G8 — White-glow card shadow inverted
> §8: shadows are deep dark layers `0 32px 80px rgba(0,0,0,0.65), 0 8px 24px rgba(0,0,0,0.4)` + 1px `rgba(255,255,255,0.06)` rim.

Inverted `shadowColor:'rgba(255,255,255,0.4)'` white halos on `PRsScreen`, `CourseStructureScreen`, `SessionsScreen`, `SessionDetailScreen`, `SubscriptionsScreen`, `ProfileScreen`, `ProgramLibraryScreen`. Single-layer or missing shadows on creator `BundleDetail` (none), `lab-card`, `nutricion-card`, `EventsManagement` (none).

### G9 — Emojis as load-bearing UI
> brand: never use emojis in UI.

`NutritionScreen.web.jsx` (PWA) tiles food emojis (🥚🍗🥩🧀🥑, fallback 🍽️) as meal imagery; `LabScreen` renders a `⚠` warning glyph; creator `EventResultsScreen` embeds a `✓` dingbat in a badge label.

---

## 2. P0 Deviations (flagrant, most-severe first)

| # | Screen · Rule | What it does instead | Fix | File |
|---|---|---|---|---|
| 1 | **DailyWorkout** · §2 single runtime accent, no hardcoded brand color | Hardcodes iOS blue `#007AFF` as the primary action color everywhere: course badge, exercise-number bubble, `Empezar` start button, next-workout button, progress-bar fill, progress `%` text. Renders blue regardless of the extracted accent. | Drive primary buttons/badges/progress from `var(--accent)` / white tones; delete all `#007AFF` (lines 1224, 1266, 1700, 1769, 1819, 1847, 1859). | `apps/pwa/src/screens/DailyWorkoutScreen.js:1769` |
| 2 | **OnboardingEducation (CSS)** · §8/§2 accent-driven surfaces from runtime accent | Primary CTA, done CTA, photo glow, input focus, gender-pill active, section divider, loading pulse-ring all hardcode `rgba(255,87,168,X)` pink on an imageless screen. | Recolor every interactive/accent surface to white-at-opacity per §8 (white key-target primary, not a pink glass button). | `apps/pwa/src/screens/onboarding/education/OnboardingEducation.css:79` |
| 3 | **OnboardingEducation (SVG scene)** · §2 no hardcoded accent; imageless → white only | Entire generated SVG scene hardcodes pink: figures `fill="rgba(255,87,168,1)"`, connections, pulse waves, particles, progress dots `rgba(255,87,168,0.5)`, completion check `rgba(255,87,168,0.9)` — dozens of occurrences. | Replace every `rgba(255,87,168,X)` with `rgba(255,255,255,X)`. | `apps/pwa/src/screens/onboarding/education/OnboardingEducation.web.jsx:113` |
| 4 | **OnboardingEducation (Aurora bg)** · §2 imageless → white tones only | All three ambient blobs `color:[255,87,168]`, painting the whole screen pink. | Drive blobs from white pools `rgba(255,255,255,0.06)` per §4 orbs. | `apps/pwa/src/screens/onboarding/education/components/AuroraBackground.jsx:28` |
| 5 | **SubscriptionsScreen** · §2 status by opacity, not chroma; no fallback brand color | `statusColors` hardcodes a traffic-light palette: pending `#f1c40f`, active `#2ecc71`, trialing `#3498db`, paused `#e67e22`, cancelled `#e74c3c` as colored badges on an imageless screen — while its own web sibling `ProgramSubscriptionScreen.web.jsx` already migrated this exact concept to white-opacity tones. | Replace the chroma map with white-at-opacity tones (active `rgba(255,255,255,0.85)`, cancelled `rgba(255,255,255,0.35)`) exactly as the sibling does. | `apps/pwa/src/screens/SubscriptionsScreen.js:42` |
| 6 | **ProgramLibraryScreen** · §2 single accent, no hardcoded brand color | iOS blue `#007AFF` across the modules view: module-number badge, discipline badge, difficulty text, `#007AFF20` tint, modules button. | Use runtime `--accent` (from course image) or white-at-opacity tokens for badges/buttons; remove all blue. | `apps/pwa/src/screens/ProgramLibraryScreen.js:1403` |

---

## 3. P1 Deviations (grouped by rule)

### §2 — Hardcoded brand/semantic color
- **WarmupScreen** — error-fallback button `backgroundColor:'#007AFF'`. Use white primary `#fff`/`#111`. `apps/pwa/src/screens/WarmupScreen.web.js:83`
- **CourseStructureScreen** — non-cadenced retry button `#007AFF`. Use glass/secondary or `var(--accent)`. `CourseStructureScreen.js:115`
- **CourseDetailScreen** — not-found button `#007AFF`. White primary or glass. `CourseDetailScreen.web.js:135`
- **BundleDetailScreen (PWA)** — error-state `primaryBtn` `#007AFF`. White primary/glass. `BundleDetailScreen.web.jsx:393`
- **CreatorProfileScreen (wrapper)** — error `Volver` button `#007AFF` on a solid `#1a1a1a` block. Glass/primary per §8. `CreatorProfileScreen.web.js:37`
- **SessionsScreen** — trend indicators green `#4ade80` / red `#f87171` on an imageless screen. Express up/down with white-opacity tones. `SessionsScreen.js:515`
- **AllPurchasedCoursesScreen** — `Asignado` badge green `rgba(52,199,89,X)`. White chip. `AllPurchasedCoursesScreen.js:339`
- **UpcomingCallDetailScreen** — join CTA pulse `'--accent':'rgb(74,222,128)'` + copy-success `rgba(34,197,94,1)`. Drive from course-image accent; white tones for copied state. `UpcomingCallDetailScreen.js:482`
- **SubscriptionsScreen** — destructive confirm button `#c0392b`. White-tone treatment (`rgba(255,255,255,0.12)` + white text). `SubscriptionsScreen.js:1200`
- **LabScreen** — accent is a hardcoded readiness-keyed RGB triple (`[80,200,120]`/`[160,180,220]`/`[200,80,80]`, fallback `[120,140,180]`) driving orbs/glows/bars, plus a semantic chart palette `#4ade80`/`#f87171`/`#60a5fa`/`#a78bfa`/`#ff6b6b`. Lab has no image → white tones only. `LabScreen.web.js:2160` & `:137`
- **EventsManagementScreen** — status + copied-state green `#4ade80`/`rgba(74,222,128,X)`. White-tone weight/opacity. `EventsManagementScreen.web.jsx:12`
- **CompleteProfileScreen** — `AuroraBackground` hardcoded pink `[255,87,168]` on imageless screen. White ambient light. `onboarding/components/AuroraBackground.jsx:22`
- **EventCheckinScreen (creator)** — success ring + tick `#4ade80`. Stroke in white tones or `var(--ec-accent)`. `EventCheckinScreen.css:216`
- **BundleDetailScreen (creator)** — decorative categorization palette: otp blue `rgba(170,220,255,0.92)`, sub/bundle purple `rgba(200,180,255,0.9)`, draft amber, published green. Collapse to white-opacity + label. `BundleDetailScreen.css:267`
- **ProgramDetailScreen (creator)** — Material `#4CAF50`/`#F44336` deltas + ad-hoc reds `#FF6B6B/#ff4444/#e57373` + `#666`. White tones + arrow glyph; error via token. `ProgramDetailScreen.css:6770`
- **NutritionScreen (creator)** — macro rings/dots green `rgba(100,200,150,0.85)`, blue `rgba(100,160,240,0.85)`, orange `rgba(240,160,80,0.85)` on imageless screen. White-opacity tones differentiated by label. `NutritionScreen.jsx:575` (+ `.css:698-700`)
- **LibrarySessionDetailScreen** — persistent gold/amber `rgba(234,179,8,X)` client-edit banner, "Solo para" banner, and "Propagar cambios" CTA. White-at-opacity or `var(--accent-*)`. `LibrarySessionDetailScreen.css:30`

### §2/§8 — Opaque grey surfaces vs glass
- **DailyWorkoutScreen** — navy fallback `#1a1a2e` (not `#1a1a1a`), blue muscle text `#4A90E2`, orange implement `#F39C12`, red `#ff6b6b`, solid `#2a2a2a/#3a3a3a/#555555` fills. `DailyWorkoutScreen.js:1756`/`:1970`
- **WorkoutCompletionScreen** — `#2a2a2a` cards, `#44454B` close buttons, `#cccccc` loading text. `WorkoutCompletionScreen.js:765`
- **WorkoutExecutionScreen** — RPE choice cards `#3a3a3a` instead of choice-pill glass. `WorkoutExecutionScreen.js:6806`
- **LabScreen** — `card` + tooltips `#2a2a2a`. `LabScreen.web.js:3057`/`:1269`/`:2721`
- **PRsScreen** — `#2a2a2a` cards/search/modal + `#44454B` close. `PRsScreen.js:402`
- **WeeklyVolumeHistoryScreen** — modal `#2a2a2a` + `#44454B` close. `WeeklyVolumeHistoryScreen.js:456`
- **SubscriptionsScreen** — all cards/modals `#2a2a2a` (7 surfaces). `SubscriptionsScreen.js:917`
- **ProfileScreen** — `userProfileCard` + ~20 section cards `#2a2a2a` + white-glow shadow. `ProfileScreen.js:1751`
- **CreatorProfileScreen** — `#2a2a2a`×13, `#44454B`×4, `#3a3a3a`×3 fills; `heroContainer` `#1f1f1f` (not `#1a1a1a`). `CreatorProfileScreen.js:2316`/`:2200`
- **ProgramLibraryScreen** — `moduleCard` `#2a2a2a`, `#555555` placeholders. `ProgramLibraryScreen.js:1331`
- **EventsManagementScreen** — event cards `#2a2a2a`. `EventsManagementScreen.web.jsx:262`
- **EventRegistrationsScreen** — row-detail modal `#2a2a2a` (no slide-in) + stat tiles `#2a2a2a`. `EventRegistrationsScreen.web.jsx:217`/`:629`
- **OneOnOneScreen** — sidebar/rows/panel opaque `#222/#2a2a2a/#333` via `--surface-*` tokens. `OneOnOneScreen.css:21`

### §2 — Error color `rgba(224,84,84,0.9)`
- **CourseStructureScreen** `#ff6b6b` → token. `CourseStructureScreen.js:109`
- **CreatorProfileScreen** `programsErrorText` `#ff6b6b` → token. `CreatorProfileScreen.js:2811`
- **ProfileScreen** delete-account modal `#dc3545` (×5) → token. `ProfileScreen.js:2192`

### §5 — Missing / broken entrances
- **EmailLinkSignInScreen** — card/title/message/form/button render statically. Add fade + translateY(24px) 0.42–0.5s spring. `EmailLinkSignInScreen.web.jsx:188`
- **BundleDetailScreen (PWA)** — zero entrance on hero/title/list/price. Add enterUp + cardExpand + 50–150ms stagger. `BundleDetailScreen.web.jsx:148`
- **PaymentSuccessScreen** — `animation:'fadeUp …'` references an **undefined** keyframe (only `pp-spin` defined); entrance no-ops. Add `@keyframes fadeUp`. `PaymentSuccessScreen.web.jsx:412`
- **PaymentCancelledScreen** — same undefined `fadeUp`; file has no `<style>` block at all. Inject the keyframe. `PaymentCancelledScreen.web.jsx:56`
- **EventsManagementScreen** — no keyframes/animation anywhere. Add staggered cardExpand/enterUp. `EventsManagementScreen.web.jsx:119`
- **EventRegistrationsScreen** — no entrance on stats/rows/waitlist/modal. Add staggered enterUp. `EventRegistrationsScreen.web.jsx:513`

### §6 — Loading affordance
- **EmailLinkSignInScreen** — rotating border spinner (`wake-spin`). Use WakeLoader shimmer. `EmailLinkSignInScreen.web.jsx:251`
- **EventCheckinScreen (PWA)** — `pwaEcSpin` linear rotating spinner. Use WakeLoader. `EventCheckinScreen.web.jsx:658`

### §5/§7 — Completion choreography
- **EventCheckinScreen (PWA)** — success/result swaps in with no entrance; checkmark drawn statically (`strokeDashoffset="0"`). Animate circle 146→0 then tick 40→0 + text cascade. `EventCheckinScreen.web.jsx:336`

### §8 — Card shadow / rim
- **EventsManagementScreen** — card has only a 1px border, no box-shadow. Add the three-layer shadow. `EventsManagementScreen.web.jsx:261`
- **BundleDetailScreen (creator)** — `.bds-card` has zero box-shadow (border only). Add the standard three-layer shadow. `BundleDetailScreen.css:162`

### §8 — Input fields underline-only
- **LoginScreen** — filled boxes `#2a2a2a` / `#333`, `borderRadius:12`. Convert to transparent underline-only (`borderBottom:2px rgba(255,255,255,0.18)`). `LoginScreen.js:598`

### §1/§2 — One canvas `#1a1a1a`
- **InstallScreen** — root is a 4-stop off-canvas gradient `#161616/#181818/#1a1a1a/#141414`. Set `background:#1a1a1a`; express depth via existing radial layers. `InstallScreen.css:19`

### §9 — Inter font
- **EmailLinkSignInScreen** — system stack `-apple-system, …`. Set `'Inter', sans-serif`. `EmailLinkSignInScreen.web.jsx:244`
- **MealEditorScreen** — 42px calories value overrides Inter with system stack. Remove the override. `MealEditorScreen.css:65`

### feedback_no_subtext — Empty-state subtext
- **PRsScreen** — "Completa entrenamientos para empezar…" second line. `PRsScreen.js:251`
- **WeeklyVolumeHistoryScreen** — "Completa algunos entrenamientos para ver tu historial…". `WeeklyVolumeHistoryScreen.js:174`
- **ClientesScreen** — `cl-empty__sub` (EmptyClients, EmptyAsesorias, Anteriores). `ClientesScreen.jsx:594`
- **OneOnOneScreen** — `one-on-one-main-empty-desc`. `OneOnOneScreen.jsx:287`
- **ProgramasScreen** — `pgs-empty__sub` on both tabs (also a fade-only `TextAnimate`). `ProgramasScreen.jsx:433`
- **ProgramsAndClientsScreen** — `clientes-empty-state__body` + `profile-placeholder__sub`. `ProgramsAndClientsScreen.jsx:144`/`:1089`
- **EventsScreen** — `es-empty-sub` block. `EventsScreen.jsx:633`

### Brand — no emoji
- **NutritionScreen (PWA)** — `EMOJI_PATTERNS` food-emoji system + `getFoodEmoji` `🍽️` fallback tiled as meal imagery. Replace with the imported SVG icon set / white-tone visuals. `NutritionScreen.web.jsx:306`

---

## 4. P2 Deviations (condensed by pattern)

**Off-palette error red → `rgba(224,84,84,0.9)`:** Login `#FF6B6B`, EmailLinkSignIn `#ff6b6b`, PaymentSuccess `#ff6b6b`, ProgramSubscription `#ff6b6b`, ClientProgram `#e57373`/`#FF6B6B`, Clientes filter badge `#ef4444`, Dashboard tooltip `rgba(255,115,100,0.9)`, ProgramsAndClients `rgba(248,113,113,X)`, library CSS (`rgba(255,80,80)`, `#ef4444`, `#e57373`, `rgba(255,68,68)`, `rgba(255,107,107)` — 6 divergent values), NutritionScreen delta badges, PlanDetail `rgba(255,68,68,0.8)`, MealEditor (`#ff4444`, `rgba(220,38,38)`, `rgba(220,80,80)` — 3 values), EventEditor `#f87171`, EventRegistrations `rgba(239,68,68,X)`, EventCheckin error `rgba(248,113,113,0.9)`.

**Semantic status chroma (green/amber/red) → white-opacity tiers:** NutritionScreen banner colors + delta badges, ProgramsAndClients status dots, EventResults check-in/no-show/bar fills (`#4ade80/#facc15/#f87171`), EventRegistrations check-in badge `#4ade80`, EventCheckin success mark `#4ade80` / error `rgba(248,113,113)`, Programas published badge `rgba(120,220,150,0.12)`, Clientes status dot `rgba(74,222,128,0.9)`, LibraryExercises success check `rgba(74,222,128)`, CreatorProfile unread badge `#ef4444`.

**Opaque grey text `#cccccc`/`#999999`/`#bbbbbb` → `rgba(255,255,255,0.5)`/`0.25`:** WeeklyVolume, CourseStructure, AllPurchasedCourses, Login (`#999` placeholder, `#cccccc`, `#666666` disabled), SubscriptionsScreen (`#cccccc`/`#999999`/`#bbbbbb`), ProfileScreen (`#999999`×13, `#cccccc`×7), ProgramLibrary.

**Opaque grey surfaces (secondary):** BundleDetail (PWA) modal `#222`, ProgramSubscription `#0f0f0f` hero backing, ClientProgram modal `#1e1e1e`, ProgramDetail dropdown `#1e1e1e`, PlanEditor `<option>` `#222`/`#eee`, creator popovers `rgba(30,30,30,0.98)` / `rgba(28,28,28,0.97)`, CreatorProfile chart `#2a2a2a`, Install overlays `#000`/`#0d0d0d`/`rgba(30,30,30,0.95)`, SubscriptionsScreen close `#44454B`, creator ProfileScreen boxed inputs `#2a2a2a`.

**White-glow card shadow → dark 3-layer + rim:** PRsScreen, CourseStructure, Sessions, SessionDetail, SubscriptionsScreen, ProgramLibrary; single-layer `0 4px 24px rgba(0,0,0,0.3)` on creator `lab-card` / `nutricion-card` / ClientProgram lab cards.

**Heading weight 600 → 700–800:** PRsScreen, WeeklyVolume, CourseStructure (also base `courseTitle`), Sessions, SessionDetail, AllPurchasedCourses, EventsManagement, EventRegistrations, EventCheckin.

**System font stack → Inter:** VideoExchangeStandalone, ClientProgram.css (×6 containers), LibrarySessionDetail.css (×17 rules).

**Boxed inputs → underline-only:** EmailLinkSignIn, OnboardingEducation `.pwa-ob-input`, creator ProfileScreen (`--surface-3 #2a2a2a`).

**Non-spring / sub-window entrance timing:** Hoy `greetAnim`+`cardEntranceAnim` (180ms, 12px travel), WorkoutCompletion `prEntranceAnim` (230ms), Nutrition `Animated.timing` (no easing), Login mount timings, ProgramLibrary (420ms no easing), Profile `profileEntranceAnim` (220ms), UpcomingCallDetail cards, OnboardingEducation fade-only back button + done message, OneOnOne sidebar (120ms), Clientes `cl-card` (0.22s), BundleDetail (creator) root travels only 8px, LibrarySessionDetail `lsdFadeIn` fade-only, editor screens (MealEditor/PlanEditor/NutritionProgramEditor) content pops in with no entrance, ProgramSubscription card/modal no entrance, UpcomingCallDetail default easing.

**Spinner-wheel loaders → WakeLoader:** PaymentSuccess (`pp-spin`), ProgramDetail (`program-detail-migrating-spin`). **Plain-text/bare loaders → ShimmerSkeleton:** LibraryContent ("Cargando semanas/sesiones/ejercicios…"). **Bare `<p>` empty states → icon+CTA pattern:** LibraryContent renderSessions/renderExercises.

**Emoji / dingbat glyphs:** LabScreen `⚠`, EventResults `✓` in badge text.

**Motion-spec misses:** EventsManagement capacity bar `width 0.3s ease` (should be `0.6s cubic-bezier(0.4,0,0.2,1)`); EventsScreen skeleton shimmer `linear` (should be ease-in-out); EventCheckin ambient orbs (2 white static orbs, blur 80 vs §4's 3 accent orbs blur 72 drift) and accent-text hardcoded `#111` (should compute `--accent-text` from luminance).

**Accent not extracted despite content image:** BundleDetailScreen (PWA) shows a `BundleCover` but uses a fixed white CTA with no `--accent`/glow.

**Naming debt:** UpcomingCallDetail module constants `GOLD_ACCENT`/`GOLD_ACCENT_15/25` perpetuate the removed gold token (values are actually white) — rename. AllPurchasedCourses `getStatusBadge` dead code with off-palette `#28a745/#6f42c1/#dc3545` — delete.

---

## 5. Fully Conformant — Reference Examples to Copy

These files passed with **zero findings** and should be the templates for remediation:

- **`apps/pwa/src/screens/ResourcesScreen.web.jsx`** — the gold-standard reference: correct SPRING constant `cubic-bezier(0.22,1,0.36,1)`, exact error color `rgba(224,84,84,0.9)`, fade+translateX page entrance (`wake-screen-enter`→`wScreenEnterRight`), headline-only empty state. Copy its entrance + error + empty-state patterns.
- **`apps/pwa/src/screens/SupportScreen.web.jsx`** (+ the `VideoExchangeThreadView` it renders) — correct `#1a1a1a` canvas, white-at-opacity palette, opaque-white reserved for the single critical WhatsApp CTA, proper `.wake-screen-enter` spring entrance.
- **`apps/pwa/src/screens/PRDetailScreen.js`** — clean thin wrapper over `ExerciseDetailContent`; only `#1a1a1a`/`#ffffff`.
- **`apps/creator-dashboard/src/screens/ClientScreen.jsx` / `.css`** — essentially clean; correct accent extraction, spring entrances, glass surfaces.
- **`apps/creator-dashboard/src/screens/PlanSessionDetailScreen`** — clean.
- **`apps/creator-dashboard/src/screens/AvailabilityCalendarScreen` / `AvailabilityDayScreen`** and the creator **`LoginScreen`** — clean.

**Near-reference (system is right, copy the approach):**
- **`ProgramSubscriptionScreen.web.jsx`** — explicitly opted into white-tone opacity per STANDARDS (its `statusColors` at L18–28 is the correct migration `SubscriptionsScreen.js` should mirror); only trivial P2s (`#0f0f0f` backing, `#ff6b6b`).
- **`HoyScreen.web.jsx`** — the canonical per-card runtime-accent + glass-banner implementation on the `#1a1a1a` canvas; only minor easing P2s.
- **`LibrarySessionDetailScreen`** — the correct runtime accent wiring (`extractAccentFromImage`→`--accent-r/g/b`) to copy for any screen with a content image (despite its amber P1 and font P2s).

**Highest-leverage systemic fixes:** (1) redefine the creator `index.css` `--surface-1/2/3` tokens from solid greys to `rgba(255,255,255,0.03–0.07)` and the `--error` token to `rgba(224,84,84,0.9)` — this resolves a large share of G2/G3 findings at the source; (2) sweep `#007AFF` and `rgba(255,87,168,X)` to zero across the PWA; (3) add the missing `@keyframes fadeUp` shared by both payment screens.