import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import DashboardLayout from '../components/DashboardLayout';
import ErrorBoundary from '../components/ErrorBoundary';
import {
  GlowingEffect,
  TubelightNavBar,
  FullScreenError,
} from '../components/ui';
import ContextualHint from '../components/hints/ContextualHint';
import SimpleCreateOverlay from '../components/biblioteca/SimpleCreateOverlay';
import { extractAccentFromImage } from '../components/events/eventFieldComponents';
import eventService from '../services/eventService';
import { queryKeys, cacheConfig } from '../config/queryClient';
import logger from '../utils/logger';
import './EventsScreen.css';


const NAV_TABS = [
  { id: 'active', label: 'Activos' },
  { id: 'draft', label: 'Borradores' },
  { id: 'closed', label: 'Cerrados' },
];

function statusConfig(status) {
  if (status === 'active')  return { label: 'Activo',     cls: 'es-badge--active' };
  if (status === 'closed')  return { label: 'Completado', cls: 'es-badge--closed' };
  if (status === 'draft')   return { label: 'Borrador',   cls: 'es-badge--draft' };
  return { label: status, cls: '' };
}

function formatEventDate(ts) {
  if (!ts) return null;
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });
}

function getDaysUntil(ts) {
  if (!ts) return null;
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  const diff = Math.ceil((d - now) / (1000 * 60 * 60 * 24));
  return diff;
}

function countdownLabel(days) {
  if (days === null) return null;
  if (days < 0) return 'Finalizado';
  if (days === 0) return 'Hoy';
  if (days === 1) return 'Manana';
  return `En ${days} dias`;
}


function EventCard({ ev, copiedId, togglingId, confirmDeleteId, deletingId, menuOpenId, onCopyLink, onDelete, onToggleStatus, onMenuToggle, onConfirmDelete, onCancelDelete, navigate }) {
  const [accent, setAccent] = useState(null);

  useEffect(() => {
    if (!ev.image_url) return;
    return extractAccentFromImage(ev.image_url, setAccent);
  }, [ev.image_url]);

  const accentRgb = accent ? `${accent[0]}, ${accent[1]}, ${accent[2]}` : null;
  const strokeColor = accentRgb ? `rgba(${accentRgb}, 0.6)` : 'rgba(255,255,255,0.25)';
  const gradTopColor = accentRgb ? `rgba(${accentRgb}, 0.25)` : 'rgba(255,255,255,0.12)';
  const gradBotColor = accentRgb ? `rgba(${accentRgb}, 0)` : 'rgba(255,255,255,0)';

  const { label, cls } = statusConfig(ev.status);
  const count = ev.registration_count ?? 0;
  const max = ev.max_registrations;
  const pct = max ? Math.min(count / max * 100, 100) : null;
  const eventDate = formatEventDate(ev.date);
  const daysUntil = getDaysUntil(ev.date);
  const countdown = countdownLabel(daysUntil);
  const isCopied = copiedId === ev.id;
  const isToggling = togglingId === ev.id;
  const isConfirmingDelete = confirmDeleteId === ev.id;
  const isDeleting = deletingId === ev.id;
  const isMenuOpen = menuOpenId === ev.id;
  const isUrgent = daysUntil !== null && daysUntil >= 0 && daysUntil <= 3;
  const isClosed = ev.status === 'closed';

  return (
    <motion.div
      layout
      className="es-card"
      style={{ position: 'relative' }}
      onClick={() => { if (isMenuOpen) { onMenuToggle(null); } else { navigate(`/events/${ev.id}/results`); } }}
      whileHover={{ y: -3, borderColor: 'rgba(255,255,255,0.12)' }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
    >
      <GlowingEffect />

      {/* Cover */}
      <div className="es-card-cover">
        {ev.image_url
          ? <img src={ev.image_url} alt={ev.title} className="es-cover-img" loading="lazy" />
          : (
            <div className="es-cover-placeholder">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" strokeWidth="0" />
                <polyline points="21 15 16 10 5 21" />
              </svg>
            </div>
          )
        }
        <span className={`es-badge ${cls}`}>{label}</span>
      </div>

      {/* Body */}
      <div className="es-card-body">
        <div className="es-card-header">
          <h3 className="es-card-title">{ev.title}</h3>
          {countdown && ev.status === 'active' && (
            <motion.span
              className={`es-countdown ${isUrgent ? 'es-countdown--urgent' : ''}`}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: 'spring', stiffness: 500, damping: 25 }}
            >
              {countdown}
            </motion.span>
          )}
        </div>

        <div className="es-card-meta">
          {eventDate && (
            <span className="es-meta-item">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              {eventDate}
            </span>
          )}
          {ev.location && (
            <span className="es-meta-item">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              {ev.location}
            </span>
          )}
        </div>

        <div className="es-card-content">
          <div className="es-card-left">
            {isClosed ? (
              <div className="es-stat-block">
                <span className="es-stat-big">{count > 0 ? Math.round((ev.checked_in_count ?? 0) / count * 100) : 0}%</span>
                <span className="es-stat-sub">asistencia</span>
                <span className="es-stat-detail">{ev.checked_in_count ?? 0} de {count} asistieron</span>
              </div>
            ) : (
              <div className="es-stat-block">
                <span className="es-stat-big">{count}</span>
                <span className="es-stat-sub">inscritos{max ? ` de ${max}` : ''}</span>
                {pct !== null && pct >= 80 && (
                  <span className="es-stat-detail es-stat-detail--hot">
                    {pct >= 100 ? 'Lleno' : `${Math.round(pct)}% lleno`}
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="es-card-chart">
            <svg viewBox="0 0 120 60" preserveAspectRatio="none" className="es-mini-chart">
              <defs>
                <linearGradient id={`grad-${ev.id}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={gradTopColor} />
                  <stop offset="100%" stopColor={gradBotColor} />
                </linearGradient>
              </defs>
              {count > 0 && (
                <>
                  <motion.path
                    d="M0,55 C20,52 35,45 50,38 C65,30 80,20 95,15 C105,12 115,10 120,9 L120,60 L0,60 Z"
                    fill={`url(#grad-${ev.id})`}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.8, delay: 0.3 }}
                  />
                  <motion.path
                    d="M0,55 C20,52 35,45 50,38 C65,30 80,20 95,15 C105,12 115,10 120,9"
                    fill="none"
                    stroke={strokeColor}
                    strokeWidth="1.5"
                    initial={{ pathLength: 0, opacity: 0 }}
                    animate={{ pathLength: 1, opacity: 1 }}
                    transition={{ duration: 1.2, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
                  />
                </>
              )}
              {count === 0 && (
                <line x1="0" y1="55" x2="120" y2="55" stroke="rgba(255,255,255,0.06)" strokeWidth="1" strokeDasharray="3,3" />
              )}
            </svg>
            <span className="es-chart-label">Inscripciones</span>
          </div>
        </div>

        <div className="es-actions">
          {ev.status === 'active' && (
            <button
              className="es-action-btn es-action-btn--close"
              onClick={(e) => { e.stopPropagation(); onToggleStatus(ev); }}
              disabled={isToggling}
            >
              {isToggling ? '...' : 'Cerrar evento'}
            </button>
          )}
          {ev.status === 'closed' && (
            <button
              className="es-action-btn es-action-btn--close"
              onClick={(e) => { e.stopPropagation(); onToggleStatus(ev); }}
              disabled={isToggling}
            >
              {isToggling ? '...' : 'Reabrir'}
            </button>
          )}
          <button
            className="es-action-btn es-action-btn--copy"
            onClick={(e) => { e.stopPropagation(); onCopyLink(ev); }}
          >
            <AnimatePresence mode="wait">
              {isCopied ? (
                <motion.span
                  key="copied"
                  className="es-copy-inner"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 25 }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  Copiado
                </motion.span>
              ) : (
                <motion.span
                  key="copy"
                  className="es-copy-inner"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 25 }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
                    <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
                  </svg>
                  Copiar link
                </motion.span>
              )}
            </AnimatePresence>
          </button>

          <AnimatePresence mode="wait">
            {isConfirmingDelete ? (
              <motion.div
                key="confirm"
                className="es-delete-confirm"
                onClick={(e) => e.stopPropagation()}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
              >
                <span className="es-delete-label">Eliminar?</span>
                <button
                  className="es-action-btn es-action-btn--danger"
                  onClick={() => onDelete(ev)}
                  disabled={isDeleting}
                >
                  {isDeleting ? '...' : 'Si'}
                </button>
                <button
                  className="es-action-btn"
                  onClick={() => onCancelDelete()}
                  disabled={isDeleting}
                >
                  No
                </button>
              </motion.div>
            ) : (
              <motion.div
                key="menu"
                className="es-menu-wrap"
                onClick={(e) => e.stopPropagation()}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
              >
                <button
                  className="es-menu-trigger"
                  aria-label="Mas opciones"
                  onClick={() => onMenuToggle(isMenuOpen ? null : ev.id)}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <circle cx="12" cy="5" r="1.5" />
                    <circle cx="12" cy="12" r="1.5" />
                    <circle cx="12" cy="19" r="1.5" />
                  </svg>
                </button>
                <AnimatePresence>
                  {isMenuOpen && (
                    <motion.div
                      className="es-dropdown"
                      initial={{ opacity: 0, y: 6, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 6, scale: 0.95 }}
                      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                    >
                      <button
                        className="es-dropdown-item"
                        onClick={() => navigate(`/events/${ev.id}`)}
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                        Editar
                      </button>
                      {ev.status !== 'draft' && (
                        <button
                          className="es-dropdown-item"
                          onClick={() => onToggleStatus(ev)}
                          disabled={isToggling}
                        >
                          {isToggling ? '...' : ev.status === 'active' ? 'Cerrar evento' : 'Reabrir evento'}
                        </button>
                      )}
                      <div className="es-dropdown-divider" />
                      <button
                        className="es-dropdown-item es-dropdown-item--danger"
                        onClick={() => { onConfirmDelete(ev.id); onMenuToggle(null); }}
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
                          <path d="M10 11v6M14 11v6" />
                          <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" />
                        </svg>
                        Eliminar
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}

export default function EventsScreen() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [activeFilter, setActiveFilter] = useState('active');
  const [menuOpenId, setMenuOpenId] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const copiedTimerRef = useRef(null);
  const [togglingId, setTogglingId] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createSuccess, setCreateSuccess] = useState(false);

  useEffect(() => {
    return () => { if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current); };
  }, []);

  const { data: events = [], isLoading, isError } = useQuery({
    queryKey: queryKeys.events.byCreator(user?.uid),
    queryFn: async () => {
      const result = await eventService.getEventsByCreator(user.uid);
      return result;
    },
    enabled: !!user,
    ...cacheConfig.events,
  });

  const deleteMutation = useMutation({
    mutationKey: ['events', 'delete'],
    mutationFn: (eventId) => eventService.deleteEvent(eventId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.events.byCreator(user.uid) }),
    onError: (err) => {
      logger.error('[EventsScreen] delete failed', err);
      showToast('No pudimos eliminar el evento', 'error');
    },
  });

  const toggleMutation = useMutation({
    mutationKey: ['events', 'toggle-status'],
    mutationFn: async ({ eventId, nextStatus }) => {
      const result = await eventService.updateEvent(eventId, { status: nextStatus });
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.events.byCreator(user.uid) });
    },
    onError: (err) => {
      console.error('[EventsScreen] toggle status failed', err);
      showToast('No pudimos cambiar el estado del evento', 'error');
    },
  });

  const createMutation = useMutation({
    mutationKey: ['events', 'create'],
    mutationFn: async (title) => {
      const eventData = {
        title,
        description: '',
        date: null,
        location: '',
        access: 'public',
        max_registrations: null,
        settings: {
          confirmation_message: '',
          send_confirmation_email: false,
          enable_qr_checkin: false,
          show_registration_count: false,
        },
        status: 'draft',
        fields: [],
        image_url: '',
        creator_id: user.uid,
        registration_count: 0,
      };
      return eventService.createEvent(null, eventData);
    },
    onSuccess: (data) => {
      setCreateSuccess(true);
      queryClient.invalidateQueries({ queryKey: queryKeys.events.byCreator(user.uid) });
      const eventId = data?.eventId || data?.id;
      setTimeout(() => {
        setShowCreateModal(false);
        setCreateSuccess(false);
        navigate(`/events/${eventId}/edit`);
      }, 1200);
    },
    onError: (err) => {
      logger.error('[EventsScreen] create failed', err);
      showToast('No pudimos crear el evento', 'error');
    },
  });

  async function copyLink(ev) {
    const url = `https://wakelab.co/e/${ev.id}`;
    try {
      await navigator.clipboard.writeText(url);
      showToast('Enlace copiado', 'success');
    } catch {
      showToast('No se pudo copiar el enlace', 'error');
    }
    setCopiedId(ev.id);
    if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    copiedTimerRef.current = setTimeout(() => setCopiedId(null), 2000);
    setMenuOpenId(null);
  }

  async function deleteEvent(ev) {
    setDeletingId(ev.id);
    try {
      await deleteMutation.mutateAsync(ev.id);
    } finally {
      setDeletingId(null);
      setConfirmDeleteId(null);
    }
  }

  async function toggleStatus(ev) {
    const nextStatus = ev.status === 'active' ? 'closed' : 'active';
    setTogglingId(ev.id);
    setMenuOpenId(null);
    try {
      await toggleMutation.mutateAsync({ eventId: ev.id, nextStatus });
    } catch (err) {
      console.error('[EventsScreen] toggleStatus failed', err);
    } finally {
      setTogglingId(null);
    }
  }

  const filtered = events.filter((ev) => ev.status === activeFilter);

  const navTabs = useMemo(() => {
    const counts = { active: 0, draft: 0, closed: 0 };
    events.forEach((ev) => { if (counts[ev.status] != null) counts[ev.status]++; });
    return NAV_TABS.map((tab) => ({ ...tab, badge: counts[tab.id] }));
  }, [events]);

  const spring = { type: 'spring', stiffness: 400, damping: 30 };

  return (
    <ErrorBoundary>
      <DashboardLayout screenName="Eventos">
        <div className="es-screen">

          {/* ── Header ── */}
          <motion.div
            className="es-header"
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...spring, delay: 0 }}
          >
            <div className="es-header-text">
              <h1 className="es-title">Eventos</h1>
            </div>
            <motion.button
              className="es-primary-btn"
              data-tutorial="events-create"
              onClick={() => setShowCreateModal(true)}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              transition={spring}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Nuevo evento
            </motion.button>
          </motion.div>

          {/* ── Nav tabs ── */}
          <div data-tutorial="events-list">
          <motion.div
            className="es-nav-wrap"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...spring, delay: 0.05 }}
          >
            <TubelightNavBar
              items={navTabs}
              activeId={activeFilter}
              onSelect={setActiveFilter}
            />
          </motion.div>

          {/* ── Content ── */}
          <AnimatePresence mode="wait">
            {isLoading ? (
              <motion.div
                key="loading"
                className="es-grid"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                {[...Array(3)].map((_, i) => (
                  <motion.div
                    key={i}
                    className="es-card es-card--skeleton"
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ ...spring, delay: i * 0.08 }}
                  >
                    <div className="es-card-cover es-skeleton-shimmer" />
                    <div className="es-card-body">
                      <div className="es-skeleton-line es-skeleton-line--title" />
                      <div className="es-skeleton-line es-skeleton-line--meta" />
                      <div style={{ flex: 1 }} />
                      <div className="es-skeleton-line" />
                    </div>
                  </motion.div>
                ))}
              </motion.div>
            ) : isError ? (
              <motion.div
                key="error"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={spring}
              >
                <FullScreenError
                  title="No pudimos cargar tus eventos"
                  message="Verifica tu conexion e intenta de nuevo."
                  onRetry={() => queryClient.invalidateQueries({ queryKey: queryKeys.events.byCreator(user?.uid) })}
                />
              </motion.div>
            ) : filtered.length === 0 ? (
              <motion.div
                key={`empty-${activeFilter}`}
                className="es-empty"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={spring}
              >
                <motion.div
                  className="es-empty-icon"
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ ...spring, delay: 0.1 }}
                >
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2">
                    <rect x="3" y="4" width="18" height="18" rx="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                </motion.div>
                <motion.p
                  className="es-empty-title"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ ...spring, delay: 0.15 }}
                >
                  {activeFilter === 'active' && 'No tienes eventos activos'}
                  {activeFilter === 'draft' && 'Ningun borrador guardado'}
                  {activeFilter === 'closed' && 'Sin eventos cerrados'}
                </motion.p>
                <motion.p
                  className="es-empty-sub"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ ...spring, delay: 0.2 }}
                >
                  {activeFilter === 'active' && 'Crea uno y compartelo con tu audiencia.'}
                  {activeFilter === 'draft' && 'Los borradores que guardes van a aparecer aca.'}
                  {activeFilter === 'closed' && 'Los eventos que cierres van a aparecer aca.'}
                </motion.p>
                {activeFilter === 'active' && (
                  <motion.button
                    className="es-primary-btn"
                    onClick={() => setShowCreateModal(true)}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    transition={{ ...spring, delay: 0.25 }}
                  >
                    Crear primer evento
                  </motion.button>
                )}
              </motion.div>
            ) : (
              <motion.div
                key={`list-${activeFilter}`}
                className="es-grid"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                {filtered.map((ev, i) => (
                  <motion.div
                    key={ev.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ ...spring, delay: i * 0.06 }}
                  >
                    <EventCard
                      ev={ev}
                      copiedId={copiedId}
                      togglingId={togglingId}
                      confirmDeleteId={confirmDeleteId}
                      deletingId={deletingId}
                      menuOpenId={menuOpenId}
                      onCopyLink={copyLink}
                      onDelete={deleteEvent}
                      onToggleStatus={toggleStatus}
                      onMenuToggle={setMenuOpenId}
                      onConfirmDelete={setConfirmDeleteId}
                      onCancelDelete={() => setConfirmDeleteId(null)}
                      navigate={navigate}
                    />
                  </motion.div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
          </div>

          <ContextualHint screenKey="events" />

          <SimpleCreateOverlay
            isOpen={showCreateModal}
            onClose={() => { if (!createMutation.isPending) setShowCreateModal(false); }}
            title="Nuevo evento"
            description="Dale un nombre a tu evento. Podras editar todos los detalles despues."
            placeholder="Ej. Run Club Marzo 2026"
            ctaLabel="Crear evento"
            creatingText="Creando evento"
            successTitle="Evento creado"
            successDesc="Ahora configura los detalles de tu evento."
            onSubmit={(name) => createMutation.mutate(name)}
            isPending={createMutation.isPending}
            isSuccess={createSuccess}
          />
        </div>
      </DashboardLayout>
    </ErrorBoundary>
  );
}
