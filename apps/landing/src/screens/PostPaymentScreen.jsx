import React, { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { LandingFooter } from './ShowcaseLandingScreen';
import { subscribeAuthState } from '../services/storefrontAuthService';
import { getCreatorProgram } from '../services/creatorStorefrontService';
import { getCheckoutStatus } from '../services/storefrontCheckoutService';
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
  // 'idle' | 'polling' | 'active' | 'timeout'
  // Only meaningful for one-time approved purchases — subscriptions don't
  // grant access until the first charge webhook lands, which can take hours,
  // so we keep the existing "primer cobro pendiente" copy for that path.
  const [accessState, setAccessState] = useState('idle');

  // Subscribe to auth state — `auth.currentUser` is null until Firebase
  // restores the session asynchronously after a hard reload.
  useEffect(() => {
    const unsubscribe = subscribeAuthState((u) => setUser(u || null));
    return () => unsubscribe?.();
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

  // Poll the API until the webhook grants course access. Skipped for
  // rejected payments (no access to wait for) and for subscriptions (first
  // charge can take hours; existing "primer cobro pendiente" copy already
  // covers that case). Polling runs even for inconclusive status — if the
  // user really did pay and MP just didn't append the right param, the
  // webhook still fires and we'll detect access here.
  useEffect(() => {
    if (!user || !courseId || isSubscription || isRejected) return undefined;

    let cancelled = false;
    let timer = null;
    setAccessState('polling');
    const startedAt = Date.now();

    const tick = async () => {
      if (cancelled) return;
      const result = await getCheckoutStatus({ courseId });
      if (cancelled) return;
      if (result?.active) {
        setAccessState('active');
        return;
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
  }, [user, courseId, isSubscription, isRejected]);

  const downloadUrl = getDownloadUrl();
  const downloadLabel = getDownloadLabel();

  const showWaitingForFirstCharge = isSubscription && !isRejected;
  // When the buyer actually has access (poll succeeded) we always claim
  // success — regardless of how messy MP's redirect params were.
  const isAccessConfirmed = accessState === 'active';
  // Inconclusive + timeout = MP redirected without an approval signal AND
  // the webhook never granted access within the polling window. That's the
  // "user backed out without paying" case.
  const isIncompleteFinal = isInconclusive && accessState === 'timeout';

  const heading = isRejected
    ? 'Pago rechazado'
    : isAccessConfirmed
      ? 'Pago confirmado'
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
        ) : showWaitingForFirstCharge ? (
          <p className="pp-message">
            Autorizamos tu suscripción. Mercado Pago hará el primer cobro en
            las próximas horas y te notificaremos por correo. Mientras tanto,
            puedes empezar a usar tu programa.
          </p>
        ) : isIncompleteFinal ? (
          <p className="pp-message">
            No registramos un cobro. Si saliste sin completar el pago, vuelve
            al programa para intentarlo otra vez.
          </p>
        ) : accessState === 'polling' ? (
          <p className="pp-message">
            <span className="pp-poll-spinner" aria-hidden="true" />
            {isApprovedParam
              ? 'Estamos activando tu acceso. Esto tarda unos segundos.'
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
          <p className="pp-message">
            <span className="pp-poll-spinner" aria-hidden="true" />
            Verificando tu pago.
          </p>
        )}

        {!isRejected && !isIncompleteFinal ? (
          <div className="pp-actions">
            <a href={downloadUrl} className="pp-cta pp-cta-primary">
              {downloadLabel}
            </a>
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
          <p className="pp-email-note">Te enviamos los detalles a {userEmail}.</p>
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
