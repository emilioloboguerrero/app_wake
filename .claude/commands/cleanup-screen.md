# Code Cleanup & Documentation Audit

You are performing a deep code cleanup and documentation audit of a specific screen (and all its dependencies) in the Wake platform.

The target to audit is: **$ARGUMENTS**

---

## About This Project

Wake is a fitness/nutrition PWA for Spanish-speaking users. It was originally built as a React Native mobile app and was later pivoted to a PWA. As a result, the codebase contains:

- **Mobile-only code** that no longer runs on web but must be preserved (in case of future mobile return)
- **Legacy/leftover code** from AI-generated iterations that may be unused
- **Inconsistent or missing comments** across the codebase
- **Unused imports** from features that were removed or changed

The three apps are:
- `apps/pwa/` — Expo SDK 54, React Native 0.81.5, JavaScript only (no TypeScript), web PWA output
- `apps/creator-dashboard/` — Vite + React 18, JavaScript only
- `apps/landing/` — Vite + React 18, JavaScript only

Platform file resolution: Metro and the web bundler resolve `.web.js` / `.web.jsx` over `.js` on web. Many screens have both a native version (`.js`) and a web version (`.web.js` or `.web.jsx`).

---

## Critical Rules Before You Start

### DO NOT remove or flag as deletable:

1. **Mobile-only code blocks** — Any code guarded by `Platform.OS !== 'web'`, `Platform.OS === 'ios'`, `Platform.OS === 'android'`, `!isWeb`, or `isExpoGo` must be **preserved and marked**, not removed. These are intentional for future native builds.

2. **Navigation route strings** — Strings like `'MainScreen'`, `'CourseDetail'`, `'WorkoutExecution'` etc. are used as React Navigation route names passed to `navigation.navigate()`. A screen file may look "unreferenced" but is registered and used via these strings. Do not flag screen files as unused.

3. **Firestore collection strings** — Collection names like `'users'`, `'courses'`, `'diary'`, etc. are referenced as strings. A service may not appear imported but the collection it handles is accessed through string-based Firestore calls.

4. **AsyncStorage keys with template literals** — Keys like `` `progress_${userId}_${courseId}` `` or `` `profile_${userId}` `` are dynamically constructed. A key may not appear to be used if you only search for its literal string.

5. **`.web.js` / `.web.jsx` file pairs** — If a screen has both a `.js` and a `.web.js` version, both must be audited and kept. The web version replaces the native one on PWA, but the native one must remain for mobile.

6. **Services exported as default singletons** — Many services are `export default new ServiceClass()`. They may appear unused in a file if the import is destructured or called in a non-obvious way. Check all import statements carefully.

7. **Stub/fallback implementations** — Some functions return null or empty objects on web intentionally (e.g., `programMediaService` returns null paths on web as a graceful fallback). These are not dead code.

8. **Currently broken-but-intentional web gaps** — The following are known and intentional:
   - `AppState` in `appSessionManager.js` — broken on web, preserved for native
   - `@react-native-firebase/crashlytics` and `/analytics` — silently disabled on web, that is expected
   - Apple Sign-In (`apple.com` provider) — intentionally disabled, throws a user-facing error
   - `react-native-linear-gradient` — not available on web, loaded conditionally

---

## Step 1: Locate and Read All Files

Find and read:
1. The main target file (e.g., `apps/pwa/src/screens/TargetScreen.js`)
2. Its web counterpart if it exists (e.g., `TargetScreen.web.js` or `TargetScreen.web.jsx`)
3. Every file it imports — services, hooks, components, contexts, utilities
4. For each of those imported files, read their imports too (go **at least 2 levels deep**)

Be thorough. The goal is to understand the complete dependency graph of this screen before making any judgments.

---

## Step 2: Build a Dependency Map

For every file you read, note:
- What it exports
- What it imports from other project files
- Whether it has a web-specific counterpart
- Whether it contains mobile-only code blocks
- Whether it is a service singleton

---

## Step 3: Analyze Each File

For each file in the dependency graph, look for the following categories of issues:

### A. Unused Imports
- Imports that are declared at the top of a file but never referenced in the file body
- Destructured imports where only some named exports are used (flag the unused ones)
- **Be careful**: check if an import is used in a conditional block, a Platform-specific path, or passed through to another function before flagging it

### B. Unused Variables and Functions
- Variables declared with `const`, `let`, or `var` that are never read
- Functions defined but never called within the file or exported
- State variables (`useState`) where the setter is never called, or the value is never read
- **Be careful**: exported functions/variables might be used by other files — only flag unexported ones or ones you've confirmed have no callers

### C. Commented-Out Code
- Blocks of code that have been commented out (not explanatory comments — actual commented-out code)
- These are almost always safe to remove but note them for review
- Distinguish between: (1) intentionally disabled code with a reason, and (2) leftover debug/iteration code

### D. Mobile-Only Code (Mark, Do Not Remove)
- Any code block guarded by `Platform.OS`, `isWeb`, `isExpoGo`, or similar that runs **only on native mobile**
- These must be clearly marked with a comment: `// [MOBILE-ONLY] — preserved for future native builds`
- If the block is already marked, note it as correctly handled

### E. Legacy / Orphaned Patterns
- State variables that are set but never actually affect the UI or any logic
- Event listeners or subscriptions set up but never cleaned up (missing return cleanup in useEffect)
- Functions that call other functions that no longer exist or have been renamed
- `console.log` or `console.warn` calls left in production code (the PWA uses `apps/pwa/src/utils/logger.js` — raw console calls are against project conventions)
- Patterns that reference old versions of services (e.g., a service that was renamed or refactored)

### F. Comment Gaps
- Functions or sections that have no comment and whose purpose is not immediately obvious
- File-level headers that are missing or vague
- `useEffect` hooks with no comment explaining what they do and why
- Data transformation logic with no explanation
- Any section that would confuse a new developer reading it for the first time

### G. Comment Quality Issues
- Comments that say *what* the code does (e.g., `// set state`) instead of *why* or *what role this plays*
- Outdated comments that describe something the code no longer does
- TODO/FIXME comments — list them and note whether they are still relevant

---

## Step 4: Determine the Comment Style to Apply

When you later produce the cleaned-up code (not in this audit — in the apply phase), comments should follow this style:

**File header** (top of every file):
```js
// ─────────────────────────────────────────────────────────────────────────────
// ScreenName.web.jsx
// Role: [one sentence describing what this screen/file does in the app]
// Dependencies: [list key services, contexts, hooks it uses]
// ─────────────────────────────────────────────────────────────────────────────
```

**Section headers** (before logical groups of code):
```js
// ─── Section Name ────────────────────────────────────────────────────────────
```

**Function comments** (one line above every non-trivial function):
```js
// [Function name] — [what it does] / [why it exists / its role in the screen]
```

**useEffect comments** (one line above every useEffect):
```js
// Effect: [what triggers this] → [what it does] → [side effects or cleanup]
```

**Mobile-only markers**:
```js
// [MOBILE-ONLY] — [brief description of what this does on native]
```

**Inline comments** — only for logic that is genuinely non-obvious. Do not comment every line.

---

## Step 5: Produce the Audit Report

Write the full audit as a markdown file. Save it to:

```
apps/pwa/audit-reports/{TargetScreenName}-cleanup-audit.md
```

(If the target is in creator-dashboard or landing, use the appropriate app folder.)

The report must follow this exact structure:

---

```markdown
# Cleanup Audit: {Target Name}
**Date:** {today's date}
**Files analyzed:** {count}
**Scope:** {list every file that was read}

---

## 1. Dependency Map

A tree or list showing every file in the dependency graph:
- Which files the screen imports
- Which services/hooks/contexts are used
- Which files have web counterparts

---

## 2. Summary of Findings

| Category | Count | Severity |
|---|---|---|
| Unused imports | X | Low |
| Unused variables/functions | X | Low–Medium |
| Commented-out code | X | Low |
| Mobile-only blocks (needs marking) | X | Annotation only |
| Legacy/orphaned patterns | X | Medium |
| Raw console calls | X | Low |
| Comment gaps | X | Annotation only |
| Outdated/wrong comments | X | Annotation only |

---

## 3. Detailed Findings

For every finding, use this format:

### [CATEGORY] Short title
- **File:** `relative/path/to/file.js` — Line(s): XX–XX
- **What it is:** Precise description of what the code is doing
- **Why it is an issue:** Explanation of the problem (unused, confusing, wrong platform guard, etc.)
- **Action:** `REMOVE` | `MARK [MOBILE-ONLY]` | `ADD COMMENT` | `REPLACE COMMENT` | `REVIEW` | `KEEP AS-IS`
- **Risk:** `Safe` | `Review first` | `Do not touch`
- **Suggested comment / replacement** (if applicable): Show exactly what the new comment or code should be

---

## 4. Files That Are Clean

List any files in the dependency graph that have no issues and need no changes.

---

## 5. Mobile-Only Inventory

A complete list of every mobile-only code block found, with:
- File and line number
- Brief description of what it does on native
- Current state (already marked? needs marking?)

---

## 6. Recommended Apply Order

If the user decides to apply all changes, in what order should files be updated?
List files in recommended order with a one-line reason for the priority.

---

## 7. Do Not Touch

List anything that looks suspicious but should NOT be changed, with a clear explanation of why.
```

---

## What Happens After the Audit

The audit report is read-only. No code is changed during this phase.

After reviewing the audit, the user will decide which items to apply. They will ask you to apply specific sections or all changes from the audit. At that point:

1. Apply changes file by file
2. For each file, make all flagged changes together (unused import removal + comment additions + mobile marking in one edit)
3. Do NOT change any logic — only remove dead code, add/fix comments, and add mobile-only markers
4. After editing each file, briefly confirm what changed and what was preserved
5. If you are ever unsure whether something is safe to remove, do NOT remove it — instead leave it and note it in your response

---

Be specific. Reference exact file paths and line numbers. Do not summarize vaguely.
If you are unsure about something, say so clearly in the finding rather than guessing.
