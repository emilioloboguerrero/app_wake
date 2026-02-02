# Wake — Product, Project & Brand

Complete reference of everything described for the product, project, brand, and landing experience.

---

## 1. Product

### What Wake Is
- **Wake** is a personal training app (“Tu app de entrenamiento personal”).
- It is a **PWA (Progressive Web App)** — users open it in the browser; no app store required.
- Core idea: **measure what you only felt before** — “Mide lo que antes solo sentías.”

### Value Proposition
- Users train **with people who inspire them** (creators, trainers, referentes).
- The product should convey:
  - **Authority** — credible, expert-led.
  - **Trust** — safe, reliable.
  - **Closeness** — personal connection to creators/inspirers, not generic content.

### Value Proposition (expanded)
- Wake is a **platform** that helps users **train smarter** by being **guided by the people who inspire them**.
- A place where users **connect with their favourite creators/influencers** to follow **routines created by them** (the people they trust).
- The platform is built so users can **measure and track their progress** and get **personalized insights** to improve over time.
- In short: a **one-stop shop** with a complete array of **structured training programs** made by the people they trust, **adapted to them**, so they can **progress over time**.

### Preferred Messaging (No “Creadores”)
- Avoid the word **“creadores”** in user-facing copy.
- Prefer terms that feel authoritative and close: **entrenadores**, **referentes**, **mentores**, **quienes te inspiran**, **quienes admiras**.

### Main CTA Copy
- **Primary line:**  
  **“Mide tu progreso entrenando con quienes te inspiran.”**  
  (Measure your progress training with those who inspire you.)

### Two Sides of the Product
1. **User app (PWA)** — for people who train; lives at site root `/`.
2. **Creators app / Panel de creadores** — for content creators; separate app, e.g. `/creators/login`.

---

## 2. Brand

### Name
- **Wake**

### Visual Identity
- **Primary accent:** Gold  
  - Hex: `#bfa84d`  
  - RGBA: `rgba(191, 168, 77, 1)`  
  - Used for links, accents, hover states.
- **Theme:** Dark.
  - Background: `#1a1a1a`.
  - Cards/surfaces: `#2a2a2a`, `#1f1f1f`.
- **Text:** White (`#ffffff`) on dark for primary content and CTAs.

### Logo
- **Primary logo (landing header):**  
  `Logotipo-WAKE-_positivo_.svg` — **white** version (`fill="#ffffff"`) for dark backgrounds.
- Logo is a **horizontal wordmark** (not square).
- Used in header; clickable; links to main/landing home.

### Language
- **Spanish (es)** — all copy, UI, and legal/support content in Spanish.

### Taglines / One-liners
- “Tu app de entrenamiento personal.”
- “Mide lo que antes solo sentías.”
- “Mide tu progreso entrenando con quienes te inspiran.”

---

## 3. Landing App — Scope & Behaviour

### Purpose
- Landing and shared pages for Wake: home, CTA, support, legal, and a bridge to the creators app.

### Top Bar / Header
- **Always at the top** (fixed/sticky).
- **No line** separating the header from the rest of the page (no bottom border).
- **Left:** Wake logo (white SVG), **clickable**, links to **main/landing home** (`/landing/` or `/` in-app).
- **Logo size:** Prominent; sized for a horizontal wordmark (e.g. ~72px height desktop, ~56px mobile) with minimal vertical padding so it sits close to the top.

### Navigation
- **Desktop (≥768px):** Nav items in the header bar: Creadores, Soporte, Documentos legales. Text **white**; no card/button around nav.
- **Mobile (<768px):** Nav items **only** in a **pop-up menu** (hamburger ☰). Rest of page is **much more opaque** when menu is open (dark overlay, e.g. 85% opacity).
- **Menu behaviour:**
  - Open/close **animated** (e.g. overlay fade, panel slide).
  - Overlay and menu rendered via **portal** into `document.body` so the overlay correctly dims the whole page (including header).
  - Close: overlay click, close button (✕), or resize above breakpoint.

### First Nav Item: Creadores
- **Label:** “Creadores”.
- **Destination (for now):** A **creators page inside the landing app** (`/landing/creators`), **not** the full creators app yet.
- That page has **no extra UI** — only a **link to the creators app** (e.g. “Ir al panel de creadores” → `/creators/login`).

### Main CTA on Home
- **Only the line of text**, no separate button or card.
- **Copy:** “Mide tu progreso entrenando con quienes te inspiran.”
- **Style:** White, **bold**, **large**.
- **Behaviour:** The text itself is the CTA — clickable link to the **PWA** (app root `/`).

### Responsive
- **Breakpoint:** 768px.
- **Desktop:** Full nav in header; no hamburger.
- **Mobile:** Hamburger + pop-up menu; layout and padding adjusted (e.g. less padding, full-width where needed).

### Routes (Landing App)
- `/` — Home (CTA + secondary links).
- `/creators` — Creators page (link to creators app only).
- `/support` — Support (SupportScreen).
- `/legal` — Legal documents (LegalDocumentsScreen).

### Secondary Links on Home
- Abrir app (PWA) → `/`
- Panel de creadores → `/creators/login`
- Soporte → `/landing/support`
- Documentos legales → `/landing/legal`

Styling: gold accent (`#bfa84d`), no underline by default.

---

## 4. Project & Repo

### Repo Structure
- **Monorepo** with multiple apps:
  - **Landing** — this app (`apps/landing`).
  - **PWA** — user app (root in hosting).
  - **Creator dashboard** — creators app (e.g. `apps/creator-dashboard`), deployed under `/creators/`).

### Landing App
- **Name:** `wake-landing`.
- **Description:** “Wake landing and shared pages.”
- **Stack:** React 18, Vite 7, react-router-dom.
- **Base path:** `/landing/`.
- **Build:** `vite build` → `dist/`; assembled into hosting at `hosting/landing/`.

### Key Directories (Landing)
- `src/App.jsx` — router, routes, Home with CTA.
- `src/Home.css` — CTA and home layout.
- `src/components/Header.jsx` + `Header.css` — top bar, logo, desktop nav, mobile menu (portal).
- `src/screens/` — CreatorsPage, SupportScreen, LegalDocumentsScreen.
- `src/assets/` — e.g. `Logotipo-WAKE-positivo.svg` (white logo).

### Hosting / Deploy
- Firebase Hosting.
- Assemble script combines PWA, landing, and creators builds (e.g. `scripts/assemble-hosting.js`).
- Landing served under `/landing/`.

---

## 5. Summary Checklist

| Area | Detail |
|------|--------|
| **Product** | Wake = personal training PWA; “mide lo que antes solo sentías”; train with quienes te inspiran. |
| **Brand** | Name: Wake. Gold #bfa84d, dark theme, white logo on dark, Spanish. |
| **CTA copy** | “Mide tu progreso entrenando con quienes te inspiran.” — white, bold, large, link to PWA. |
| **Header** | Fixed top; no bottom border; white logo left, link to home; desktop nav = Creadores, Soporte, Documentos legales; mobile = hamburger + popup. |
| **Menu** | Mobile only; overlay makes page much more opaque; open/close animated; portal to body. |
| **Creadores** | First nav item; goes to `/landing/creators`; that page only links to creators app. |
| **Responsive** | 768px; desktop = inline nav; mobile = popup menu. |

This document reflects exactly what was described for product, project, brand, and landing behaviour.
