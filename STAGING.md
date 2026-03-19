# Wake — Staging Runbook

Project alias for staging: `wolf-dev`
Production project: `wolf-20b8b`

---

## 1. Prerequisites

Before running anything, confirm the following:

- `wolf-dev` project exists in Firebase Console
- `gcloud auth application-default login` has been run on this machine
- All required secrets are set on the **staging** project:

```bash
firebase use wolf-dev
firebase functions:secrets:set MERCADOPAGO_WEBHOOK_SECRET
firebase functions:secrets:set MERCADOPAGO_ACCESS_TOKEN
firebase functions:secrets:set FATSECRET_CLIENT_ID
firebase functions:secrets:set FATSECRET_CLIENT_SECRET
firebase functions:secrets:set RESEND_API_KEY
```

---

## 2. First-Time Setup

Run these commands in order:

```bash
firebase use wolf-dev
firebase deploy --only firestore:rules,firestore:indexes,storage
npm run seed:staging
```

`seed:staging` populates the staging Firestore with test users, programs, and diary entries required by `validate:staging`.

---

## 3. Deploy Functions to Staging

```bash
npm --prefix functions run build && firebase use wolf-dev && firebase deploy --only functions
```

---

## 4. Run Validation

The validator calls every domain's key endpoints against the **local emulator**, not the deployed staging project. Start the emulators first:

```bash
firebase emulators:start
```

Open the emulator Auth UI at `http://localhost:4000`, sign in with a seeded test user, and copy the ID token from the browser's network tab (or use the emulator REST API to sign in and retrieve a token).

Then run:

```bash
export STAGING_ID_TOKEN="<token>"
npm run validate:staging
```

The script exits 0 if all 6 domains pass, 1 if any fail. Fix failures before promoting to production.

---

## 5. Deploy Full Stack to Staging

```bash
firebase use wolf-dev && firebase deploy
```

This deploys functions, hosting, Firestore rules, indexes, and Storage rules together.

---

## 6. Rollback

```bash
firebase use wolf-dev && git stash && firebase deploy --only functions
```

The git stash reverts uncommitted function changes. If a commit was already made, use `git revert <commit> --no-edit` in place of `git stash`, then redeploy.

The reverted hosting can be redeployed with `firebase deploy --only hosting` if needed — functions and hosting can be rolled back independently.

---

## 7. Promote to Production

Only after all 6 domains PASS in staging validation:

```bash
firebase use production && firebase deploy --only functions,hosting
```

Verify in production: open the live app, complete a quick smoke test for each migrated domain, and confirm no errors in the Firebase Functions logs (`firebase functions:log --project wolf-20b8b`).
