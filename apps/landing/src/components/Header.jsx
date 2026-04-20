import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation } from 'react-router-dom';
import wakeLogotype from '../assets/wake-logotype.svg';
import './Header.css';

const NAV_LINKS = [
  { to: '/creadores', label: 'Creadores' },
  { to: '/developers', label: 'Devs', reloadDocument: true },
];

const ANIM_MS = 280;

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuAnimating, setMenuAnimating] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { pathname } = useLocation();
  const isCreadores = pathname === '/creadores';
  const ctaHref = isCreadores ? '/creators/' : '/app';
  const ctaLabel = isCreadores ? 'Publica tu método' : 'Ir a la app';
  const ctaMobileLabel = isCreadores ? 'Publicar' : 'App';

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [menuOpen]);

  useEffect(() => {
    if (menuOpen) {
      requestAnimationFrame(() => requestAnimationFrame(() => setMenuAnimating(true)));
    } else {
      setMenuAnimating(false);
    }
  }, [menuOpen]);

  const closeMenu = () => {
    setMenuAnimating(false);
    setTimeout(() => setMenuOpen(false), ANIM_MS);
  };

  return (
    <header className="wk-header">
      <nav className={`wk-pill ${scrolled ? 'is-scrolled' : ''}`}>
        <Link to="/" className="wk-pill-logo" aria-label="Wake">
          <img src={wakeLogotype} alt="Wake" />
        </Link>

        <div className="wk-pill-links">
          {NAV_LINKS.map(({ to, label, reloadDocument }) => (
            <Link key={to} to={to} reloadDocument={reloadDocument} className="wk-pill-link">{label}</Link>
          ))}
          <Link to={ctaHref} reloadDocument className="wk-pill-cta">{ctaLabel}</Link>
        </div>

        <Link to={ctaHref} reloadDocument className="wk-pill-cta-mobile" aria-label={ctaLabel}>
          {ctaMobileLabel}
        </Link>

        <button
          type="button"
          className="wk-pill-burger"
          onClick={() => setMenuOpen(true)}
          aria-label="Abrir menú"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
            <line x1="4" y1="7" x2="20" y2="7" />
            <line x1="4" y1="12" x2="20" y2="12" />
            <line x1="4" y1="17" x2="20" y2="17" />
          </svg>
        </button>
      </nav>

      {menuOpen && createPortal(
        <>
          <div
            className={`wk-drawer-overlay ${menuAnimating ? 'is-open' : ''}`}
            onClick={closeMenu}
            aria-hidden="true"
          />
          <div className={`wk-drawer ${menuAnimating ? 'is-open' : ''}`}>
            <button
              type="button"
              className="wk-drawer-close"
              onClick={closeMenu}
              aria-label="Cerrar"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
                <line x1="6" y1="6" x2="18" y2="18" />
                <line x1="18" y1="6" x2="6" y2="18" />
              </svg>
            </button>
            <div className="wk-drawer-links">
              {NAV_LINKS.map(({ to, label, reloadDocument }) => (
                <Link key={to} to={to} reloadDocument={reloadDocument} className="wk-drawer-link" onClick={closeMenu}>{label}</Link>
              ))}
            </div>
          </div>
        </>,
        document.body
      )}
    </header>
  );
}
