import React, { useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { LandingFooter } from './ShowcaseLandingScreen';
import { subscribeAuthState } from '../services/storefrontAuthService';
import { getCreatorProgram } from '../services/creatorStorefrontService';
import { getCheckoutStatus } from '../services/storefrontCheckoutService';
import { requestMagicLink } from '../services/magicLinkService';
import { getCurrentIdToken } from '../services/storefrontAuthService';
import analyticsService from '../services/analyticsService';
import { getDownloadUrl, getDownloadLabel } from '../utils/smartDownload';
import './PostPaymentScreen.css';

// MP webhook usually lands within ~10s of the auto_return redirect, but the
// Functions cold-start path can stretch past that. 30s of polling at 2s
// intervals covers the long tail without making the user stare at a spinner.
const ACCESS_POLL_INTERVAL_MS = 2000;
const ACCESS_POLL_MAX_MS = 30_000;

// Defense-in-depth: never round-trip a garbage `?course=` value to the API.
const COURSE_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;

export default function PostPaymentScreen() {
  const { username } = useParams();
  const [params] = useSearchParams();
  const rawCourseId = (params.get('course') || '').trim();
  const courseId = COURSE_ID_RE.test(rawCourseId) ? rawCourseId : null;
  // MercadoPago appends `?status` (and/or `?collection_status`) for one_time
  // back_urls but NOT for subscription back_url (singular). The backend
  // appends `&mode=subscription` to the subscription success URL so we can
  // render the right copy.
  //
  // CRITICAL: never default `status` to "approved". When a user backs out of
  // MP without paying, MP redirects with the literal string "null" or omits
  // the param entirely — the old `|| 'approved'` fallback then announced a
  // confirmed payment that never happened.
  const rawStatus = (params.get('status') || params.get('collection_status') || '')
    .toLowerCase()
    .trim();
  const status = rawStatus && rawStatus !== 'null' ? rawStatus : '';
  const mode = params.get('mode') || 'one_time';
  const isSubscription = mode === 'subscription';
  const isApprovedParam = status === 'approved';
  const isPendingParam = status === 'pending' || status === 'in_process';
  const isRejected =
    status === 'rejected' || status === 'failure' || status === 'cancelled';
  // No explicit signal → treat as inconclusive. Could be a back-out or a
  // missing-param edge case; the access poll below is the source of truth.
  const isInconclusive = !isApprovedParam && !isPendingParam && !isRejected;
  const [program, setProgram] = useState(null);
  const [creator, setCreator] = useState(null);
  const [user, setUser] = useState(null);
  const userEmail = user?.email || null;
  // Buyer may have typed a different MP email at checkout (the
  // `requireAlternateEmail` branch). CreatorProgramDetailScreen stashes
  // whatever email actually went to MP under `wake_payer_${courseId}` —
  // we use it to disclose both inboxes honestly when they differ.
  const payerEmail = (() => {
    if (!courseId) return null;
    try {
      const raw = window.sessionStorage.getItem(`wake_payer_${courseId}`);
      return raw && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw) ? raw.toLowerCase() : null;
    } catch {
      return null;
    }
  })();
  const accountEmailLower = userEmail ? userEmail.toLowerCase() : null;
  const payerDiffersFromAccount = payerEmail && accountEmailLower && payerEmail !== accountEmailLower;
  // 'idle' | 'polling' | 'active' | 'timeout'
  // Now also runs for subscriptions: MP's authorized_payment commonly fires
  // within seconds of the back_url redirect, so we should detect it instead
  // of unconditionally telling the buyer "primer cobro pendiente."
  const [accessState, setAccessState] = useState('idle');
  // Magic-link email send state — fires once when we know who the buyer is
  // and either access is confirmed or this is a subscription (subs grant
  // access async; we don't wait).
  const [magicLinkState, setMagicLinkState] = useState('idle'); // idle | sending | sent | failed
  const magicLinkFiredRef = useRef(false);
  const returnedFiredRef = useRef(false);
  const activatedFiredRef = useRef(false);
  // Firebase restores persisted auth asynchronously; until the first
  // onAuthStateChanged fires we don't know whether the user is signed in
  // or signed out. We must NOT trust the first `null` callback as
  // "signed out" — Safari can fire null first, then the real user 0.5-3s
  // later. Flip authResolved immediately on a non-null callback OR after
  // a 1.5s grace window on null, whichever comes first.
  const [authResolved, setAuthResolved] = useState(false);
  // Signed-out fallback: lets the buyer request a magic link from here when
  // their session didn't restore after the MP redirect (cross-origin cookie
  // loss, new browser profile, etc.). Reuses /acceso's flow inline.
  const [fallbackEmail, setFallbackEmail] = useState('');
  const [fallbackState, setFallbackState] = useState('idle'); // idle | sending | sent | error
  const [fallbackError, setFallbackError] = useState('');

  // Fire once when the buyer lands back from MercadoPago on a subscription
  // checkout — the "returned" end of the funnel (pairs with
  // subscription.email_step.shown / choice / .checkout.redirected). Both PWA
  // and storefront subscriptions redirect here.
  useEffect(() => {
    if (!isSubscription || returnedFiredRef.current) return;
    returnedFiredRef.current = true;
    try {
      analyticsService.track('subscription.checkout.returned', {
        course_id: courseId,
        surface: 'post_payment',
        status: status || null,
      });
    } catch { /* analytics is best-effort */ }
  }, [isSubscription, courseId, status]);

  // Subscribe to auth state — `auth.currentUser` is null until Firebase
  // restores the session asynchronously after a hard reload. Use a grace
  // window on the first null callback so a slow restore on Safari doesn't
  // misclassify a signed-in buyer as signed-out and surface the fallback
  // email form to them.
  useEffect(() => {
    let graceTimer = null;
    let resolvedRef = false;
    const flipResolved = () => {
      if (resolvedRef) return;
      resolvedRef = true;
      setAuthResolved(true);
    };
    const unsubscribe = subscribeAuthState((u) => {
      setUser(u || null);
      if (u) {
        // Real user — resolve immediately.
        if (graceTimer) { clearTimeout(graceTimer); graceTimer = null; }
        flipResolved();
      } else if (!resolvedRef && !graceTimer) {
        // First null callback: wait briefly for the real user to land.
        graceTimer = setTimeout(flipResolved, 1500);
      }
    });
    return () => {
      if (graceTimer) clearTimeout(graceTimer);
      unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!courseId) return undefined;
    getCreatorProgram(username, courseId)
      .then((res) => {
        if (cancelled || !res) return;
        setProgram(res.program);
        setCreator(res.creator);
      })
      .catch(() => { /* tolerate — show generic copy */ });
    return () => { cancelled = true; };
  }, [username, courseId]);

  useEffect(() => {
    document.title = isRejected
      ? 'Pago rechazado — Wake'
      : isSubscription
        ? 'Suscripción autorizada — Wake'
        : isInconclusive
          ? 'Pago — Wake'
          : 'Pago confirmado — Wake';
    // Don't reset on unmount — flickers "Wake" before the next screen sets
    // its own title.
  }, [isSubscription, isRejected, isInconclusive]);

  // noindex: post-payment URLs carry a `?course=...` param that uniquely
  // identifies a purchase — they MUST NOT end up in search-engine indexes.
  useEffect(() => {
    let meta = document.querySelector('meta[name="robots"]');
    let created = false;
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'robots');
      document.head.appendChild(meta);
      created = true;
    }
    const prev = meta.getAttribute('content');
    meta.setAttribute('content', 'noindex, nofollow');
    return () => {
      if (created) meta.remove();
      else if (prev != null) meta.setAttribute('content', prev);
    };
  }, []);

  // Poll the API until the webhook grants course access. Runs for both
  // one-time AND subscription purchases — MP's authorized_payment commonly
  // lands within seconds, so subscribers can usually see "Tu programa está
  // listo" instead of the misleading "primer cobro en las próximas horas"
  // copy that the old code unconditionally showed. Skipped for rejected
  // payments (no access to wait for). Tracks consecutive failed ticks so
  // we can distinguish "webhook slow" from "we can't talk to the server"
  // and surface the right copy.
  const [networkTrouble, setNetworkTrouble] = useState(false);
  useEffect(() => {
    if (!user || !courseId || isRejected) return undefined;

    let cancelled = false;
    let timer = null;
    let consecutiveFails = 0;
    let tokenRefreshAttempted = false;
    setAccessState('polling');
    setNetworkTrouble(false);
    const startedAt = Date.now();

    const tick = async () => {
      if (cancelled) return;
      const result = await getCheckoutStatus({ courseId });
      if (cancelled) return;
      if (result?.active) {
        setAccessState('active');
        if (!activatedFiredRef.current) {
          activatedFiredRef.current = true;
          try {
            analyticsService.track('subscription.activated', {
              course_id: courseId,
              surface: 'landing',
              kind: 'course',
            });
          } catch { /* analytics is best-effort */ }
        }
        return;
      }
      // null result = network/server failure; consecutive failures get
      // their own state so we can show a "having problems" message and
      // bounce the ID token once before continuing.
      if (result === null) {
        consecutiveFails += 1;
        if (consecutiveFails >= 3 && !cancelled) {
          setNetworkTrouble(true);
          if (!tokenRefreshAttempted) {
            tokenRefreshAttempted = true;
            // Force-refresh via the storefront auth helper (modular SDK).
            try { await getCurrentIdToken(true); } catch { /* ignore */ }
          }
        }
      } else {
        consecutiveFails = 0;
        if (!cancelled) setNetworkTrouble(false);
      }
      if (Date.now() - startedAt >= ACCESS_POLL_MAX_MS) {
        setAccessState('timeout');
        return;
      }
      timer = setTimeout(tick, ACCESS_POLL_INTERVAL_MS);
    };
    tick();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [user, courseId, isRejected]);

  // Send the buyer a magic-link email so they can always get back to their
  // account from anywhere. Fires exactly once per buyer+resource, persisted
  // in sessionStorage so a page refresh doesn't burn the 5/min/email
  // rate-limit. Failure surfaces in copy below — the buyer can always
  // request a new one at /acceso.
  useEffect(() => {
    if (magicLinkFiredRef.current) return;
    if (!userEmail) return;
    const shouldSend =
      (accessState === 'active') ||
      (isSubscription && !isRejected) ||
      (isApprovedParam && !isRejected);
    if (!shouldSend) return;
    // sessionStorage key includes the resource so different course purchases
    // each get their own magic-link without colliding on a single fire flag.
    const fireKey = `wake_pp_ml_${userEmail}_${courseId || 'noctx'}`;
    try {
      const already = window.sessionStorage.getItem(fireKey);
      if (already === 'sent') { setMagicLinkState('sent'); magicLinkFiredRef.current = true; return; }
      if (already === 'failed') { setMagicLinkState('failed'); magicLinkFiredRef.current = true; return; }
    } catch { /* private mode — fall through */ }
    magicLinkFiredRef.current = true;
    setMagicLinkState('sending');
    requestMagicLink(userEmail).then((r) => {
      const outcome = r.success ? 'sent' : 'failed';
      setMagicLinkState(outcome);
      try { window.sessionStorage.setItem(fireKey, outcome); } catch { /* ignore */ }
    });
  }, [userEmail, courseId, accessState, isSubscription, isRejected, isApprovedParam]);

  const downloadUrl = getDownloadUrl();
  const downloadLabel = getDownloadLabel();

  // When the buyer actually has access (poll succeeded) we always claim
  // success — regardless of how messy MP's redirect params were.
  const isAccessConfirmed = accessState === 'active';
  // For subscriptions we now poll, so show "waiting for first charge" copy
  // only when the poll has actually timed out without access (= access
  // really IS pending) — not unconditionally as the old code did.
  const showWaitingForFirstCharge =
    isSubscription && !isRejected && !isAccessConfirmed &&
    (accessState === 'timeout' || accessState === 'idle');
  // Inconclusive + timeout = MP redirected without an approval signal AND
  // the webhook never granted access within the polling window. That's the
  // "user backed out without paying" case.
  const isIncompleteFinal = isInconclusive && accessState === 'timeout';
  // Distinguish "approved param + webhook lagging" from "really confirmed."
  // Both used to render "Pago confirmado" + "Abrir Wake," but a buyer
  // clicking through after a 30s timeout lands on an empty library. Now
  // we show a softer copy AND no "Abrir Wake" CTA in that limbo state.
  const isApprovedButLagging =
    isApprovedParam && !isRejected && accessState === 'timeout' && !isAccessConfirmed;

  const heading = isRejected
    ? 'Pago rechazado'
    : isAccessConfirmed
      ? 'Pago confirmado'
      : isApprovedButLagging
        ? 'Pago aprobado — activando'
        : showWaitingForFirstCharge
          ? 'Suscripción autorizada'
          : isIncompleteFinal
            ? 'No completaste el pago'
            : isPendingParam
              ? 'Pago en proceso'
              : isApprovedParam
                ? 'Pago confirmado'
                : 'Verificando tu pago';

  return (
    <div className="pp-root">
      <article className="pp-content">
        <div className="pp-icon" aria-hidden="true">
          {isRejected || isIncompleteFinal ? (
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
          ) : isAccessConfirmed ? (
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : (
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          )}
        </div>

        <h1 className="pp-title">{heading}</h1>

        {program && creator ? (
          <p className="pp-program">
            <strong>{program.title}</strong>
            <span> con {creator.displayName}</span>
          </p>
        ) : null}

        {isRejected ? (
          <p className="pp-message">
            Tu pago no se pudo procesar. Vuelve a intentarlo desde el programa.
          </p>
        ) : isAccessConfirmed ? (
          <p className="pp-message">
            Tu programa está listo. Ábrelo en Wake para empezar.
          </p>
        ) : isApprovedButLagging ? (
          <p className="pp-message">
            Tu pago está confirmado. La activación está tardando un poco más
            de lo normal — te enviaremos un correo cuando tu programa esté
            listo. Mientras tanto, no pierdas este enlace.
          </p>
        ) : showWaitingForFirstCharge ? (
          <p className="pp-message">
            Autorizamos tu suscripción. Mercado Pago hará el primer cobro en
            las próximas horas. En cuanto se confirme te avisamos por correo
            y vas a poder abrir tu programa en Wake.
          </p>
        ) : isIncompleteFinal ? (
          <p className="pp-message">
            No registramos un cobro. Si saliste sin completar el pago, vuelve
            al programa para intentarlo otra vez.
          </p>
        ) : accessState === 'polling' ? (
          <p className="pp-message" role="status" aria-live="polite">
            <span className="pp-poll-spinner" aria-hidden="true" />
            {networkTrouble
              ? 'Estamos teniendo problemas para confirmar. Revisá tu conexión — vamos a seguir intentando.'
              : isApprovedParam
                ? 'Estamos activando tu acceso. Esto tarda unos segundos.'
                : isSubscription
                  ? 'Estamos confirmando tu suscripción. Esto tarda unos segundos.'
                  : 'Estamos verificando tu pago. Esto tarda unos segundos.'}
          </p>
        ) : isPendingParam ? (
          <p className="pp-message">
            Tu pago está siendo verificado. Te notificaremos por correo cuando
            se confirme. Mientras tanto, puedes abrir Wake.
          </p>
        ) : isApprovedParam ? (
          <p className="pp-message">
            Tu pago está confirmado. La activación puede tardar unos minutos —
            te enviaremos un correo cuando tu programa esté listo en Wake.
          </p>
        ) : (
          <p className="pp-message" role="status" aria-live="polite">
            <span className="pp-poll-spinner" aria-hidden="true" />
            Verificando tu pago.
          </p>
        )}

        {/* Hide the "Abrir Wake" CTA when access isn't actually confirmed —
            the buyer would land in an empty library. The magic-link in the
            email is the right path back in the lagging case. */}
        {!isRejected && !isIncompleteFinal && !showWaitingForFirstCharge && !isApprovedButLagging ? (
          <div className="pp-actions">
            <a href={downloadUrl} className="pp-cta pp-cta-primary">
              {downloadLabel}
            </a>
          </div>
        ) : isApprovedButLagging ? (
          <div className="pp-actions">
            <Link to="/acceso" className="pp-cta pp-cta-primary">
              Entrar con mi correo
            </Link>
          </div>
        ) : showWaitingForFirstCharge ? (
          // The subscription is authorized but course access is granted only
          // when the first charge webhook lands (can take hours). Pointing
          // users to /app right now drops them in an empty library — show
          // the recovery path instead so they can come back via email when
          // the program is ready.
          <div className="pp-actions">
            <Link to="/acceso" className="pp-cta pp-cta-primary">
              Entrar con mi correo
            </Link>
          </div>
        ) : (
          <div className="pp-actions">
            {courseId ? (
              <Link to={`/${username}/${courseId}`} className="pp-cta pp-cta-primary">
                Volver al programa
              </Link>
            ) : (
              <Link to={`/${username}`} className="pp-cta pp-cta-primary">
                Volver al perfil
              </Link>
            )}
          </div>
        )}

        {!isRejected && !isIncompleteFinal && userEmail ? (
          <div className="pp-email-block">
            {/* Tell the buyer the truth about whether the magic-link
                actually went out — the old code claimed success even when
                Resend failed or the rate-limit hit. */}
            {magicLinkState === 'sent' || magicLinkState === 'sending' ? (
              <p className="pp-email-note">
                {magicLinkState === 'sending' ? 'Enviando un enlace de acceso a' : 'Te enviamos un enlace de acceso a'}{' '}
                <strong>{userEmail}</strong>.
                {' '}Guardálo — tu correo es tu llave a la cuenta.
              </p>
            ) : magicLinkState === 'failed' ? (
              <p className="pp-email-note">
                No pudimos enviar el correo a <strong>{userEmail}</strong> en este intento.
                Podés pedir uno nuevo en{' '}
                <Link to="/acceso" className="pp-inline-link">wakelab.co/acceso</Link>.
              </p>
            ) : (
              <p className="pp-email-note">
                Te enviaremos un enlace de acceso a <strong>{userEmail}</strong>{' '}
                en un momento. Tu correo es tu llave a la cuenta.
              </p>
            )}
            <p className="pp-spam-note">
              ¿No lo ves en unos minutos? Revisá <strong>spam</strong> o{' '}
              <strong>promociones</strong>.
            </p>
            {payerDiffersFromAccount ? (
              <p className="pp-spam-note">
                El recibo de Mercado Pago va a <strong>{payerEmail}</strong>{' '}
                — el enlace de acceso lo enviamos a tu correo de Wake.
              </p>
            ) : null}
          </div>
        ) : !isRejected && !isIncompleteFinal && authResolved && !user ? (
          // Session didn't restore after the MP redirect (cross-origin cookie
          // loss is the usual culprit). We can't poll for access without a
          // user, so give them a way to get a magic link without bouncing
          // out to /acceso — the success page should always end with the
          // buyer holding the key to their account.
          <div className="pp-email-block">
            {fallbackState === 'sent' ? (
              <p className="pp-email-note">
                Te enviamos un enlace a <strong>{fallbackEmail}</strong>. Revisá
                tu correo (mirá <strong>spam</strong> también) para entrar.
              </p>
            ) : (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const trimmed = fallbackEmail.trim().toLowerCase();
                  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
                    setFallbackError('Ingresa un correo válido.');
                    setFallbackState('error');
                    return;
                  }
                  setFallbackState('sending');
                  setFallbackError('');
                  const r = await requestMagicLink(trimmed);
                  if (r.success) {
                    setFallbackState('sent');
                  } else {
                    setFallbackError(r.error || 'No pudimos enviar el enlace.');
                    setFallbackState('error');
                  }
                }}
                className="pp-fallback-form"
              >
                <p className="pp-email-note">
                  Para entrar a tu cuenta, ingresá el correo que usaste al comprar.
                  Te enviamos un enlace de acceso.
                </p>
                <input
                  type="email"
                  className="pp-fallback-input"
                  value={fallbackEmail}
                  onChange={(e) => {
                    setFallbackEmail(e.target.value);
                    if (fallbackState === 'error') setFallbackState('idle');
                  }}
                  placeholder="tu@correo.com"
                  autoComplete="email"
                  required
                  disabled={fallbackState === 'sending'}
                />
                {fallbackState === 'error' && fallbackError ? (
                  <p className="pp-fallback-error">{fallbackError}</p>
                ) : null}
                <button
                  type="submit"
                  className="pp-cta pp-cta-primary"
                  disabled={fallbackState === 'sending' || !fallbackEmail}
                >
                  {fallbackState === 'sending' ? 'Enviando…' : 'Enviarme el enlace'}
                </button>
              </form>
            )}
          </div>
        ) : !isRejected && !isIncompleteFinal ? (
          <p className="pp-email-note">
            Si perdés acceso, podés recuperarlo con tu correo en{' '}
            <Link to="/acceso" className="pp-inline-link">wakelab.co/acceso</Link>.
          </p>
        ) : null}

        <p className="pp-help">
          ¿Necesitas ayuda?{' '}
          <a href="mailto:soporte@wakelab.co">soporte@wakelab.co</a>
        </p>
      </article>

      <LandingFooter />
    </div>
  );
}
