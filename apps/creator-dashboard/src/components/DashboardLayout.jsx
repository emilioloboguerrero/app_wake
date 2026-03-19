import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { ASSET_BASE } from '../config/assets';
import { useNavigate, useLocation } from 'react-router-dom';
import StickyHeader from './StickyHeader';
import { submitCreatorFeedback } from '../services/creatorFeedbackService';
import './DashboardLayout.css';

const TYPE_BUG = 'bug';
const TYPE_SUGGESTION = 'suggestion';

// Nav items that can be hidden by the creator
const HIDEABLE_KEYS = ['events', 'availability'];

const NAV_ITEMS = [
  {
    key: 'inicio',
    label: 'Inicio',
    path: '/lab',
    match: (p) => p === '/lab',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8"/>
        <rect x="14" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8"/>
        <rect x="3" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8"/>
        <rect x="14" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8"/>
      </svg>
    ),
  },
  {
    key: 'clientes',
    label: 'Clientes y programas',
    path: '/products',
    match: (p) =>
      p === '/products' ||
      p.startsWith('/programs/') ||
      p.startsWith('/clients') ||
      p.startsWith('/one-on-one'),
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <path d="M17 20c0-1.657-2.239-3-5-3s-5 1.343-5 3M21 17c0-1.23-1.234-2.287-3-2.75M3 17c0-1.23 1.234-2.287 3-2.75M18 10.236A3 3 0 1016 5.764M6 10.236A3 3 0 108 5.764M12 14a3 3 0 100-6 3 3 0 000 6z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    key: 'biblioteca',
    label: 'Biblioteca',
    path: '/content',
    match: (p) =>
      p === '/content' ||
      p.startsWith('/plans/') ||
      p.startsWith('/libraries') ||
      p.startsWith('/content/') ||
      p === '/library/sessions/new' ||
      p === '/library/modules/new',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <path d="M2 20h20M4 20V8l8-5 8 5v12M9 20v-6h6v6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    key: 'nutricion',
    label: 'Nutrición',
    path: '/nutrition',
    match: (p) => p === '/nutrition' || p.startsWith('/nutrition'),
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10M12 2c2.5 0 5 5 5 10s-2.5 10-5 10M12 2C9.5 2 7 7 7 12s2.5 10 5 10M2 12h20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    key: 'events',
    label: 'Eventos',
    path: '/events',
    match: (p) => p === '/events' || p.startsWith('/events/'),
    hideable: true,
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <path d="M8 7V3m8 4V3M3 11h18M5 5h14a2 2 0 012 2v13a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M9 15l2 2 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    key: 'availability',
    label: 'Disponibilidad',
    path: '/availability',
    match: (p) => p === '/availability',
    hideable: true,
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8"/>
        <path d="M12 7v5l3 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
];

const NAV_HIDDEN_KEY = 'wake_creator_nav_hidden';

const getHiddenNav = () => {
  try {
    return JSON.parse(localStorage.getItem(NAV_HIDDEN_KEY) || '[]');
  } catch {
    return [];
  }
};

const setHiddenNav = (keys) => {
  localStorage.setItem(NAV_HIDDEN_KEY, JSON.stringify(keys));
};

const DashboardLayout = ({
  children,
  screenName,
  headerBackgroundImage = null,
  onHeaderEditClick = null,
  onBack = null,
  showBackButton = false,
  backPath = null,
  backState = null,
  headerIcon = null,
  headerImageIcon = null,
}) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // ── Layout state ──────────────────────────────────────────────
  const [isSidebarVisible, setIsSidebarVisible] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // ── Nav visibility settings ───────────────────────────────────
  const [hiddenNav, setHiddenNavState] = useState(getHiddenNav);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef(null);

  // ── Feedback panel state ──────────────────────────────────────
  const [feedbackPanelOpen, setFeedbackPanelOpen] = useState(false);
  const [feedbackPanelClosing, setFeedbackPanelClosing] = useState(false);
  const [feedbackButtonClosing, setFeedbackButtonClosing] = useState(false);
  const [feedbackType, setFeedbackType] = useState(null);
  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackImageFile, setFeedbackImageFile] = useState(null);
  const [feedbackImagePreview, setFeedbackImagePreview] = useState(null);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [feedbackError, setFeedbackError] = useState(null);
  const [feedbackSuccess, setFeedbackSuccess] = useState(false);
  const [feedbackImageProgress, setFeedbackImageProgress] = useState(null);
  const feedbackImageInputRef = useRef(null);

  // ── Mobile detection ──────────────────────────────────────────
  useEffect(() => {
    const check = () => {
      const mobile = window.innerWidth <= 640;
      setIsMobile(mobile);
      if (mobile) setIsSidebarVisible(false);
    };
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    if (isMobile) setIsSidebarVisible(false);
  }, [location.pathname, isMobile]);

  // ── Close settings panel on outside click ─────────────────────
  useEffect(() => {
    if (!settingsOpen) return;
    const handle = (e) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target)) {
        setSettingsOpen(false);
      }
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [settingsOpen]);

  // ── Nav visibility helpers ────────────────────────────────────
  const toggleNavItem = (key) => {
    const next = hiddenNav.includes(key)
      ? hiddenNav.filter(k => k !== key)
      : [...hiddenNav, key];
    setHiddenNavState(next);
    setHiddenNav(next);
  };

  const isNavVisible = (key) => !hiddenNav.includes(key);

  // ── Sidebar toggle ────────────────────────────────────────────
  const toggleSidebar = () => setIsSidebarVisible(v => !v);

  const navTo = (path) => {
    navigate(path);
    if (isMobile) setIsSidebarVisible(false);
  };

  // ── Feedback helpers ──────────────────────────────────────────
  const closeFeedbackPanel = () => {
    if (feedbackPanelClosing) return;
    setFeedbackPanelClosing(true);
  };

  const finishCloseFeedbackPanel = () => {
    setFeedbackPanelClosing(false);
    setFeedbackPanelOpen(false);
    setFeedbackType(null);
    setFeedbackText('');
    setFeedbackImageFile(null);
    setFeedbackImagePreview(null);
    setFeedbackError(null);
    setFeedbackSuccess(false);
    setFeedbackImageProgress(null);
  };

  const handleFeedbackImageChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { setFeedbackError('Solo se permiten imágenes.'); return; }
    if (file.size > 5 * 1024 * 1024) { setFeedbackError('La imagen no puede superar 5MB.'); return; }
    setFeedbackError(null);
    setFeedbackImageFile(file);
    const reader = new FileReader();
    reader.onload = () => setFeedbackImagePreview(reader.result);
    reader.readAsDataURL(file);
  };

  const removeFeedbackImage = () => {
    setFeedbackImageFile(null);
    setFeedbackImagePreview(null);
  };

  const handleFeedbackSubmit = async (e) => {
    e.preventDefault();
    setFeedbackError(null);
    if (!feedbackType || !feedbackText.trim() || !user?.uid) {
      setFeedbackError(!feedbackType ? 'Elige tipo.' : !feedbackText.trim() ? 'Escribe tu mensaje.' : 'Sesión no disponible.');
      return;
    }
    setFeedbackLoading(true);
    try {
      await submitCreatorFeedback({
        creatorId: user.uid,
        type: feedbackType,
        text: feedbackText.trim(),
        imageFile: feedbackImageFile || null,
        creatorEmail: user.email ?? null,
        creatorDisplayName: user.displayName ?? null,
        onImageProgress: setFeedbackImageProgress,
      });
      setFeedbackSuccess(true);
    } catch (err) {
      setFeedbackError(err.message || 'Error al enviar. Intenta de nuevo.');
    } finally {
      setFeedbackLoading(false);
      setFeedbackImageProgress(null);
    }
  };

  const visibleNavItems = NAV_ITEMS.filter(
    item => !item.hideable || isNavVisible(item.key)
  );

  const feedbackSidebarWidth = isMobile ? 0 : 220;

  return (
    <div className="dl-layout" style={{ '--feedback-sidebar-width': `${feedbackSidebarWidth}px` }}>

      {/* Mobile overlay */}
      {isMobile && isSidebarVisible && (
        <div className="dl-overlay" onClick={() => setIsSidebarVisible(false)} />
      )}

      {/* ── Sidebar ─────────────────────────────────────────────── */}
      <aside className={`dl-sidebar ${isMobile ? (isSidebarVisible ? 'dl-sidebar--open' : 'dl-sidebar--hidden') : ''}`}>

        {/* Logo */}
        <div className="dl-sidebar__logo">
          <img src={`${ASSET_BASE}wake-logo-new.png`} alt="Wake" className="dl-sidebar__logo-img" />
          <span className="dl-sidebar__logo-label">Creadores</span>
        </div>

        {/* Navigation */}
        <nav className="dl-sidebar__nav">
          {visibleNavItems.map(item => (
            <button
              key={item.key}
              className={`dl-nav-item ${item.match(location.pathname) ? 'dl-nav-item--active' : ''}`}
              onClick={() => navTo(item.path)}
              aria-current={item.match(location.pathname) ? 'page' : undefined}
            >
              <span className="dl-nav-item__icon">{item.icon}</span>
              <span className="dl-nav-item__label">{item.label}</span>
            </button>
          ))}
        </nav>

        {/* Footer */}
        <div className="dl-sidebar__footer">
          {/* Nav visibility settings */}
          <div className="dl-nav-settings" ref={settingsRef}>
            <button
              className="dl-nav-settings__trigger"
              onClick={() => setSettingsOpen(v => !v)}
              aria-label="Personalizar navegación"
              title="Personalizar menú"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M12 15a3 3 0 100-6 3 3 0 000 6z" stroke="currentColor" strokeWidth="1.8"/>
                <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" stroke="currentColor" strokeWidth="1.8"/>
              </svg>
              <span>Personalizar</span>
            </button>

            {settingsOpen && (
              <div className="dl-nav-settings__panel">
                <p className="dl-nav-settings__title">Secciones visibles</p>
                {NAV_ITEMS.filter(i => i.hideable).map(item => (
                  <label key={item.key} className="dl-nav-settings__option">
                    <input
                      type="checkbox"
                      checked={isNavVisible(item.key)}
                      onChange={() => toggleNavItem(item.key)}
                    />
                    <span>{item.label}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* User profile */}
          <button
            className="dl-user"
            onClick={() => navTo('/profile')}
            title="Perfil"
            aria-label="Ir a perfil"
          >
            {user?.photoURL ? (
              <img src={user.photoURL} alt={user?.displayName || 'Usuario'} className="dl-user__avatar-img" />
            ) : (
              <div className="dl-user__avatar">
                {user?.displayName?.charAt(0)?.toUpperCase() || user?.email?.charAt(0)?.toUpperCase() || 'U'}
              </div>
            )}
            <div className="dl-user__info">
              <p className="dl-user__name">{user?.displayName || 'Tu perfil'}</p>
              <p className="dl-user__email">{user?.email}</p>
            </div>
            <svg className="dl-user__chevron" width="12" height="12" viewBox="0 0 24 24" fill="none">
              <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
      </aside>

      {/* ── Main content ──────────────────────────────────────────── */}
      <main className={`dl-main ${isMobile ? 'dl-main--mobile' : 'dl-main--sidebar'}`}>
        <StickyHeader
          screenName={screenName}
          showBackButton={showBackButton}
          backPath={backPath}
          backState={backState}
          backgroundImage={headerBackgroundImage}
          onEditClick={onHeaderEditClick}
          onBack={onBack}
          onMenuClick={isMobile ? toggleSidebar : undefined}
          showMenuButton={isMobile}
          icon={headerIcon}
          headerImageIcon={headerImageIcon}
        />
        {children}
      </main>

      {/* ── Feedback button ───────────────────────────────────────── */}
      {!feedbackPanelOpen ? (
        <button
          type="button"
          className={`feedback-cta-fixed ${feedbackButtonClosing ? 'feedback-cta-fixed-closing' : ''}`}
          onClick={() => { if (!feedbackButtonClosing) setFeedbackButtonClosing(true); }}
          onAnimationEnd={(e) => {
            if (e.target === e.currentTarget && e.animationName === 'feedback-cta-exit') {
              setFeedbackButtonClosing(false);
              setFeedbackPanelOpen(true);
            }
          }}
          aria-label="Feedback: sugerencias o reportar un bug"
        >
          <span className="feedback-cta-fixed-inner">
            <svg className="feedback-cta-fixed-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span className="feedback-cta-fixed-text">Feedback</span>
          </span>
        </button>
      ) : (
        <div
          className={`feedback-panel ${feedbackPanelClosing ? 'feedback-panel-closing' : 'feedback-panel-open'}`}
          onAnimationEnd={(e) => {
            if (e.target === e.currentTarget && e.animationName === 'feedback-panel-exit') finishCloseFeedbackPanel();
          }}
        >
          <button type="button" className="feedback-panel-close" onClick={closeFeedbackPanel} aria-label="Cerrar">×</button>
          {feedbackSuccess ? (
            <div className="feedback-panel-success">
              <p>Gracias. Tu feedback fue enviado.</p>
              <button type="button" className="feedback-panel-btn-enviar" onClick={closeFeedbackPanel}>Cerrar</button>
            </div>
          ) : !feedbackType ? (
            <div className="feedback-panel-step1">
              <p className="feedback-panel-label">¿Qué quieres hacer?</p>
              <button type="button" className="feedback-panel-type-btn" onClick={() => setFeedbackType(TYPE_BUG)}>
                Reportar un bug
              </button>
              <button type="button" className="feedback-panel-type-btn" onClick={() => setFeedbackType(TYPE_SUGGESTION)}>
                Sugerir una función
              </button>
            </div>
          ) : (
            <form onSubmit={handleFeedbackSubmit} className="feedback-panel-step2">
              <div className="feedback-panel-step2-header">
                <button type="button" className="feedback-panel-back" onClick={() => { setFeedbackType(null); setFeedbackError(null); }}>
                  ← Atrás
                </button>
                <span className="feedback-panel-step2-title">
                  {feedbackType === TYPE_BUG ? 'Reportar un bug' : 'Sugerir una función'}
                </span>
              </div>
              <div
                className="feedback-panel-textbox-wrap"
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); if (!feedbackLoading) e.currentTarget.classList.add('feedback-panel-drag-over'); }}
                onDragLeave={(e) => { e.preventDefault(); e.currentTarget.classList.remove('feedback-panel-drag-over'); }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.currentTarget.classList.remove('feedback-panel-drag-over');
                  if (feedbackLoading) return;
                  const file = e.dataTransfer?.files?.[0];
                  if (file?.type.startsWith('image/')) {
                    if (file.size > 5 * 1024 * 1024) setFeedbackError('La imagen no puede superar 5MB.');
                    else { setFeedbackError(null); setFeedbackImageFile(file); const r = new FileReader(); r.onload = () => setFeedbackImagePreview(r.result); r.readAsDataURL(file); }
                  }
                }}
              >
                <textarea
                  className="feedback-panel-textarea"
                  placeholder="Describe el bug o tu sugerencia..."
                  value={feedbackText}
                  onChange={(e) => setFeedbackText(e.target.value)}
                  rows={3}
                  disabled={feedbackLoading}
                />
                <input
                  ref={feedbackImageInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFeedbackImageChange}
                  disabled={feedbackLoading}
                  className="feedback-panel-file-hidden"
                  aria-hidden
                />
                <div className="feedback-panel-textbox-image">
                  {feedbackImagePreview ? (
                    <div className="feedback-panel-image-preview-inline">
                      <img src={feedbackImagePreview} alt="Vista previa" />
                      <button type="button" className="feedback-panel-remove-image" onClick={(e) => { e.stopPropagation(); removeFeedbackImage(); }} disabled={feedbackLoading}>Quitar</button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="feedback-panel-image-trigger-inline"
                      onClick={() => feedbackImageInputRef.current?.click()}
                      disabled={feedbackLoading}
                      aria-label="Añadir imagen"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                        <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.8"/>
                        <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor"/>
                        <path d="M21 15l-5-5L5 21" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </button>
                  )}
                </div>
                {feedbackImageProgress != null && (
                  <span className="feedback-panel-image-progress">Subiendo… {Math.round(feedbackImageProgress)}%</span>
                )}
              </div>
              {feedbackError && <p className="feedback-panel-error">{feedbackError}</p>}
              <div className="feedback-panel-actions">
                <button type="submit" className="feedback-panel-btn-enviar" disabled={feedbackLoading}>
                  {feedbackLoading ? 'Enviando…' : 'Enviar'}
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
};

export default DashboardLayout;
