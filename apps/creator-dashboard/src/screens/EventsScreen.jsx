import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import DashboardLayout from '../components/DashboardLayout';
import ErrorBoundary from '../components/ErrorBoundary';
import {
  GlowingEffect,
  TubelightNavBar,
  ProgressRing,
  SkeletonCard,
  AnimatedList,
} from '../components/ui';
import eventService from '../services/eventService';
import { queryKeys, cacheConfig } from '../config/queryClient';
import logger from '../utils/logger';
import './EventsScreen.css';

const NAV_TABS = [
  { id: 'active', label: 'Activos' },
  { id: 'draft', label: 'Borradores' },
  { id: 'closed', label: 'Pasados' },
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


export default function EventsScreen() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [activeFilter, setActiveFilter] = useState('active');
  const [menuOpenId, setMenuOpenId] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const [togglingId, setTogglingId] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const { data: events = [], isLoading, isError } = useQuery({
    queryKey: queryKeys.events.byCreator(user?.uid),
    queryFn: () => eventService.getEventsByCreator(user.uid),
    enabled: !!user,
    ...cacheConfig.events,
  });

  const deleteMutation = useMutation({
    mutationFn: (eventId) => eventService.deleteEvent(eventId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.events.byCreator(user.uid) }),
    onError: (err) => {
      logger.error('[EventsScreen] delete failed', err);
      showToast('Error al eliminar el evento', 'error');
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ eventId, nextStatus }) => eventService.updateEvent(eventId, { status: nextStatus }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.events.byCreator(user.uid) }),
    onError: (err) => {
      logger.error('[EventsScreen] toggle status failed', err);
      showToast('Error al cambiar el estado del evento', 'error');
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
    setTimeout(() => setCopiedId(null), 2000);
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
    } finally {
      setTogglingId(null);
    }
  }

  const filtered = events.filter((ev) => ev.status === activeFilter);

  return (
    <ErrorBoundary>
      <DashboardLayout screenName="Eventos">
        <div className="es-screen">

          {/* ── Header ── */}
          <div className="es-header">
            <div className="es-header-text">
              <h1 className="es-title">Eventos</h1>
            </div>
            <button className="es-primary-btn" onClick={() => navigate('/events/new')}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Nuevo evento
            </button>
          </div>

          {/* ── Nav tabs ── */}
          <TubelightNavBar
            items={NAV_TABS}
            activeId={activeFilter}
            onSelect={setActiveFilter}
            className="es-nav"
          />

          {/* ── Content ── */}
          {isLoading ? (
            <div className="es-grid">
              {[...Array(4)].map((_, i) => <SkeletonCard key={i} />)}
            </div>
          ) : isError ? (
            <div className="es-empty">
              <p className="es-empty-title">Error al cargar eventos</p>
              <p className="es-empty-sub">Intenta recargar la página</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="es-empty">
              <div className="es-empty-icon">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2">
                  <rect x="3" y="4" width="18" height="18" rx="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
              </div>
              <p className="es-empty-title">
                {activeFilter === 'all' ? 'Sin eventos' : `Sin eventos ${NAV_TABS.find(t => t.id === activeFilter)?.label.toLowerCase()}`}
              </p>
              <p className="es-empty-sub">Crea tu primer evento para empezar a recibir registros</p>
              {activeFilter === 'all' && (
                <button className="es-primary-btn" onClick={() => navigate('/events/new')}>
                  Crear primer evento
                </button>
              )}
            </div>
          ) : (
            <AnimatedList className="es-grid" stagger={60}>
              {filtered.map((ev) => {
                const { label, cls } = statusConfig(ev.status);
                const count = ev.registration_count ?? 0;
                const max = ev.max_registrations;
                const pct = max ? Math.min(count / max * 100, 100) : null;
                const eventDate = formatEventDate(ev.date);
                const isCopied = copiedId === ev.id;
                const isToggling = togglingId === ev.id;
                const isConfirmingDelete = confirmDeleteId === ev.id;
                const isDeleting = deletingId === ev.id;
                const isMenuOpen = menuOpenId === ev.id;

                return (
                  <div
                    key={ev.id}
                    className="es-card"
                    style={{ position: 'relative' }}
                    onClick={() => { if (isMenuOpen) setMenuOpenId(null); }}
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
                      <h3 className="es-card-title">{ev.title}</h3>

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

                      {/* Attendance badge */}
                      <div className="es-attendance">
                        <span className="es-attendance-num">{count}{max ? ` / ${max}` : ''}</span>
                        <span className="es-attendance-label">inscritos</span>
                      </div>

                      {pct !== null && (
                        <div className="es-capacity-row">
                          <ProgressRing
                            percent={pct}
                            size={36}
                            strokeWidth={3}
                            color="rgba(255,255,255,0.7)"
                            label={`${Math.round(pct)}%`}
                          />
                          <span className="es-capacity-label">{count}{max ? ` / ${max}` : ''} cupos</span>
                        </div>
                      )}

                      {/* Actions row */}
                      <div className="es-actions">
                        <button
                          className="es-btn es-btn--primary"
                          onClick={(e) => { e.stopPropagation(); navigate(`/events/${ev.id}/results`); }}
                        >
                          Gestionar
                        </button>

                        {isConfirmingDelete ? (
                          <div className="es-delete-confirm" onClick={(e) => e.stopPropagation()}>
                            <span className="es-delete-label">¿Eliminar?</span>
                            <button
                              className="es-btn es-btn--danger"
                              onClick={() => deleteEvent(ev)}
                              disabled={isDeleting}
                            >
                              {isDeleting ? '…' : 'Sí'}
                            </button>
                            <button
                              className="es-btn"
                              onClick={() => setConfirmDeleteId(null)}
                              disabled={isDeleting}
                            >
                              No
                            </button>
                          </div>
                        ) : (
                          <>
                            {/* 3-dot menu */}
                            <div className="es-menu-wrap" onClick={(e) => e.stopPropagation()}>
                              <button
                                className="es-menu-trigger"
                                aria-label="Más opciones"
                                onClick={() => setMenuOpenId(isMenuOpen ? null : ev.id)}
                              >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                  <circle cx="12" cy="5" r="1.5" />
                                  <circle cx="12" cy="12" r="1.5" />
                                  <circle cx="12" cy="19" r="1.5" />
                                </svg>
                              </button>
                              {isMenuOpen && (
                                <div className="es-dropdown">
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
                                  <button
                                    className="es-dropdown-item"
                                    onClick={() => copyLink(ev)}
                                  >
                                    {isCopied ? (
                                      <>
                                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                          <polyline points="20 6 9 17 4 12" />
                                        </svg>
                                        Copiado
                                      </>
                                    ) : (
                                      <>
                                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                          <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
                                          <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
                                        </svg>
                                        Copiar link
                                      </>
                                    )}
                                  </button>
                                  {ev.status !== 'draft' && (
                                    <button
                                      className="es-dropdown-item"
                                      onClick={() => toggleStatus(ev)}
                                      disabled={isToggling}
                                    >
                                      {isToggling ? '…' : ev.status === 'active' ? 'Cerrar evento' : 'Reabrir evento'}
                                    </button>
                                  )}
                                  <div className="es-dropdown-divider" />
                                  <button
                                    className="es-dropdown-item es-dropdown-item--danger"
                                    onClick={() => { setConfirmDeleteId(ev.id); setMenuOpenId(null); }}
                                  >
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                      <polyline points="3 6 5 6 21 6" />
                                      <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
                                      <path d="M10 11v6M14 11v6" />
                                      <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" />
                                    </svg>
                                    Eliminar
                                  </button>
                                </div>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </AnimatedList>
          )}
        </div>
      </DashboardLayout>
    </ErrorBoundary>
  );
}
