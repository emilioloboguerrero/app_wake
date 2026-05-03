# Wake security test suite

End-to-end test infrastructure for the security audit at
[`docs/SECURITY_AUDIT_2026-04-30.md`](../../docs/SECURITY_AUDIT_2026-04-30.md).

## Layout

```
functions/tests/
├── README.md                          ← you are here
├── rules/                             ← Firestore + Storage rules tests (no Functions emulator needed)
│   ├── _helper.ts                     ← shared boot + seed helpers
│   ├── security.users.test.ts         ← F-RULES-01/02 + F-NEW-01/05/06 + F-DRIFT-04/06
│   ├── security.content.test.ts       ← F-RULES-19/03/20/33/43 + F-DATA-08
│   ├── security.payments.test.ts      ← F-RULES-08 + F-DATA-04/05
│   ├── security.relationships.test.ts ← F-RULES-09/10/11/12/13/14/16/31/34 + F-DATA-02/06/07
│   ├── security.events.test.ts        ← F-RULES-06/21/41 + F-DATA-03/12
│   ├── security.storage.test.ts       ← F-RULES-25/26/27/28
│   ├── crossCreator.test.ts           ← (existing)
│   ├── waitlist.test.ts               ← (existing)
│   └── serverOnlyAndIsolation.test.ts ← (existing)
├── api/                               ← API integration tests (Functions emulator required)
│   ├── _helper.ts                     ← emulator probe, auth helpers, apiCall()
│   ├── security.workout.test.ts       ← F-API1-05/08/14/15/17/18/19/20
│   ├── security.creator-idor.test.ts  ← F-API2-01/02/03/04/05/06/11
│   ├── security.notifications.test.ts ← F-API1-35/36
│   ├── security.bookings-events.test.ts ← F-API2-07/08/09/15
│   ├── security.bundle.test.ts        ← F-NEW-07 / F-SVC-01
│   └── security.profile-pii.test.ts   ← F-API1-01/03/04
└── security/
    └── chains.test.ts                 ← C-01..C-15 composed exploit chains
```

## Test convention

Every test file uses one of two markers:

- `it(...)` — current behavior. Should pass today and after the fix.
- `it.fails(...)` — future-correct behavior. Currently fails because the
  bug is present; after the fix lands, drop `.fails` and the test should
  start passing.

For API tests where the precise status code may vary (200 today, 403/400
after fix), tests use a permissive shape: "if 2xx the bug is present /
if 4xx the fix is in" — both pass. Run the suite before AND after each
fix-PR; diff the output to confirm the right tests flipped.

## How to run

### Rules tests only (no Functions emulator needed)

```bash
# Terminal 1: boot emulators that the rules tests need
firebase emulators:start --only firestore,auth,storage --project wolf-20b8b

# Terminal 2: from functions/
npm run test:rules                      # all rules tests
npm run test:rules:security             # just the new security rules tests
```

Rules tests are fast (~5 seconds for the full security suite). They run
entirely against the rules emulator.

### API integration tests (Functions emulator required)

```bash
# Terminal 1: boot the full emulator stack (Functions + Firestore + Auth + Storage)
cd functions
npm run emu:start
# OR equivalently:
firebase emulators:start --only functions,firestore,auth,storage --project wolf-20b8b

# Terminal 2: from functions/
npm run test:api
npm run test:chains
```

API tests probe the emulator on startup. If the emulator isn't reachable,
the tests are skipped (not failed) — set `WAKE_RUN_API_TESTS=1` in the
environment to force them to run, or use the npm script which sets it.

### Run everything in one command

```bash
# from functions/
npm run test:security        # rules-only (skips API tests when emulator absent)
npm run test:security:full   # forces API tests (requires emulator running)
```

## After each fix lands

1. Identify which test files contain `it.fails(...)` blocks for that finding.
2. Drop `.fails` from those tests.
3. Re-run the suite; the previously-expected-fail tests should now pass.
4. Add a regression-guard `it(...)` that exercises the legit happy path.

If a fix accidentally breaks a legitimate flow, the regression-guard tests
that use `it(...)` (not `.fails`) will fail — that's the canary.

## Adding a new test

Match the style of the closest existing test. For rules tests, use the
shared helpers in `_helper.ts`. For API tests, use `apiCall()` and the
auth helpers. Keep one file per finding cluster; one `describe` per
finding; one `it` per scenario.

Tag every test with the finding ID it covers (e.g., `F-RULES-01`,
`F-API2-05`, `C-03`) in the test name or comment. The audit doc is the
single source of truth — every test should reference back to it.

## Production data shape

The redacted production data shape is captured by
[`scripts/security/shape-analysis.js`](../../scripts/security/shape-analysis.js).
Re-run before any rule lockdown PR to confirm no new shape regressions:

```bash
NODE_PATH=functions/node_modules node scripts/security/shape-analysis.js \
  --out /tmp/wake-shape-$(date +%s).json
```

The output tells you whether existing prod docs would now be denied by
the new rules. See §11 of the audit for the methodology.
