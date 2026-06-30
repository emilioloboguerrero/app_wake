# Visibility-Gaps Instrumentation — Progress Ledger

Plan: docs/superpowers/plans/2026-06-28-visibility-gaps-instrumentation.md
Branch: instrumentation/visibility-gaps
Execution: parallel subagents over disjoint files; controller commits centrally.

- [x] Stream A (functions/payments.ts): A1 helper+test, A2 cancel-survey endpoint, A3 cancelled+payment_rejected events
- [x] Stream B (PWA funnel): B1 purchaseService+test, B2 redirected, B3 returned+activated
- [x] Stream C (landing funnel): B4 created/create_failed + activated
- [x] Stream D (PWA cancellation): C1 survey-before-portal + events
- [x] Stream E (PWA session): D1 enrich recovered, D2 session_interrupted
- [x] Centralized verification + commits
- [x] Final whole-branch review + fixes
- [x] Deploy (E2, user-gated) + PostHog verification (E3)

## DONE 2026-06-28
- Merged to main, deployed functions+hosting to wolf-20b8b (prod-bundle guard passed).
- PostHog insights created on dashboard 1651049:
  - Purchase funnel (short_id pOcRGSYK)
  - Session reliability (short_id dKof9jFB)
- New events not yet in PostHog schema (no post-deploy traffic). Confirm event arrival in ~24h.
