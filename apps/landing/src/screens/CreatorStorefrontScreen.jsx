import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { LandingFooter } from './ShowcaseLandingScreen';
import { WakeApiError } from '../utils/apiClient';
import { getCreatorStorefront } from '../services/creatorStorefrontService';
import WhatsAppFab from '../components/WhatsAppFab';
import wakeIcon from '../assets/hero-logo.svg';
import './CreatorStorefrontScreen.css';

const COP = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});

function formatPrice(value, currency) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  if (!currency || currency.toUpperCase() === 'COP') return COP.format(value);
  try {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: currency.toUpperCase(),
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${value}`;
  }
}

function ProgramTags({ program }) {
  if (program.deliveryType === 'one_on_one') {
    return (
      <div className="cs-card-tags" aria-hidden="true">
        <span className="cs-card-tag">Asesoría</span>
      </div>
    );
  }
  const showTraining = program.hasTraining !== false;
  const showNutrition = program.hasNutrition === true;
  if (!showTraining && !showNutrition) return null;
  return (
    <div className="cs-card-tags" aria-hidden="true">
      {showTraining ? <span className="cs-card-tag">Entrenamiento</span> : null}
      {showNutrition ? <span className="cs-card-tag">Nutrición</span> : null}
    </div>
  );
}

function ProgramCard({ username, program }) {
  const navigate = useNavigate();
  const [flipped, setFlipped] = useState(false);

  const otp = formatPrice(program.price, program.currency);
  const sub = formatPrice(program.subscriptionPrice, program.currency);
  const isOneOnOne = program.deliveryType === 'one_on_one';

  const flip = () => setFlipped((f) => !f);

  const goToDetail = (e) => {
    e?.stopPropagation?.();
    navigate(`/${username}/${program.id}`);
  };

  const onKey = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      flip();
    } else if (e.key === 'Escape' && flipped) {
      e.preventDefault();
      setFlipped(false);
    }
  };

  return (
    <div
      className={`cs-card ${flipped ? 'is-flipped' : ''}`}
      role="button"
      tabIndex={0}
      aria-pressed={flipped}
      aria-label={`${program.title} — toca para ver detalles`}
      onClick={flip}
      onKeyDown={onKey}
    >
      <div className="cs-card-inner">
        {/* FRONT — image + title overlay only */}
        <div className="cs-card-face cs-card-front">
          {program.imageUrl ? (
            <img
              src={program.imageUrl}
              alt=""
              loading="lazy"
              decoding="async"
              className="cs-card-image"
            />
          ) : (
            <div className="cs-card-image-placeholder" aria-hidden="true" />
          )}
          <div className="cs-card-overlay">
            <h3 className="cs-card-overlay-title">{program.title}</h3>
          </div>
          <ProgramTags program={program} />
        </div>

        {/* BACK — reorganized: header (discipline kicker + title) →
            stretching spacer → price cells in a row → CTA pinned bottom */}
        <div className="cs-card-face cs-card-back">
          <ProgramTags program={program} />

          <header className="cs-card-back-header">
            {program.discipline ? (
              <p className="cs-card-back-kicker">{program.discipline}</p>
            ) : null}
            <h3 className="cs-card-back-title">{program.title}</h3>
          </header>

          <div className="cs-card-back-spacer" />

          {(otp || sub || isOneOnOne) ? (
            <div className="cs-card-back-prices">
              {otp ? (
                <div className="cs-card-back-price">
                  <span className="cs-card-back-price-label">Pago único</span>
                  <span className="cs-card-back-price-value">{otp}</span>
                </div>
              ) : null}
              {sub ? (
                <div className="cs-card-back-price">
                  <span className="cs-card-back-price-label">Suscripción</span>
                  <span className="cs-card-back-price-value">
                    {sub}
                    <span className="cs-card-back-price-suffix">/mes</span>
                  </span>
                </div>
              ) : null}
              {!otp && !sub && isOneOnOne ? (
                <div className="cs-card-back-price">
                  <span className="cs-card-back-price-label">Formato</span>
                  <span className="cs-card-back-price-value">Uno a uno</span>
                </div>
              ) : null}
            </div>
          ) : null}

          <button
            type="button"
            className="cs-card-back-cta"
            onClick={goToDetail}
          >
            {isOneOnOne ? 'Reservar llamada' : 'Ver programa'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CreatorStorefrontScreen() {
  const { username } = useParams();
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('loading');

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    setData(null);
    getCreatorStorefront(username)
      .then((res) => {
        if (cancelled) return;
        if (!res) {
          setStatus('not_found');
          return;
        }
        setData(res);
        setStatus('ready');
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof WakeApiError && err.status === 404) {
          setStatus('not_found');
        } else {
          setStatus('error');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [username]);

  useEffect(() => {
    if (status === 'ready' && data?.creator?.displayName) {
      document.title = `${data.creator.displayName} — Wake`;
    }
    // Don't reset on unmount; the next screen sets its own title and the
    // brief "Wake" flash between routes is jarring.
  }, [status, data]);

  if (status === 'loading') {
    return (
      <div className="cs-root">
        <div className="cs-loading" aria-label="Cargando">
          <div className="cs-spinner" />
        </div>
      </div>
    );
  }

  if (status === 'not_found') {
    return (
      <div className="cs-root cs-empty">
        <div className="cs-empty-inner">
          <h1>Creador no encontrado</h1>
          <p>Este perfil no existe o aún no tiene programas publicados.</p>
          <Link to="/" className="cs-empty-cta">Volver a Wake</Link>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="cs-root cs-empty">
        <div className="cs-empty-inner">
          <h1>Algo no funcionó</h1>
          <p>No pudimos cargar este perfil. Intenta de nuevo en un momento.</p>
        </div>
      </div>
    );
  }

  const { creator, programs } = data;

  return (
    <div className="cs-root">
      <section className="cs-hero">
        <div className="cs-hero-bg" aria-hidden="true">
          {creator.profilePictureUrl ? (
            <img
              src={creator.profilePictureUrl}
              alt=""
              loading="eager"
              decoding="async"
              fetchPriority="high"
            />
          ) : null}
          <div className="cs-hero-overlay" />
        </div>
        <Link to="/lab" className="cs-hero-back">
          <span className="cs-hero-back-arrow" aria-hidden="true">←</span>
          <span>Lab</span>
        </Link>
        <img
          src={wakeIcon}
          alt=""
          aria-hidden="true"
          className="cs-hero-icon"
        />
        <div className="cs-hero-content">
          <h1 className="cs-hero-name">{creator.displayName}</h1>
          {creator.bio ? <p className="cs-hero-bio">{creator.bio}</p> : null}
        </div>
      </section>

      {(() => {
        const allPrograms = [
          ...(programs?.general || []),
          ...(programs?.oneOnOne || []),
        ];
        if (allPrograms.length === 0) return null;
        return (
          <section className="cs-section">
            <div className="cs-grid">
              {allPrograms.map((p) => (
                <ProgramCard key={p.id} username={creator.username} program={p} />
              ))}
            </div>
          </section>
        );
      })()}

      <WhatsAppFab prefill={`Hola, tengo una pregunta sobre los programas de ${creator.displayName}.`} />
      <LandingFooter />
    </div>
  );
}
