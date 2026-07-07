# Reprice Bejarano programs to 19.000 COP / $6 USD + migrate existing subscribers

**Date:** 2026-07-06
**Owner:** Emilio
**Status:** Design approved, pending spec review

## Goal

Lower the monthly subscription price of both Bejarano programs from **79.000 COP / $25 USD** to **19.000 COP / $6 USD**, and — because this is a large price *drop* on subscribers who signed up days/weeks ago — bring every existing real subscriber down to the new price **and refund them the difference on their most recent charge**.

Motivated by the Código ABS IG/ManyChat funnel (price/friction was killing conversion — see `project_codigo_abs_manychat_funnel`).

## Scope

Two courses, both `deliveryType: general`, `block_cadence: monthly_first_monday`, creator `yMqKOXBcVARa6vjU7wImf3Tp85J2` (Felipe Bejarano):

| Program | Course ID | COP now → new | USD now → new | Polar product now |
|---|---|---|---|---|
| Código ABS | `ezJWUr3wJvaeptIM5f86` | 79.000 → **19.000** | $25 → **$6** | `1f10c144-9da8-40d6-91e0-2fb276151045` |
| Método Bejarano | `NTQIWMZBOxntwmUiXQZp` | 79.000 → **19.000** | $25 → **$6** | `330a1109-44df-4c45-995b-64dbd47c090d` |

- $6 = `deriveUsdFromCop(19000)` = `max(1, round((19000/3500)*1.10))` = 6 (`functions/src/api/services/polarProducts.ts:18-20`).
- Both confirmed by Emilio 2026-07-06 (chose "Ambos").

## Key technical reality (verified)

Changing `courses/{id}.subscription_price` only affects **new** buyers. There is **no code path** that changes what an existing subscriber pays:

- **MercadoPago:** the amount is baked into each subscriber's PreApproval `auto_recurring.transaction_amount` at signup (`payments.ts:483-487`). The reconcile cron even copies MP's amount *back* into our doc (`index.ts:2529-2530`). Nothing lowers it.
- **Polar:** on a price change, `syncPolarProduct` creates a **new** Polar product and archives the old one (`creator.ts:44-102`, `polarProducts.ts:22-49`). Existing Polar subscribers keep billing on the old (archived) product at the old price. No migration call exists.

So existing subscribers must be migrated **explicitly**, per provider, via a one-off admin operation.

## Approach

Wake-idiomatic, minimal permanent surface area:

1. **Catalog price change** → use the existing, tested dashboard price editor / `PATCH /creator/programs/:id` code path (it re-provisions Polar and archives the old product).
2. **Subscriber migration + refunds** → a one-off **read-only audit script → apply script** pair (the established Wake pattern for prod money ops). No permanent price-migration tooling — YAGNI for ~6–7 people.

Rejected alternatives:
- **Permanent admin endpoint/UI for price migration** — overkill for this population, more surface area and risk, not requested.
- **Fully manual in MP + Polar dashboards** — MP doesn't reliably expose PreApproval amount edits in its panel; manual partial refunds wouldn't write our `payment_ledger` rows.

## Part 1 — Catalog price change (affects new buyers only)

- **Código ABS** (`ezJWUr3wJvaeptIM5f86`): set `subscription_price` → 19000. It is **Polar-manual-pinned** (top-level `price_usd:25`, no `polar.price_source_monthly`), so the USD will NOT auto-re-derive — must **explicitly set the international price to $6** (dashboard "Precio internacional" field, or `price_usd:6` in the PATCH). This creates a new $6 Polar product and archives `1f10c144`.
- **Método Bejarano** (`NTQIWMZBOxntwmUiXQZp`): set `subscription_price` → 19000. It is `polar.price_source_monthly:"auto"`, so the USD **auto-derives to $6**. Creates a new Polar product, archives `330a1109`.

Marketing framing (default: leave as-is): Código ABS already has `compare_at_price: 150000` (struck-through "before"); Método Bejarano has none. No change unless Emilio asks.

## Part 2 — Existing subscribers (migrate down + refund the difference)

### 2a. Read-only audit script

Enumerate, per program, the **currently active, real** subscribers — split by provider. Exclusions:

- `TEST_USER_IDS` (`functions/src/api/services/testData.ts`) — for these programs that removes: `oXKlavb5…` (emilioprieva, Polar $4), `yMqKOXBc…` (Felipe self-test, Polar $21), `TI5dkYVw…` (coachmaleardila), `wX7RQWnh…` (lusuarezpi), `Iv9LRuqD…` (sebastianlunaperdomo).
- Any subscriber whose latest charge is `refunded`/`charged_back` or whose sub is cancelled/expired (e.g. `28gJaxwG…` jsebastian293 — Método, already refunded 2026-07-04).

Output: exact uid list + provider + PreApproval/Polar-subscription id + last-charge id + amount. **Writes nothing.** Emilio reviews before the apply step.

Expected population (to be confirmed by the audit against live subscription status):
- **Código ABS:** 4 MP (`aeNmGv9H…`, `3H5Whym…`, `udsbectp8…`, `bXI81U8k…`) + 1 Polar (`i0An2K1q…`, US).
- **Método Bejarano:** ~1–2 MP (real candidates `78m8INcX…`, `85HETzZE…` after excluding tests/refunded — verify active status).

### 2b. Apply script (after Emilio approves the audit list)

Per subscriber:

- **MercadoPago:** `PUT /preapproval/{id}` with `auto_recurring.transaction_amount: 19000` (lowers all future renewals). Then `POST /v1/payments/{lastPaymentId}/refunds` with `amount: 60000` (partial). A partial refund keeps the payment `status: "approved"`, so it does **NOT** trip the access-revocation logic, which keys on `status ∈ {refunded, charged_back}` (`refunds.ts:57,92,105`). Write a matching `payment_ledger` refund row for dashboard honesty.
- **Polar:** switch the subscription to the new $6 product, then issue a **partial refund of $19** with `revoke_benefits: false` (our `handleRefund` revokes only when `revoke_benefits === true`). No proration on the switch, so the difference isn't credited twice. Write the `payment_ledger` refund row.

Refund scope (default, approved): refund the **full 60.000 / $19 difference** to every active subscriber of both programs on their most recent charge.

### Safety / sequencing

1. Verify MP allows lowering a plan-less PreApproval amount (sandbox or docs) — the one load-bearing unknown. Search confirms `auto_recurring.transaction_amount` is updatable via PreApproval update. Fallback if rejected for any sub: refund the difference on each future renewal instead of editing the amount.
2. Change the catalog price on both courses (creates the new $6 Polar products).
3. Run the audit script; Emilio reviews the list.
4. Canary: apply to **one** subscriber (e.g. the single Método MP sub, or one Código ABS MP sub), verify Firestore + provider + ledger, then apply to the rest.
5. Every prod write behind explicit confirmation (`feedback_deploy_confirmation`). Bulk changes via a fast admin-SDK script, not per-doc loops (`feedback_bulk_firestore_writes`).

## Verification checklist

- New checkout on each program quotes 19.000 COP (MP) and $6 (Polar).
- New Polar products exist at $6; old products archived.
- Each migrated MP subscriber: PreApproval amount = 19000; a 60.000 refund recorded; access still active; `payment_ledger` refund row present.
- Each migrated Polar subscriber: on the $6 product; $19 refund with benefits retained; access active; ledger row present.
- No access-revocation side effects (partial refunds did not flip status).
- Creator earnings dashboard reflects the refunds without double-counting.

## Open risks

- **MP PreApproval amount decrease** — highest-confidence-needed item; verify first, fallback defined above.
- **Polar product switch semantics** — confirm the API switches the going-forward price cleanly with no proration credit when we also issue a manual partial refund.
- **Método active-status accuracy** — the audit must confirm which Método buyers are genuinely active (monthly access may have lapsed since June with no renewal).

## Related

- `project_payments_platform_direction` (Polar/MP architecture, fees, refund handling)
- `project_codigo_abs_manychat_funnel` (why the price is dropping)
- `docs/POLAR_INTEGRATION_STATUS.md`
- `functions/src/api/routes/{payments,polar,creator,public}.ts`, `functions/src/api/services/{refunds,polarProducts,testData}.ts`
