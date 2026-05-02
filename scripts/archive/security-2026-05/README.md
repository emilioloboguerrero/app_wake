# Security migration scripts — May 2026 archive

Archived 2026-05-01 alongside [docs/archive/security-2026-05/](../../../docs/archive/security-2026-05/).

## What's here

| Script | Purpose | Re-use? |
|---|---|---|
| `shape-analysis.js` | Read-only PII-redacting prod data shape sampler. Run before any rule lockdown. | **Yes — evergreen.** |
| `phase1-claim-backfill.js` | Stamps custom claims on creator/admin users from Firestore role field. | One-shot for the May-2026 deploy; idempotent. Re-run safe. |
| `exercises-library-cleanup.js` | F-API2-05 legacy data cleanup — moves stray top-level fields under `exercises[<id>]`. | One-shot. |
| `naming-drift-normalize.js` | F-DATA-01/06 — canonicalizes field naming on `events`, `nutrition_assignments`. | One-shot. Idempotent. |
| `one-on-one-clients-status-backfill.js` | F-DATA-07 — sets `status: active|inactive` on legacy 1:1 client docs. | One-shot. |
| `registrations-schema-unify.js` | F-DATA-12 — converts camel-schema event registrations to canonical snake/Spanish. | One-shot. |
| `pre-deploy-check.js` | Wrapper that dry-runs all five migrations against an emulator. | Re-usable as a pre-deploy gate. |
| `post-deploy-smoke.js` | ~6 attack-payload checks against the deployed API. | Re-usable as a post-deploy smoke. |
| `_lib.js` | Shared parseFlags / assertSafeTarget / initAdmin helpers. | Reused by every script. |
| `tier0-*` / `cleanup-c10-*` / `inspect-c10-*` | Earlier discovery + ad-hoc cleanup scripts kept for reference (zero-byte stubs in some cases). | Historical. |
| `tier0-discovery-output.json` | Output of an early discovery pass. PII-sensitive — kept gitignored. | Historical. |

## Running

Default mode is `--dry-run`. Writes require `--apply`. Production
target requires `--confirm-prod`.

```bash
# Dry-run against staging:
NODE_PATH=./functions/node_modules node scripts/archive/security-2026-05/phase1-claim-backfill.js --project wake-staging

# Apply against prod (deliberate, refuses without --confirm-prod):
NODE_PATH=./functions/node_modules node scripts/archive/security-2026-05/phase1-claim-backfill.js --project wolf-20b8b --confirm-prod --apply
```

## Note for future audits

`shape-analysis.js` is general-purpose — copy or symlink it into a
fresh `scripts/security/` directory if you start a new audit. The
other scripts are tied to specific 2026-05 findings; new findings
get new scripts.
