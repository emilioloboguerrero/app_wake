import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { ASSET_BASE } from '../config/assets';
import { useNavigate, useLocation } from 'react-router-dom';
import StickyHeader from './StickyHeader';
import { submitCreatorFeedback } from '../services/creatorFeedbackService';
import userPreferencesService from '../services/userPreferencesService';
import Tooltip from './ui/Tooltip';
import './DashboardLayout.css';
import CommandPalette from './CommandPalette';
import {
  LayoutDashboard,
  Users,
  Dumbbell,
  BookOpen,
  CalendarCheck,
  KeyRound,
} from 'lucide-react';

const TYPE_BUG = 'bug';
const TYPE_SUGGESTION = 'suggestion';

const ICON_SIZE = 14;

// Nav items — Eventos + Disponibilidad are hideable via creatorNavPreferences
const NAV_ITEMS = [
  {
    key: 'inicio',
    label: 'Inicio',
    path: '/dashboard',
    match: (p) => p === '/dashboard',
    icon: <LayoutDashboard size={ICON_SIZE} />,
  },
  {
    key: 'clientes',
    label: 'Asesorías',
    path: '/clientes',
    match: (p, state) =>
      p === '/clientes' ||
      p === '/availability' ||
      p.startsWith('/clients/') ||
      p.startsWith('/clientes/') ||
      (p.startsWith('/content/') && (state?.editScope === 'client' || state?.editScope === 'client_plan')) ||
      (p.startsWith('/nutrition/') && state?.editScope === 'assignment'),
    icon: <Users size={ICON_SIZE} />,
  },
  {
    key: 'programas',
    label: 'Generales',
    path: '/programas',
    match: (p) =>
      p === '/programas' ||
      p.startsWith('/programs/'),
    icon: <Dumbbell size={ICON_SIZE} />,
  },
  {
    key: 'biblioteca',
    label: 'Biblioteca',
    path: '/biblioteca',
    match: (p, state) =>
      p === '/biblioteca' ||
      p.startsWith('/plans/') ||
      p.startsWith('/libraries') ||
      (p.startsWith('/content/') && !state?.editScope) ||
      p.startsWith('/library/') ||
      (p.startsWith('/nutrition/') && state?.editScope !== 'assignment'),
    icon: <BookOpen size={ICON_SIZE} />,
  },
  {
    key: 'events',
    label: 'Eventos',
    path: '/events',
    match: (p) => p === '/events' || p.startsWith('/events/'),
    hideable: true,
    firestoreKey: 'eventos',
    icon: <CalendarCheck size={ICON_SIZE} />,
  },
];

const DEV_NAV_ITEMS = [
  {
    key: 'api-keys',
    label: 'API Keys',
    path: '/api-keys',
    match: (p) => p === '/api-keys',
    icon: <KeyRound size={ICON_SIZE} />,
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

const setHiddenNavLocal = (keys) => {
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
  headerRight = null,
  tutorialScreenKey = null,
}) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();

  // ── Layout state ──────────────────────────────────────────────
  const [isSidebarVisible, setIsSidebarVisible] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // Sidebar entrance animation — plays once per session
  const [sidebarAnimating] = useState(
    () => !sessionStorage.getItem('wake_sidebar_entered')
  );

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

  // ── Mark sidebar animation as played after first mount ────────
  useEffect(() => {
    if (sidebarAnimating) {
      sessionStorage.setItem('wake_sidebar_entered', '1');
    }
  }, [sidebarAnimating]);

  // ── Load nav preferences (cached via React Query — no re-fetch per navigation)
  const { data: navPrefs } = useQuery({
    queryKey: ['nav-preferences', user?.uid],
    queryFn: () => userPreferencesService.getNavPreferences(user?.uid),
    enabled: !!user?.uid,
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (!navPrefs) return;
    const hidden = [];
    if (navPrefs.eventos === false) hidden.push('events');
    if (navPrefs.disponibilidad === false) hidden.push('availability');
    setHiddenNavState(hidden);
    setHiddenNavLocal(hidden);
  }, [navPrefs]);

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
  const toggleNavItem = async (key) => {
    const next = hiddenNav.includes(key)
      ? hiddenNav.filter(k => k !== key)
      : [...hiddenNav, key];
    setHiddenNavState(next);
    setHiddenNavLocal(next);

    if (user?.uid) {
      const prefs = {
        eventos: !next.includes('events'),
        disponibilidad: !next.includes('availability'),
      };
      queryClient.setQueryData(['nav-preferences', user.uid], prefs);
      userPreferencesService.setNavPreferences(user.uid, prefs).catch(() => {});
    }
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

  const handleTutorialReplay = () => {
    if (!tutorialScreenKey) return;
    window.dispatchEvent(new CustomEvent('wake:tutorial-replay', { detail: { screenKey: tutorialScreenKey } }));
  };

  const feedbackSidebarWidth = isMobile ? 0 : 220;

  const sidebarClasses = [
    'dl-sidebar',
    sidebarAnimating ? 'dl-sidebar--entering' : '',
    isMobile ? (isSidebarVisible ? 'dl-sidebar--open' : 'dl-sidebar--hidden') : '',
  ].filter(Boolean).join(' ');

  return (
    <div className="dl-layout" style={{ '--feedback-sidebar-width': `${feedbackSidebarWidth}px` }}>

      {/* Mobile overlay */}
      {isMobile && isSidebarVisible && (
        <div className="dl-overlay" onClick={() => setIsSidebarVisible(false)} />
      )}

      {/* ── Sidebar ─────────────────────────────────────────────── */}
      <aside className={sidebarClasses}>

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
              className={`dl-nav-item ${item.match(location.pathname, location.state) ? 'dl-nav-item--active' : ''}`}
              onClick={() => navTo(item.path)}
              aria-current={item.match(location.pathname, location.state) ? 'page' : undefined}
            >
              <span className="dl-nav-item__icon">{item.icon}</span>
              <span className="dl-nav-item__label">{item.label}</span>
            </button>
          ))}
        </nav>

        {/* Developer section */}
        <div className="dl-sidebar__dev">
          <p className="dl-sidebar__dev-label">Desarrolladores</p>
          {DEV_NAV_ITEMS.map(item => (
            <button
              key={item.key}
              className={`dl-nav-item ${item.match(location.pathname, location.state) ? 'dl-nav-item--active' : ''}`}
              onClick={() => navTo(item.path)}
              aria-current={item.match(location.pathname, location.state) ? 'page' : undefined}
            >
              <span className="dl-nav-item__icon">{item.icon}</span>
              <span className="dl-nav-item__label">{item.label}</span>
            </button>
          ))}
        </div>

        {/* Footer */}
        <div className="dl-sidebar__footer">
          {/* Nav visibility settings */}
          <div className="dl-nav-settings" ref={settingsRef}>
            <Tooltip label="Personalizar menú" placement="right">
              <button
                className="dl-nav-settings__trigger"
                onClick={() => setSettingsOpen(v => !v)}
                aria-label="Personalizar navegación"
                title="Personalizar menú"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="M12 15a3 3 0 100-6 3 3 0 000 6z" stroke="currentColor" strokeWidth="1.8"/>
                  <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" stroke="currentColor" strokeWidth="1.8"/>
                </svg>
                <span>Personalizar</span>
              </button>
            </Tooltip>

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
          <Tooltip label="Tu perfil" placement="right">
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
                <p className="dl-user__sub">Perfil →</p>
              </div>
            </button>
          </Tooltip>
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
          headerRight={headerRight}
        />
        {children}
      </main>

      {/* ── Tutorial replay button ────────────────────────────────── */}
      {tutorialScreenKey && (
        <Tooltip label="Repetir tutorial" placement="left">
          <button
            type="button"
            className="dl-tutorial-replay"
            onClick={handleTutorialReplay}
            aria-label="Repetir tutorial"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.8"/>
              <text x="12" y="16.5" textAnchor="middle" fill="currentColor" fontSize="13" fontWeight="600">?</text>
            </svg>
          </button>
        </Tooltip>
      )}

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
      <CommandPalette />
    </div>
  );
};

export default DashboardLayout;
