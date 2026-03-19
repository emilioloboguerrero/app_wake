# Wake — Staging Strategy

This document covers the staging environment setup, how to deploy to it, how
secrets are managed, and how CI/CD works (and why Wake doesn't need it yet).

Read `MIGRATION_ROLLOUT.md` before this document. The staging environment exists
to validate each domain migration before production. This document is about
setting it up and operating it.

---

## 1. What Staging Is

Staging is a separate Firebase project (`wolf-dev`) that mirrors the production
project (`wolf-20b8b`). It has its own:

- Firestore database (separate data, separate rules)
- Firebase Auth (separate user accounts)
- Cloud Functions (same code, different secrets)
- Firebase Hosting (separate URLs)
- Firebase Storage (separate files)

Staging and production never share data or credentials. A bug in staging cannot
corrupt production.

The staging URL is the Firebase Hosting preview URL for `wolf-dev`. It is not
a vanity domain — use the `.web.app` URL Firebase assigns.

---

## 2. Why Staging Exists

When you're the only developer and have 2–3 active users, it's tempting to test
directly in production. Staging exists for one reason: **the migration domains
must be validated against real Firebase behavior** (Auth emulators have subtle
differences from the real service, Firestore emulators don't replicate all
security rule behaviors).

Staging is not about protecting users from bugs — it's about validating that
the Cloud Functions + Firestore Admin SDK + security rules all behave correctly
before you flip the switch in production.

---

## 3. Firebase Project Setup

### 3.1 Aliases

The `.firebaserc` file manages project aliases:

```json
{
  "projects": {
    "default": "wolf-20b8b",
    "production": "wolf-20b8b",
    "staging": "wolf-dev"
  }
}
```

Switch between projects with:

```bash
firebase use staging    # Points to wolf-dev
firebase use production # Points to wolf-20b8b
firebase use default    # Same as production
```

Always verify which project is active before deploying:
```bash
firebase use            # Shows current project
```

### 3.2 First-Time Staging Setup

If `wolf-dev` does not exist yet, create it:

```bash
# 1. Create the project in Firebase Console (console.firebase.google.com)
#    Project ID: wolf-dev

# 2. Enable the same services as production:
#    - Firestore (Native mode, us-central1)
#    - Firebase Auth (enable Email/Password, Google, Apple)
#    - Firebase Storage
#    - Cloud Functions

# 3. Add the alias to .firebaserc
# (edit .firebaserc as shown in §3.1)

# 4. Deploy Firestore rules and indexes to staging
firebase use staging
firebase deploy --only firestore:rules,firestore:indexes,storage

# 5. Deploy functions to staging (see §5 for secrets first)
firebase deploy --only functions

# 6. Build and deploy hosting to staging
npm run build:all
firebase deploy --only hosting
```

---

## 4. Secrets Management in Staging

### 4.1 What CI/CD Is — and Why Wake Doesn't Need It Yet

**CI/CD** stands for Continuous Integration / Continuous Deployment. It means:
- **CI (Continuous Integration):** Every time you push code to GitHub, automated
  tests run to verify the code is correct.
- **CD (Continuous Deployment):** If tests pass, the code is automatically deployed
  to an environment (staging or production) without manual intervention.

CI/CD is valuable when:
- You have a team of developers pushing code frequently
- You need to catch regressions before they reach users
- Deployments are complex enough that manual steps are error-prone
- You want audit trails of who deployed what and when

Wake does not need CI/CD **right now** because:
- You are a solo developer
- There are 2–3 active users — a broken deploy has minimal impact
- The deployment process is simple (4 commands)
- There are no automated tests to run

**When to add CI/CD:** Once you have 500+ users and more than one developer
touching the codebase. At that point, a GitHub Actions workflow that runs
`firebase deploy --only functions` to staging on every push to `main` becomes
valuable. Until then, manual deploys are faster and simpler.

### 4.2 Secrets in Production (Firebase Secret Manager)

Production secrets are stored in Firebase Secret Manager, scoped to `wolf-20b8b`:

| Secret name | What it is |
|---|---|
| `MERCADOPAGO_WEBHOOK_SECRET` | Webhook HMAC validation key |
| `MERCADOPAGO_ACCESS_TOKEN` | MercadoPago API access token |
| `FATSECRET_CLIENT_ID` | FatSecret OAuth client ID |
| `FATSECRET_CLIENT_SECRET` | FatSecret OAuth client secret |
| `RESEND_API_KEY` | Resend transactional email API key |

Cloud Functions access secrets via:
```ts
// In function definition
secrets: ["MERCADOPAGO_ACCESS_TOKEN"]

// In function body
const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
```

### 4.3 Secrets in Staging

Staging requires its own secret values in the `wolf-dev` Secret Manager. Options:

**Option A — Real credentials (recommended for most secrets):**
Use the same FatSecret and Resend credentials. These services don't distinguish
between staging and production traffic. The volume from staging is negligible.

**Option B — Separate test credentials:**
For MercadoPago, use MercadoPago's sandbox environment. It has separate test
credentials that simulate payments without charging real money.

| Secret | Staging value |
|---|---|
| `MERCADOPAGO_WEBHOOK_SECRET` | MP sandbox webhook secret |
| `MERCADOPAGO_ACCESS_TOKEN` | MP sandbox access token (TEST-...) |
| `FATSECRET_CLIENT_ID` | Same as production |
| `FATSECRET_CLIENT_SECRET` | Same as production |
| `RESEND_API_KEY` | Same as production (or a Resend test key) |

To add a secret to `wolf-dev`:
```bash
firebase use staging
firebase functions:secrets:set SECRET_NAME
# (paste the value when prompted)
```

Verify secrets are set:
```bash
firebase functions:secrets:access SECRET_NAME
```

### 4.4 Firebase Config (Client-Side)

The PWA and creator dashboard embed the Firebase config object in
`apps/pwa/src/config/firebase.js` and `apps/creator-dashboard/src/config/firebase.js`.

These files point to the production project (`wolf-20b8b`). For a staging build,
you need to swap in the `wolf-dev` config. There are two approaches:

**Manual swap (current approach):**
Before building for staging, temporarily edit the firebase config to use `wolf-dev`
credentials. After deploying to staging, revert the change. This is tedious but
correct for solo development.

**Environment-based swap (future improvement, when CI/CD is added):**
Use a build-time environment variable to select the config:
```js
const firebaseConfig = process.env.VITE_ENV === 'staging'
  ? stagingConfig
  : productionConfig;
```

This is the right pattern for when you add CI/CD. Don't add it now —
the manual swap works fine at current scale.

---

## 5. Deploy Commands

### Deploy to Staging

```bash
# Switch to staging project
firebase use staging

# Build all apps (important: uses whatever firebase config is in the source files)
npm run build:all

# Deploy functions only (for testing a new endpoint)
firebase deploy --only functions

# Deploy hosting only (for testing a UI change)
firebase deploy --only hosting

# Deploy everything
firebase deploy

# Deploy rules (after editing firestore.rules or storage.rules)
firebase deploy --only firestore:rules,storage
```

### Deploy to Production

```bash
# Switch back to production
firebase use production

# Build (reverts any staging config changes first)
npm run build:all

# Deploy
firebase deploy
```

Always run `firebase use` before deploying to confirm you are targeting the
correct project. It takes one second and prevents deploying staging code to
production.

---

## 6. Staging Data

### 6.1 What Data Is in Staging

Staging data is **manually populated**. There is no data sync from production
to staging (and there should never be — production user data must not appear
in staging).

Minimum viable staging dataset for migration validation:

| Entity | What to create |
|---|---|
| Users | 2 test users: one `creator`, one `user` enrolled with the creator |
| Course | 1 course with at least 2 modules, 3 sessions each, 5 exercises per session |
| Nutrition diary | At least 5 diary entries for the test user |
| Session history | At least 3 completed sessions for the test user |
| Body log | At least 3 entries for the test user |
| Readiness | At least 2 entries for the test user |

### 6.2 Creating Staging Data

Create data directly through the staging app UI (not by writing to Firestore
manually). This validates the creation flows in addition to providing seed data.

Steps:
1. Sign up as a creator in the staging app
2. Create a course with a full program structure
3. Sign up as a user
4. The creator enrolls the user in the course
5. As the user: log food entries, complete sessions, log body weight, log readiness
6. Verify the creator dashboard shows the user's data

This takes about 30 minutes for the initial population. It does not need to be
repeated unless the staging database is cleared.

### 6.3 Resetting Staging Data

If staging data becomes corrupted or inconsistent, clear it:

```bash
firebase use staging

# Delete all data in a collection (Firestore console → select collection → delete)
# Or use the Firebase Emulator Suite locally for a clean state
```

There is no automated seeding script. Manual population is sufficient at this scale.

---

## 7. Firestore Security Rules in Staging

Staging uses the same `firestore.rules` as production. Deploy rule changes to
staging first to validate them:

```bash
firebase use staging
firebase deploy --only firestore:rules

# Test the rules using the Firebase Emulator + Rules Playground in the console

firebase use production
firebase deploy --only firestore:rules
```

Never deploy Firestore rules to production without first validating them on staging.
A bad rule can lock users out of their own data.

---

## 8. When to Add CI/CD (Future Reference)

When the team grows or the user base demands it, add a GitHub Actions workflow:

```yaml
# .github/workflows/deploy-staging.yml
name: Deploy to Staging

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '22' }
      - run: npm ci
      - run: npm --prefix functions run build
      - run: npm run build:all
        env:
          VITE_ENV: staging
      - uses: FirebaseExtended/action-hosting-deploy@v0
        with:
          repoToken: ${{ secrets.GITHUB_TOKEN }}
          firebaseServiceAccount: ${{ secrets.FIREBASE_SERVICE_ACCOUNT_WOLF_DEV }}
          projectId: wolf-dev
```

This deploys to staging automatically on every push to `main`. Production
deploys remain manual (intentional — production changes should be deliberate).

Prerequisites before adding CI/CD:
- [ ] Environment-based Firebase config selection (§4.4)
- [ ] Staging secrets added to GitHub repository secrets
- [ ] A `wolf-dev` service account key with deployment permissions
- [ ] At least basic smoke tests to run in the CI step

Don't add CI/CD until all four prerequisites are in place.
