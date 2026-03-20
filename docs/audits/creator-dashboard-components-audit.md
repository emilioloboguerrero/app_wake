# Creator Dashboard -- Components & Utils Audit

**Date:** 2026-03-20
**Scope:** `apps/creator-dashboard/src/components/`, `utils/`, `config/`
**Auditor:** Claude (automated)

## Executive Summary

Audited 42 JSX/JS source files and 39 CSS files across components, utils, and config directories. Found 54 issues total: 2 CRITICAL, 5 HIGH, 18 MEDIUM, 18 LOW, and 11 INFO.

Key concerns:
- XSS risk via `dangerouslySetInnerHTML` in `SvgIcon.jsx` with bypassable sanitization
- Banned gold color `#BFA84D` used in `ErrorBoundary.jsx` fallback
- Syntax error in `PlanningSidebar.jsx` (JSX outside return boundary)
- Multiple dead/unused components and a template file never imported
- `console.error` used directly in 10+ component files instead of `logger.error`
- Empty `useEffect` and polling interval that does nothing in `CalendarView` / `PaymentModal`

## Findings

### components/SvgIcon.jsx

| Severity | Location | Issue | Suggested Fix |
|----------|----------|-------|---------------|
| ✅ CRITICAL | file:29 | `dangerouslySetInnerHTML={{ __html: svgWithColor }}` used to render user-provided SVG strings. The `sanitizeSvg` function uses regex to strip `<script>` tags and event handlers, but regex-based sanitization is inherently bypassable (e.g., nested tags, encoding tricks, `<svg onload=...>`). This is an XSS vector if SVG content comes from user input or Firestore. | Use DOMPurify or a proper HTML sanitizer library, or render SVG via a safer approach (e.g., parse and reconstruct with allowed elements only). |
| ✅ MEDIUM | file:14 | `svgWithColor` replaces `stroke="currentColor"` with the `color` prop value using string interpolation. If `color` contains special characters, this could break SVG or enable injection within the SVG attribute context. | Validate `color` is a safe CSS color value before interpolation. |

### components/ErrorBoundary.jsx

| Severity | Location | Issue | Suggested Fix |
|----------|----------|-------|---------------|
| ✅ HIGH | file:30 | Uses banned gold color `#BFA84D` as fallback: `background: 'var(--accent, #BFA84D)'`. Per STANDARDS.md and MEMORY.md, gold is removed from the design system. | Change to `background: 'rgba(255,255,255,0.15)'` or use a white-tone fallback per design system. |
| ✅ LOW | file:13 | `componentDidCatch` body is empty (comment only `// Could log to a service here`). Errors are silently swallowed with no logging. | Add `console.error` or `logger.error` call to surface caught errors. |

### components/PlanningSidebar.jsx

| Severity | Location | Issue | Suggested Fix |
|----------|----------|-------|---------------|
| ✅ CRITICAL | file:283 | `{ConfirmModal}` is rendered outside the JSX `return` boundary. The component returns a `<div>` ending at line 282, then `{ConfirmModal}` follows on line 283 before the closing `)`. This is a JSX syntax error that may cause a React runtime crash or silent failure. | Move `{ConfirmModal}` inside the root `<div>` before its closing tag, or wrap both in a fragment. |
| ✅ MEDIUM | file:76 | `console.error('Error loading programs:', error)` -- should use `logger.error`. | Replace with `logger.error`. |
| ✅ MEDIUM | file:93 | `console.error('Error assigning program:', error)` -- should use `logger.error`. | Replace with `logger.error`. |
| ✅ MEDIUM | file:121 | `console.error('Error unassigning program:', error)` -- should use `logger.error`. | Replace with `logger.error`. |

### components/PaymentModal.jsx

| Severity | Location | Issue | Suggested Fix |
|----------|----------|-------|---------------|
| ✅ HIGH | file:127-128 | Iframe `src` is set directly from the `checkoutURL` prop with no URL validation. If a malicious URL is passed, this could load arbitrary content. While sandbox attributes are present, `allow-same-origin` combined with `allow-scripts` weakens the sandbox. | Validate that `checkoutURL` starts with a known MercadoPago domain before rendering the iframe. |
| ✅ MEDIUM | file:46-57 | Polling `setInterval` runs every 1s but the `checkIframeURL` function body is empty (only try/catch with comments). This is a no-op interval consuming resources. | Remove the empty polling interval entirely. |
| ✅ LOW | file:66 | Uses emoji in `console.error` (`'... Payment modal error'`). Per CLAUDE.md, creator dashboard should use `console.error` for errors only (acceptable), but the emoji is unnecessary. | Remove emoji from error message. |

### components/CalendarView.jsx

| Severity | Location | Issue | Suggested Fix |
|----------|----------|-------|---------------|
| ✅ HIGH | file:89-90 | Empty `useEffect` with `plannedSessions` dependency: `useEffect(() => { }, [plannedSessions]);`. This runs on every render when sessions change but does nothing. Likely leftover debugging code. | Remove the empty useEffect. |
| ✅ MEDIUM | file:490 | `console.error('[CalendarView] handleDrop:', error)` -- should use `logger.error`. | Replace with `logger.error`. |
| ✅ LOW | file:19 | Comment says `// Gold` for `'rgba(255, 255, 255, 0.6)'` but the actual value is white at 0.6 opacity. Misleading comment. | Update comment to reflect actual color (white). |
| ✅ LOW | file:76 | Comment says `// visible gold accent` for `'rgba(255, 255, 255, 0.65)'` but this is white. Misleading comment. | Update comment to reflect actual color. |
| INFO | file:606 | `.map()` with `index` as key for weekday headers: `key={index}`. Acceptable for static arrays but flagged for awareness. | No action needed for static data. |

### components/MediaPickerModal.jsx

| Severity | Location | Issue | Suggested Fix |
|----------|----------|-------|---------------|
| ✅ HIGH | file:39-57 | No file type or size validation on upload. The `accept` prop is passed to the file input but no programmatic check ensures the selected file matches the expected type or is within size limits before uploading. | Add explicit type/size validation before calling `uploadFile`. |
| ✅ MEDIUM | file:29 | `console.error('Media list error:', e)` -- should use `logger.error`. | Replace with `logger.error`. |
| ✅ MEDIUM | file:52 | `console.error('Upload error:', err)` -- should use `logger.error`. | Replace with `logger.error`. |

### components/DashboardLayout.jsx

| Severity | Location | Issue | Suggested Fix |
|----------|----------|-------|---------------|
| LOW | file:307 | `feedbackSidebarWidth` is computed as `isMobile ? 0 : 220` but is only used as a CSS variable. When feedback panel is not open, this still reserves conceptual space. Minor clarity issue. | Consider renaming for clarity or documenting purpose. |
| INFO | file:408 | User `photoURL` from Firebase Auth is rendered directly as `<img src={user.photoURL}>`. Firebase Auth photoURLs are from trusted providers (Google, etc.) so this is low risk but noted. | No action needed. |

### components/ProgramWeeksGrid.jsx

| Severity | Location | Issue | Suggested Fix |
|----------|----------|-------|---------------|
| ✅ MEDIUM | file:116 | `console.error('Error refreshing program modules:', err)` -- should use `logger.error`. | Replace with `logger.error`. |
| ✅ MEDIUM | file:442-447 | `handleDragOverWeek` attempts to parse `e.dataTransfer.getData('application/json')` during `dragover`. In many browsers, `getData()` returns empty during `dragover` events (data is only available on `drop`). This means the plan-type check may always fail during dragover. | Use `e.dataTransfer.types` to check data presence during dragover instead of trying to parse the data. |
| ✅ LOW | file:19-24 | Custom `arrayMove` function duplicates `@dnd-kit/sortable`'s `arrayMove` which is already imported in `MeasuresObjectivesEditorModal.jsx`. | Import from `@dnd-kit/sortable` instead of duplicating. |

### components/PlanWeeksGrid.jsx

| Severity | Location | Issue | Suggested Fix |
|----------|----------|-------|---------------|
| ✅ MEDIUM | file:215 | `console.error('Error duplicating week:', err)` -- should use `logger.error`. | Replace with `logger.error`. |
| ✅ LOW | file:149 | `JSON.parse(e.dataTransfer.getData('application/json'))` in drop handler without try/catch. If the data is not valid JSON, this will throw. | Already wrapped at higher level in some paths but not consistently. Wrap in try/catch. |

### components/ContentManager/ContentManager.jsx

| Severity | Location | Issue | Suggested Fix |
|----------|----------|-------|---------------|
| ✅ MEDIUM | file:225 | Reference to undeclared variable `librarySession` in template literal: `librarySession?.image_url`. The variable `librarySession` is declared inside the `if` block on line 219 but referenced on line 225 outside that block. This will throw a ReferenceError when `contentType === 'plan'` and `libraryService && creatorId` is true. | Move `planImageUrl` computation inside the `if` block, or declare `librarySession` before the `if`. |
| ✅ MEDIUM | file:122 | `console.error('Error loading modules:', err)` -- should use `logger.error`. | Replace with `logger.error`. |
| ✅ MEDIUM | file:142 | `console.error('Error loading sessions:', err)` -- should use `logger.error`. | Replace with `logger.error`. |
| ✅ MEDIUM | file:161 | `console.error('Error loading exercises:', err)` -- should use `logger.error`. | Replace with `logger.error`. |
| ✅ LOW | file:71-99 | Functions `getModules`, `getSessions`, `getExercises`, `createModule`, `createSession`, `createExercise` have identical branches for `'plan'` and default cases. The `contentType` switch does not differentiate behavior. | Remove the dead conditional or add differentiated behavior. |

### components/PlanStructureSidebar.jsx

| Severity | Location | Issue | Suggested Fix |
|----------|----------|-------|---------------|
| ✅ MEDIUM | file:31 | `console.error('Error loading library sessions:', err)` -- should use `logger.error`. | Replace with `logger.error`. |

### components/SessionAssignmentModal.jsx

| Severity | Location | Issue | Suggested Fix |
|----------|----------|-------|---------------|
| ✅ MEDIUM | file:72 | `console.error('Error creating session:', err)` -- should use `logger.error`. | Replace with `logger.error`. |

### components/PlansSidebar.jsx

| Severity | Location | Issue | Suggested Fix |
|----------|----------|-------|---------------|
| ✅ MEDIUM | file:33 | `console.error('Error loading plans:', error)` -- should use `logger.error`. | Replace with `logger.error`. |

### components/Modal.jsx

| Severity | Location | Issue | Suggested Fix |
|----------|----------|-------|---------------|
| ✅ LOW | file:4 | Modal does not trap focus or handle Escape key. Users can tab outside the modal while it is open. | Add focus trapping and Escape key handler for accessibility. |

### components/DatePicker.jsx

| Severity | Location | Issue | Suggested Fix |
|----------|----------|-------|---------------|
| ✅ LOW | file:16-17 | `today` is stored as a `useRef` and mutated on every render (`today.current.setHours(0, 0, 0, 0)`). Since refs persist across renders, this mutates the same Date object repeatedly. While functionally harmless, it is semantically incorrect. | Use `useMemo` with empty deps instead of `useRef` for a constant value. |
| ✅ LOW | file:18-24 | `maxDate` is stored as `useRef` but depends on `max` and `allowFuture` props. If these props change, `maxDate` will not update since refs do not re-initialize. | Use `useMemo` with `[max, allowFuture]` dependencies. |

### components/WeekVolumeDrawer.jsx

| Severity | Location | Issue | Suggested Fix |
|----------|----------|-------|---------------|
| LOW | file:248-259 | Recharts `Tooltip` renders a custom component inline. If `top3PlannedVolumes` is empty, the PieChart renders with no data, which can cause recharts warnings. The guard at line 144 (`hasVolume`) prevents rendering when volumes are empty, so this is mitigated. | No action needed; guard is sufficient. |

### components/MeasuresObjectivesEditorModal.jsx

| Severity | Location | Issue | Suggested Fix |
|----------|----------|-------|---------------|
| LOW | file:93 | `useEffect` dependency array includes `initialValues.measures`, `initialValues.objectives`, etc. If `initialValues` is a new object reference on each parent render but with the same content, this effect will re-fire unnecessarily. | Consider using a stable key or deep comparison if parent re-renders frequently. |

### components/SessionCreationModal.jsx

| Severity | Location | Issue | Suggested Fix |
|----------|----------|-------|---------------|
| ✅ INFO | file:130-131 | Nested `<label>` elements: outer `<label className="session-creation-library-toggle-label">` wraps inner `<label className="elegant-toggle">`. | Remove nesting; use one label or use `htmlFor`. |

### components/StickyHeader.jsx

| Severity | Location | Issue | Suggested Fix |
|----------|----------|-------|---------------|
| INFO | file:124 | Logo image path `${ASSET_BASE}wake-isotipo.png` depends on ASSET_BASE config. If the asset is missing, the image fails silently with no fallback. | Add `onError` handler or provide alt text that communicates the brand. |

### config/firebase.js

| Severity | Location | Issue | Suggested Fix |
|----------|----------|-------|---------------|
| ✅ LOW | file:12-18 | Firebase API key is visible in source code. This is standard for Firebase web apps (API key is not a secret per Firebase docs) but noted. The staging config has placeholder `"TODO"` values that would cause runtime errors if `VITE_FIREBASE_ENV=staging`. | Add a runtime check that throws a clear error if staging config is incomplete. |
| INFO | file:39-45 | ReCaptcha App Check key comes from env var `VITE_RECAPTCHA_SITE_KEY`. If not set, App Check is silently skipped (`null`). This is intentional for dev but should be documented. | No action needed. |

### config/queryClient.js

| Severity | Location | Issue | Suggested Fix |
|----------|----------|-------|---------------|
| INFO | file:36-40 | `retry: false` and `refetchOnWindowFocus: false` as defaults. Per CLAUDE.md, refetch on window focus is the recommended approach for Wake. While the creator dashboard may have intentionally different defaults, this diverges from the documented pattern. | Confirm this is intentional; consider enabling `refetchOnWindowFocus` for data freshness. |

### config/assets.js

| Severity | Location | Issue | Suggested Fix |
|----------|----------|-------|---------------|
| INFO | file:2 | Simple one-line config. No issues found. | N/A |

### utils/apiClient.js

| Severity | Location | Issue | Suggested Fix |
|----------|----------|-------|---------------|
| INFO | file:79 | Uses `AbortSignal.any()` which requires modern browsers (Chrome 116+, Safari 17.4+). If targeting older browsers, this will throw. | Verify browser support requirements. |

### utils/plannedVolumeUtils.js

| Severity | Location | Issue | Suggested Fix |
|----------|----------|-------|---------------|
| ✅ LOW | file:81 | Typo in muscle key: `"pantorrilla'nt": 'Pantorrilla'`. The key contains an apostrophe and `'nt` suffix which looks like a joke/typo. If this key appears in Firestore data, it will match; otherwise it is dead code. | Verify if this key exists in production data; remove or fix if it does not. |

### utils/muscleColorUtils.js

| Severity | Location | Issue | Suggested Fix |
|----------|----------|-------|---------------|
| ✅ INFO | file:13 | Comment says `// 6-18 sets: Golden color (app color)` but the actual color is `'#ffffff'` (white). Leftover comment from when gold was in the design system. | Update comment to say "white" instead of "Golden color". |

### utils/libraryIcons.jsx

| Severity | Location | Issue | Suggested Fix |
|----------|----------|-------|---------------|
| LOW | file:6-7 | `dumbbell` and `barbell` icons have identical SVG paths. They render the same visual. | Use distinct SVG paths for each icon. |
| ✅ INFO | file:64-74 | File has 10 trailing blank lines. | Trim trailing whitespace. |

## Dead Code Report

| File | Evidence | Status |
|------|----------|--------|
| ✅ `components/MuscleSilhouetteSVG_template.js` | Zero imports found across the entire `src/` directory. Imports `react-native-svg` components (`Svg`, `G`, `Path`) and `getMuscleColorEnhanced` which does not exist in `muscleColorUtils.js`. This is a React Native template file that has no use in the web dashboard. | DELETED |
| ✅ `components/FeedbackModal.jsx` | Zero imports found across `src/`. The feedback functionality was replaced by the inline feedback panel in `DashboardLayout.jsx`. | DELETED |
| ✅ `components/PlanningModal.jsx` | Zero imports found across `src/`. Superseded by `SessionAssignmentModal.jsx`. | DELETED |
| ✅ `components/SessionCreationModal.jsx` | Zero imports found across `src/`. Replaced by inline session creation flows in `PlanWeeksGrid` and `ProgramWeeksGrid`. | DELETED |
| ✅ `components/PlanningSidebar.jsx` | Zero imports found across `src/` (note: `PlanningLibrarySidebar.jsx` is different). Superseded by `PlanningLibrarySidebar.jsx`. | DELETED |
| ✅ `components/PlansSidebar.jsx` | Zero imports found across `src/`. Superseded by `PlanningLibrarySidebar.jsx` which includes a Plans tab. | DELETED |
| ✅ `components/PaymentModal.jsx` | Zero imports found across `src/`. Payment flow likely handled differently or not yet integrated in the creator dashboard. | DELETED |
| ✅ `components/ContentManager/ContentManager.jsx` | Zero imports found across `src/`. Superseded by `PlanWeeksGrid` / `ProgramWeeksGrid` grid-based content management. | DELETED |
| `utils/muscleColorUtils.js` > `getMuscleSelectionColor` | Only imported in `MuscleSilhouetteSVG.jsx` (which uses `getMuscleColor`). `getMuscleSelectionColor` is exported but never imported anywhere. | UNUSED EXPORT |
| `components/ScreenSkeleton.jsx` > `CardSkeleton` | Exported but not imported anywhere in `src/`. Only `ScreenSkeleton` (default) and `Skeleton` are used. | UNUSED EXPORT -- verify before removing |

## Summary Statistics

| Severity | Count |
|----------|-------|
| CRITICAL | 2 |
| HIGH | 5 |
| MEDIUM | 18 |
| LOW | 18 |
| INFO | 11 |
| **Total** | **54** |
