import React, { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { LandingFooter } from './ShowcaseLandingScreen';
import { subscribeAuthState } from '../services/storefrontAuthService';
import { getCreatorProgram } from '../services/creatorStorefrontService';
import { getDownloadUrl, getDownloadLabel } from '../utils/smartDownload';
import './PostPaymentScreen.css';

// Defense-in-depth: never round-trip a garbage `?course=` value to the API.
const COURSE_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;

export default function PostPaymentScreen() {
  const { username } = useParams();
  const [params] = useSearchParams();
  const rawCourseId = (params.get('course') || '').trim();
  const courseId = COURSE_ID_RE.test(rawCourseId) ? rawCourseId : null;
  // MercadoPago appends `?status` for one_time back_urls but NOT for
  // subscription back_url (singular). The backend appends `&mode=subscription`
  // to the subscription success URL so we can render the right copy.
  const status = params.get('status') || 'approved';
  const mode = params.get('mode') || 'one_time';
  const isSubscription = mode === 'subscription';
  const [program, setProgram] = useState(null);
  const [creator, setCreator] = useState(null);
  const [user, setUser] = useState(null);
  const userEmail = user?.email || null;

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
    document.title = isSubscription
      ? 'Suscripción autorizada — Wake'
      : 'Pago confirmado — Wake';
    // Don't reset on unmount — flickers "Wake" before the next screen sets
    // its own title.
  }, [isSubscription]);

  const downloadUrl = getDownloadUrl();
  const downloadLabel = getDownloadLabel();

  const isPending = status === 'pending' || status === 'in_process';
  const isRejected = status === 'rejected' || status === 'failure';

  const showWaitingForFirstCharge = isSubscription && !isRejected;

  const heading = isRejected
    ? 'Pago rechazado'
    : showWaitingForFirstCharge
      ? 'Suscripción autorizada'
      : isPending
        ? 'Pago en proceso'
        : 'Pago confirmado';

  return (
    <div className="pp-root">
      <article className="pp-content">
        <div className="pp-icon" aria-hidden="true">
          {isRejected ? (
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
          ) : isPending || showWaitingForFirstCharge ? (
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          ) : (
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
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
        ) : showWaitingForFirstCharge ? (
          <p className="pp-message">
            Autorizamos tu suscripción. Mercado Pago hará el primer cobro en
            las próximas horas y te notificaremos por correo. Mientras tanto,
            puedes empezar a usar tu programa.
          </p>
        ) : isPending ? (
          <p className="pp-message">
            Tu pago está siendo verificado. Te notificaremos por correo cuando
            se confirme. Mientras tanto, puedes abrir Wake.
          </p>
        ) : (
          <p className="pp-message">
            Tu programa está listo. Ábrelo en Wake para empezar.
          </p>
        )}

        {!isRejected ? (
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

        {!isRejected && userEmail ? (
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
