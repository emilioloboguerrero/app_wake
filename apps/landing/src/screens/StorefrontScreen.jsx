import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { LandingFooter } from './ShowcaseLandingScreen';
import { getStorefrontCreators } from '../services/creatorStorefrontService';
import WhatsAppFab from '../components/WhatsAppFab';
import wakeIcon from '../assets/hero-logo.svg';
import './StorefrontScreen.css';

function CreatorCard({ creator }) {
  return (
    <Link
      to={`/${creator.username}`}
      className="bib-card"
      aria-label={`Ver programas de ${creator.displayName}`}
    >
      {creator.profilePictureUrl ? (
        <img
          src={creator.profilePictureUrl}
          alt=""
          loading="lazy"
          decoding="async"
          className="bib-card-image"
        />
      ) : (
        <div className="bib-card-image-placeholder" aria-hidden="true" />
      )}

      {creator.city ? (
        <div className="bib-card-tags" aria-hidden="true">
          <span className="bib-card-tag">{creator.city}</span>
        </div>
      ) : null}

      <div className="bib-card-overlay">
        <h3 className="bib-card-overlay-title">{creator.displayName}</h3>
      </div>
    </Link>
  );
}

export default function StorefrontScreen() {
  const [creators, setCreators] = useState(null);
  const [status, setStatus] = useState('loading');

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    getStorefrontCreators()
      .then((list) => {
        if (cancelled) return;
        setCreators(list ?? []);
        setStatus('ready');
      })
      .catch(() => {
        if (cancelled) return;
        setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    document.title = 'Lab — Wake';
  }, []);

  return (
    <div className="bib-root">
      <section className="bib-hero">
        <div className="bib-hero-bg" aria-hidden="true">
          <div className="bib-hero-overlay" />
        </div>
        <img
          src={wakeIcon}
          alt=""
          aria-hidden="true"
          className="bib-hero-icon"
        />
        <div className="bib-hero-content">
          <h1 className="bib-hero-title">Lab</h1>
        </div>
      </section>

      {status === 'loading' ? (
        <div className="bib-loading" aria-label="Cargando">
          <div className="bib-spinner" />
        </div>
      ) : null}

      {status === 'error' ? (
        <div className="bib-empty">
          <p>No pudimos cargar la biblioteca. Intenta de nuevo en un momento.</p>
        </div>
      ) : null}

      {status === 'ready' && creators && creators.length === 0 ? (
        <div className="bib-empty">
          <p>Aún no hay atletas con programas publicados.</p>
        </div>
      ) : null}

      {status === 'ready' && creators && creators.length > 0 ? (
        <section className="bib-section">
          <div className="bib-grid">
            {creators.map((c) => (
              <CreatorCard key={c.username} creator={c} />
            ))}
          </div>
        </section>
      ) : null}

      <WhatsAppFab />
      <LandingFooter />
    </div>
  );
}
