import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation } from 'react-router-dom';
import wakeLogotype from '../assets/wake-logotype.svg';
import { subscribeAuthState, signOutStorefront } from '../services/storefrontAuthService';
import analyticsService from '../services/analyticsService';
import './Header.css';

function getInitial(user) {
  const source = user?.displayName || user?.email || '';
  const trimmed = source.trim();
  return trimmed ? trimmed.charAt(0).toUpperCase() : '·';
}

function AccountPopover({ user, onSignOut, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const onDocClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);
  return (
    <div ref={ref} className="wk-account-menu" role="menu">
      <p className="wk-account-menu-label">Conectado como</p>
      <p className="wk-account-menu-email" title={user.email || ''}>
        {user.email || user.displayName || 'cuenta'}
      </p>
      <button
        type="button"
        className="wk-account-menu-signout"
        onClick={onSignOut}
        role="menuitem"
      >
        Cerrar sesión
      </button>
    </div>
  );
}

const NAV_LINKS = [
  { to: '/creadores', label: 'Creadores' },
  { to: '/developers', label: 'Devs', reloadDocument: true },
];

const ANIM_MS = 280;

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuAnimating, setMenuAnimating] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [user, setUser] = useState(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => {
    const unsub = subscribeAuthState((u) => setUser(u || null));
    return () => unsub?.();
  }, []);

  const handleSignOut = async () => {
    setAccountOpen(false);
    try {
      await signOutStorefront();
    } catch {
      // Firebase signOut rarely fails; nothing actionable to show.
    }
  };
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
        <div className="wk-pill-brand">
          <Link to="/" className="wk-pill-logo" aria-label="Wake">
            <img src={wakeLogotype} alt="Wake" />
          </Link>
          <Link to="/lab" className="wk-pill-lab">Lab</Link>
        </div>

        <div className="wk-pill-links">
          {NAV_LINKS.map(({ to, label, reloadDocument }) => (
            <Link key={to} to={to} reloadDocument={reloadDocument} className="wk-pill-link">{label}</Link>
          ))}
          <Link
            to={ctaHref}
            reloadDocument
            className="wk-pill-cta"
            onClick={() => analyticsService.track('landing.cta_clicked', { section: 'header', cta_label: ctaLabel })}
          >{ctaLabel}</Link>
          {user ? (
            <div className="wk-account">
              <button
                type="button"
                className="wk-account-trigger"
                onClick={() => setAccountOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={accountOpen}
                aria-label="Cuenta"
              >
                {getInitial(user)}
              </button>
              {accountOpen ? (
                <AccountPopover
                  user={user}
                  onSignOut={handleSignOut}
                  onClose={() => setAccountOpen(false)}
                />
              ) : null}
            </div>
          ) : null}
        </div>

        <Link
          to={ctaHref}
          reloadDocument
          className="wk-pill-cta-mobile"
          aria-label={ctaLabel}
          onClick={() => analyticsService.track('landing.cta_clicked', { section: 'header_mobile', cta_label: ctaLabel })}
        >
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
            {user ? (
              <div className="wk-drawer-account">
                <p className="wk-drawer-account-label">Conectado como</p>
                <p className="wk-drawer-account-email" title={user.email || ''}>
                  {user.email || user.displayName || 'cuenta'}
                </p>
                <button
                  type="button"
                  className="wk-drawer-account-signout"
                  onClick={async () => {
                    await handleSignOut();
                    closeMenu();
                  }}
                >
                  Cerrar sesión
                </button>
              </div>
            ) : null}
          </div>
        </>,
        document.body
      )}
    </header>
  );
}
