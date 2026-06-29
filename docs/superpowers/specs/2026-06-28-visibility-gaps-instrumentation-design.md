# Design — Cerrar gaps de visibilidad (instrumentación)

Date: 2026-06-28
Status: Approved (Option A — quirúrgico, reusar taxonomía + `analyticsService.track()`)
Scope: PostHog instrumentation only. No store refactor, no native-app work, no taxonomy redesign.

## Contexto

Análisis de uso/ventas (2026-06-28) reveló: adquisición estancada, leak de checkout (37 suscripciones `pending` = redirigidos a MercadoPago que nunca pagaron), 18 cancelaciones con solo 1 motivo capturado, y `workout.session_recovered` disparando 10-22×/semana. La auditoría de código mostró que landing **sí** trackea `$pageview`, el funnel de compra **ya** está parcialmente instrumentado (partido entre PostHog y Cloud Logging, inconsistente entre superficies), y existe una encuesta de cancelación que se **salta** cuando el usuario cancela en el portal hosteado de MercadoPago.

Este spec cierra los gaps reales con el mínimo cambio.

## Decisiones tomadas

- **Enfoque:** Opción A (quirúrgico). Rellenar los eventos faltantes reusando la taxonomía actual (`subscription.*`, `program.*`, `workout.*`) y el `analyticsService.track()` que ya existe en cada app. Mismo nombre de evento + propiedad `surface` en landing y PWA para que el embudo sea armable en PostHog.
- **Cancelaciones:** encuesta **antes** del portal de MP (gatear el acceso al `management_url` detrás del modal de encuesta existente). No reemplazar la cancelación por un flujo propio.
- **Sesión:** **medir primero** el daño real del recovery; no re-arquitecturar el store de sesión todavía.

## Stream 1 — Funnel de compra unificado

Meta: armar en PostHog el embudo `$pageview → email_step.shown → email_step.choice → checkout.created → checkout.redirected → checkout.returned → subscription.activated → program.purchase_completed → activation.first_workout_completed`, consistente en landing y PWA. El leak de `pending` = `checkout.redirected − program.purchase_completed`.

Propiedades comunes en todos los eventos cliente: `surface` (`'landing' | 'pwa_web'`), `course_id` o `bundle_id`, `external_reference` cuando exista, `kind` (`'course' | 'bundle'`).

| Evento | Dónde | Acción |
|---|---|---|
| `subscription.email_step.shown` | landing + PWA | existe — verificar props consistentes |
| `subscription.email_step.choice` | landing + PWA | existe — verificar props consistentes |
| `subscription.checkout.created` | cliente, al recibir `initPoint` OK | NUEVO (ambas superficies) |
| `subscription.checkout.create_failed` | cliente, si el endpoint de checkout falla | NUEVO (ambas superficies), prop `error_code` |
| `subscription.checkout.redirected` | cliente, justo antes de navegar a MP | existe en landing → **agregar en PWA** (BundleDetailScreen.web.jsx, CourseDetailScreen.js, purchaseService.js) |
| `subscription.checkout.returned` | cliente, al montar pantalla post-pago, prop `status` | existe en landing (PostPaymentScreen) → **agregar en PWA** (PaymentSuccessScreen.web.jsx) |
| `subscription.activated` | cliente, cuando el polling de estado pasa `verifying`→`active` | NUEVO (ambas superficies) |
| `program.purchase_completed` | server (webhook) | existe (payments.ts) |
| `subscription.payment_rejected` | server (webhook status `rejected`/`cancelled`) | NUEVO (payments.ts, rama de pago no aprobado) |

Cierre: crear una insight de funnel en PostHog (vía MCP) y agregarla al dashboard "Wake — Core Metrics" (id 1651049).

## Stream 2 — Cancelaciones: encuesta antes del portal

- Gatear el acceso al portal de MercadoPago: el camino que hoy abre `subscription.management_url` directo (apps/pwa/src/screens/SubscriptionsScreen.js:197-201) debe pasar primero por el modal de encuesta existente.
- Siempre escribir la respuesta a `subscription_cancellation_feedback` con `source: 'pre_portal_survey_v1'` y `proceeded_to_portal: boolean`, aunque luego el usuario no complete la cancelación en MP. (Esto da "intención de cancelar vs cancelación real".)
- Eventos cliente (PWA): `subscription.cancel_intent` (encuesta mostrada), `subscription.cancel_survey_submitted` (props `reason`, y demás respuestas), `subscription.manage_portal_opened`.
- Evento server **autoritativo**: `subscription.cancelled` — disparado en el webhook (payments.ts) cuando el status de la suscripción transiciona a `cancelled`. Cubre TODOS los caminos, incluso cancelaciones hechas en el portal sin encuesta. Props: `had_survey` (reconciliar contra feedback reciente por `user_id`/`subscription_id`), `days_active`, `course_id`.

Resultado: conteo total de cancelaciones 100% cubierto por el evento server; motivo capturado para quienes pasan por la encuesta.

## Stream 3 — Medir el daño real de la pérdida de estado

Sin re-arquitectura. Cuantificar si el recovery degrada la UX:

- Enriquecer `workout.session_recovered` (apps/pwa/src/screens/WorkoutExecutionScreen.js:1149) con: `recovery_render_ms` (tiempo desde mount hasta hidratar), `lost_current_set_progress` (bool — se perdieron reps/peso del set en curso), `trigger` (`'reload' | 'visibility' | 'pagehide' | 'errorboundary'` si es detectable).
- NUEVO `workout.session_interrupted`: en `pagehide` / `visibilitychange→hidden` durante una sesión activa, con `exercise_index`, `completed_sets`, `elapsed_seconds`. Es el **denominador** (cuántas interrupciones ocurren).
- `workout.recovery_failed` (existe, :1173) = numerador de fallas duras.
- Cierre: insight que responda "de N interrupciones, cuántas recuperan limpio / con degradación visible / fallan". Con eso se decide si el refactor de fondo del store de sesión vale la pena (spec futuro).

## Fuera de alcance (YAGNI)

- Refactor del store de sesión / hidratación durable (depende de lo que muestre Stream 3).
- Instrumentación de la app nativa (no está activa).
- Cambiar la taxonomía existente o crear un catálogo de eventos tipado.

## Riesgos / notas

- Eventos cliente nuevos: solo `analyticsService.track()`; no tocan la lógica de pago ni de workout.
- Eventos server nuevos: dentro del webhook ya existente (functions/src/api/routes/payments.ts), usando el helper `capture()` de `lib/analytics`; no cambian el flujo de MercadoPago.
- Deploy a prod (wolf-20b8b) requiere confirmación explícita del usuario (functions + hosting). Ver [[feedback_deploy_confirmation]].
- Verificar que el bundle del PWA lleve config de `wolf-20b8b` antes de desplegar (cache de Metro). Ver [[feedback_pwa_build_metro_cache]].

## Verificación

- Tras desplegar, confirmar en PostHog (`read-data-schema` + `query-funnel`) que cada evento nuevo aparece y que el funnel se arma de punta a punta en ambas superficies.
- Confirmar que `subscription.cancelled` (server) iguala el conteo de docs `subscriptions` con status `cancelled` en una ventana.
