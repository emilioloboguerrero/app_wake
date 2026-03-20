# Landing App Audit

**Date:** 2026-03-20
**Scope:** `apps/landing/` — Vite + React 18.2, JavaScript/JSX. All source files, config, HTML, CSS.
**Methodology:** Read-only audit covering security, bugs, dead code, error handling, and optimization.

---

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 2 |
| HIGH | 7 |
| MEDIUM | 10 |
| LOW | 8 |
| INFO | 5 |

---

## Per-File Findings

### EventSignupScreen.jsx

| Severity | Location | Description | Suggested Fix | Status |
|----------|----------|-------------|---------------|--------|
| CRITICAL | :930 | **External QR service leaks auth token.** `checkInToken` and `eventId` are sent as URL params to `api.qrserver.com`. This third-party can cache/log the token, allowing impersonation at check-in. | Generate QR client-side with a library like `qrcode` (npm). Never send auth tokens to external APIs. | ✅ |
| HIGH | :451 | **Weak email validation.** Regex `^[^\s@]+@[^\s@]+\.[^\s@]+$` accepts `a@b.c`. | Require 2+ char TLD: `^[^\s@]+@[^\s@]+\.[^\s@]{2,}$`, or rely on server rejection + `type="email"`. | ✅ |
| HIGH | :536-544 | **Waitlist contact has no format validation.** Only checks non-empty. Users can submit garbage ("abc") that can never reach them. | Validate email pattern OR phone pattern (digits, optional `+`, min 7 chars). | ✅ |
| HIGH | :383 | **All API errors show "not found".** Network errors, 500s, and malformed responses all map to `setPhase('not_found')`. Misleads users and hides real problems. | Differentiate: 404 → not_found; other errors → error phase with retry button. | ✅ |
| MEDIUM | :454 | **Age validation accepts floats.** `Number('25.5')` passes the 1–99 check. | Add `!Number.isInteger(Number(str))` check. | ✅ |
| MEDIUM | :548-551 | **Clipboard copy reports success on failure.** `navigator.clipboard.writeText` rejects on HTTP/insecure contexts, but `.catch(() => {})` swallows it. User sees "✓ Link copiado" regardless. | Show error state when promise rejects instead of always showing success. | ✅ |
| MEDIUM | :13 | **Module-level mutable counter `_loaderUid`.** Fragile under React 18 Strict Mode (double-renders in dev). | Use `React.useId()` for guaranteed unique IDs. | ✅ Acceptable — useRef captures first value, no user-facing bug |
| MEDIUM | :389-416 | **CORS-dependent color extraction fails silently.** If event image CDN lacks `Access-Control-Allow-Origin`, `getImageData()` throws tainted-canvas error. Caught, but leaves default white accent with no indication. | Acceptable, but document the fallback behavior. | ✅ Acceptable — already caught with fallback |
| LOW | :1-8 | **Firebase Auth SDK loaded even when gate flow unused.** If event is not `wakeUsersOnly`, ~30KB of Auth SDK is loaded for nothing. | Lazy-load auth import, or accept shared bundle cost. | ✅ Accepted — shared bundle cost |
| LOW | :145-166 | **`STEP_ICONS` has only 5 entries.** V2 dynamic fields beyond 5 steps get a generic circle icon — jarring UX transition. | Add more icons or use generic icon consistently for V2. | ✅ Accepted — generic fallback already exists |
| INFO | :324 | `phase` has 11 string values. Consider constants object to prevent typos. | | ✅ |

---

### apiClient.js

| Severity | Location | Description | Suggested Fix | Status |
|----------|----------|-------------|---------------|--------|
| HIGH | :33-34 | **`AbortSignal.any()` unsupported in Safari <17.** Throws `TypeError` if caller passes a custom `signal`. Entire request fails. | Feature-detect: `typeof AbortSignal.any === 'function' ? AbortSignal.any([...]) : controller.signal`. | ✅ Owned by task A3 |
| MEDIUM | :33-34 | **When `AbortSignal.any` fallback is used, caller's signal is silently ignored.** The fallback above means custom abort signals won't work on older browsers. | Document this limitation or implement manual signal forwarding. | ✅ Owned by task A3 |
| LOW | :72 | **Retry delays `[0, 150, 300]` are very short.** 150ms/300ms give almost no recovery time for an overloaded server. | Consider `[0, 500, 1500]` for meaningful backoff. | ✅ Owned by task A3 |

---

### firebase.js

| Severity | Location | Description | Suggested Fix | Status |
|----------|----------|-------------|---------------|--------|
| HIGH | :21-28 | **Staging config has `'TODO'` placeholder values.** If `VITE_FIREBASE_ENV=staging` is set accidentally, `initializeApp` gets `apiKey: 'TODO'` — all Firebase operations fail with cryptic errors. | Add guard: `if (firebaseConfig.apiKey === 'TODO') throw new Error('Staging Firebase not configured')`. | ✅ |
| MEDIUM | :36-42 | **AppCheck silently disabled when env var missing.** No warning logged. Production could run without AppCheck protection if `VITE_RECAPTCHA_SITE_KEY` is unset. | Add `console.warn('[Firebase] AppCheck disabled — VITE_RECAPTCHA_SITE_KEY not set')`. | ✅ |
| LOW | :44 | **`firestore` initialized but unused.** Landing app uses `apiClient` for all data. `getFirestore` import adds ~50KB to bundle. | Remove `getFirestore` import and `firestore` export. | ✅ |

---

### heroImagesService.js

| Severity | Location | Description | Suggested Fix | Status |
|----------|----------|-------------|---------------|--------|
| MEDIUM | :3-9 | **In-memory cache never invalidates.** Long-lived tabs never see updated hero images. | Add TTL (e.g., 5 minutes): `let cachedAt = 0; if (Date.now() - cachedAt > 300000) cachedData = null;`. | ✅ |
| MEDIUM | :5-9 | **Error propagates unhandled.** `getAppResources()` throws on API failure. Callers in `App.jsx` use `.then()` with no `.catch()`. | Either add `.catch()` in callers or wrap in try/catch returning defaults. | ✅ |

---

### App.jsx

| Severity | Location | Description | Suggested Fix | Status |
|----------|----------|-------------|---------------|--------|
| HIGH | :36-37, :56-57, :60-61 | **Missing `.catch()` on all three `heroImagesService` calls.** Three unhandled promise rejections fire if API is unreachable. Can crash page in strict CSP environments. | Add `.catch(() => {})` to each call. | ✅ |
| MEDIUM | :293-299 | **"Ver entrenadores" button does nothing.** `onClick` only calls `e.stopPropagation()`. Users click expecting navigation. | Link to `/creators` or remove button until feature is ready. | ✅ |
| LOW | :138-148 | **Hero images keyed by array index.** When `heroImages` loads async and prepends, indices shift causing re-mounts. | Use URL as key: `key={url}`. | ✅ |
| LOW | :26-28 | **`Set` in React state.** Works but non-idiomatic; creates new Set on every update. | Consider plain object with boolean values, or keep as-is. | ✅ Accepted — works correctly |
| INFO | :346-428 | `AppContent` scroll listeners query DOM by class name (`.section-white`). Fragile if class names change. | | ✅ |

---

### LegalDocumentsScreen.jsx

| Severity | Location | Description | Suggested Fix | Status |
|----------|----------|-------------|---------------|--------|
| MEDIUM | :107-110 | **PDF iframe has no `sandbox` attribute.** Compromised PDF or Storage XSS could execute scripts in landing page's origin. | Add `sandbox="allow-same-origin"` to the iframe. | ✅ |
| LOW | :36-38 | `window.open` with `noopener,noreferrer` is fine but redundant in modern browsers. | No change needed. | ✅ |
| INFO | :40-42 | `selectedDocument` state persists across navigations. Modal could flash on route return. | Reset on unmount or use URL-based state. | ✅ |

---

### SupportScreen.jsx

| Severity | Location | Description | Suggested Fix | Status |
|----------|----------|-------------|---------------|--------|
| LOW | :1-335 | Entirely static content. No issues found. 335-line component is manageable. | Extract FAQ data to constant if it grows. | ✅ |
| INFO | :202-205 | FAQ expand/collapse has no transition animation. Content pops in/out abruptly. | Add CSS transition with max-height for smooth animation. | ✅ |

---

### Header.jsx

| Severity | Location | Description | Suggested Fix | Status |
|----------|----------|-------------|---------------|--------|
| LOW | :62-64 | **`navItems` recreated every render.** Static array defined inside component. | Move to module-level constant. | ✅ |
| INFO | :101-127 | **Mobile menu has no focus trap.** Keyboard users can tab behind the overlay. Accessibility concern. | Add focus trapping (e.g., `focus-trap-react`). | ✅ |

---

### Footer.jsx

| Severity | Location | Description | Suggested Fix | Status |
|----------|----------|-------------|---------------|--------|
| LOW | :27-28 | **FatSecret link missing `rel` attributes.** External link to `fatsecret.com` without `target="_blank"` or `rel="noopener"`. | Add `target="_blank" rel="noopener noreferrer"` if it should open in new tab. | ✅ |

---

### index.html

| Severity | Location | Description | Suggested Fix | Status |
|----------|----------|-------------|---------------|--------|
| CRITICAL | :5 | **`maximum-scale=1.0, user-scalable=no` blocks pinch-to-zoom.** WCAG 1.4.4 accessibility violation. Users with low vision cannot zoom. App stores may flag this. | Remove `maximum-scale=1.0, user-scalable=no`. Use CSS `touch-action` on specific elements if needed. | ✅ |
| MEDIUM | :10 | **No SEO metadata.** Title is just "Wake". No `<meta name="description">`, no Open Graph tags, no Twitter Cards. Social shares and search results show no context. | Add description, OG tags (`og:title`, `og:description`, `og:image`, `og:url`), Twitter Card tags. | ✅ |
| LOW | :13 | **`/manifest.json` points to PWA manifest** with `start_url: "/app/"`. Landing page appears "installable" with wrong start URL in Lighthouse. | Create landing-specific manifest or remove the link. | ✅ |

---

### vite.config.js

| Severity | Location | Description | Suggested Fix | Status |
|----------|----------|-------------|---------------|--------|
| LOW | :12-14 | **`host: true` exposes dev server on all network interfaces.** Anyone on local network can access. | Use `host: 'localhost'` unless LAN access is intentional. | ✅ |

---

### package.json

| Severity | Location | Description | Suggested Fix | Status |
|----------|----------|-------------|---------------|--------|
| MEDIUM | :13 | **`color-thief-browser` listed but never imported.** EventSignupScreen uses canvas-based extraction instead. Dead dependency. | `npm uninstall color-thief-browser`. | ✅ |
| LOW | :19-20 | **`@types/react` and `@types/react-dom` in devDependencies.** JS project, no TypeScript. Serves no purpose. | Remove both `@types/*` packages. | ✅ |

---

## Severity Definitions

| Level | Definition |
|-------|------------|
| **CRITICAL** | Security vulnerability, data leak, or accessibility violation — fix before next deploy |
| **HIGH** | Bug affecting users in production — fix this sprint |
| **MEDIUM** | Code quality, minor UX, or optimization — fix when touching the file |
| **LOW** | Minor improvement — optional |
| **INFO** | Observation — no action required |
