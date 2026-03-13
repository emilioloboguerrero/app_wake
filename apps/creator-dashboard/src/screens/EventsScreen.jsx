import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import DashboardLayout from '../components/DashboardLayout';
import ErrorBoundary from '../components/ErrorBoundary';
import ScreenSkeleton from '../components/ScreenSkeleton';
import eventService from '../services/eventService';
import { queryKeys, cacheConfig } from '../config/queryClient';
import logger from '../utils/logger';
import './EventsScreen.css';

function statusConfig(status) {
  if (status === 'active')  return { label: 'Activo',   cls: 'events-badge--active' };
  if (status === 'closed')  return { label: 'Cerrado',  cls: 'events-badge--closed' };
  if (status === 'draft')   return { label: 'Borrador', cls: 'events-badge--draft' };
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
  const [copiedId, setCopiedId] = useState(null);
  const [togglingId, setTogglingId] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const { data: events = [], isLoading } = useQuery({
    queryKey: queryKeys.events.byCreator(user?.uid),
    queryFn: () => eventService.getEventsByCreator(user.uid),
    enabled: !!user,
    ...cacheConfig.events,
  });

  const deleteMutation = useMutation({
    mutationFn: (eventId) => eventService.deleteEvent(eventId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.events.byCreator(user.uid) }),
    onError: (err) => logger.error('[EventsScreen] delete failed', err),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ eventId, nextStatus }) => eventService.updateEvent(eventId, { status: nextStatus }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.events.byCreator(user.uid) }),
    onError: (err) => logger.error('[EventsScreen] toggle status failed', err),
  });

  async function copyLink(ev) {
    const url = `https://wakelab.co/e/${ev.id}`;
    await navigator.clipboard.writeText(url).catch(() => {});
    setCopiedId(ev.id);
    setTimeout(() => setCopiedId(null), 2000);
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
    try {
      await toggleMutation.mutateAsync({ eventId: ev.id, nextStatus });
    } finally {
      setTogglingId(null);
    }
  }

  return (
    <ErrorBoundary>
      <DashboardLayout screenName="Eventos">
        <div className="events-screen">
          <div className="events-header">
            <div>
              <h1 className="events-title">Eventos</h1>
              {!isLoading && (
                <p className="events-subtitle">
                  {events.length === 0 ? 'Sin eventos' : `${events.length} evento${events.length !== 1 ? 's' : ''}`}
                </p>
              )}
            </div>
            <button
              className="events-new-btn"
              onClick={() => navigate('/events/new')}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Nuevo evento
            </button>
          </div>

          {isLoading ? (
            <ScreenSkeleton />
          ) : events.length === 0 ? (
            <div className="events-empty-state">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2">
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              <p>Aún no tienes eventos.</p>
              <button
                className="events-new-btn"
                onClick={() => navigate('/events/new')}
              >
                Crear primer evento
              </button>
            </div>
          ) : (
            <div className="events-list">
              {events.map(ev => {
                const { label, cls } = statusConfig(ev.status);
                const count = ev.registration_count ?? 0;
                const max = ev.max_registrations;
                const pct = max ? Math.min(count / max * 100, 100) : null;
                const eventDate = formatEventDate(ev.date);
                const isCopied = copiedId === ev.id;
                const isToggling = togglingId === ev.id;
                const isConfirmingDelete = confirmDeleteId === ev.id;
                const isDeleting = deletingId === ev.id;

                return (
                  <div key={ev.id} className="events-card events-fade-in">
                    <div className="events-card-cover">
                      {ev.image_url
                        ? <img src={ev.image_url} alt={ev.title} className="events-card-cover-img" />
                        : <div className="events-card-cover-placeholder">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                              <rect x="3" y="3" width="18" height="18" rx="2" />
                              <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" strokeWidth="0" />
                              <polyline points="21 15 16 10 5 21" />
                            </svg>
                          </div>
                      }
                    </div>

                    <div className="events-card-body">
                      <div className="events-card-top">
                        <div className="events-card-info">
                          <div className="events-card-title-row">
                            <h3 className="events-card-title">{ev.title}</h3>
                            <span className={`events-badge ${cls}`}>{label}</span>
                          </div>
                          <div className="events-card-meta">
                            {eventDate && (
                              <span className="events-meta-item">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <rect x="3" y="4" width="18" height="18" rx="2" />
                                  <line x1="16" y1="2" x2="16" y2="6" />
                                  <line x1="8" y1="2" x2="8" y2="6" />
                                  <line x1="3" y1="10" x2="21" y2="10" />
                                </svg>
                                {eventDate}
                              </span>
                            )}
                            {ev.location && (
                              <span className="events-meta-item">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
                                  <circle cx="12" cy="10" r="3" />
                                </svg>
                                {ev.location}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="events-card-count">
                          <span className="events-count-num">
                            {count}{max ? ` / ${max}` : ''}
                          </span>
                          <span className="events-count-label">registros</span>
                        </div>
                      </div>

                      {pct !== null && (
                        <div className="events-capacity-bar-outer">
                          <div className="events-capacity-bar-fill" style={{ width: `${pct}%` }} />
                        </div>
                      )}

                      <div className="events-card-actions">
                        <button
                          className="events-action-btn events-action-btn--primary"
                          onClick={() => navigate(`/events/${ev.id}/results`)}
                        >
                          Gestionar
                        </button>
                        <button
                          className={`events-action-btn${isCopied ? ' events-action-btn--copied' : ''}`}
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
                              Link
                            </>
                          )}
                        </button>
                        <button
                          className="events-action-btn events-action-btn--toggle"
                          onClick={() => toggleStatus(ev)}
                          disabled={isToggling || ev.status === 'draft'}
                          title={ev.status === 'draft' ? 'Publica el evento desde el editor' : undefined}
                        >
                          {isToggling ? '…' : ev.status === 'active' ? 'Cerrar' : ev.status === 'closed' ? 'Reabrir' : 'Borrador'}
                        </button>

                        {isConfirmingDelete ? (
                          <div className="events-delete-confirm">
                            <span className="events-delete-confirm-label">¿Eliminar?</span>
                            <button
                              className="events-action-btn events-action-btn--danger-confirm"
                              onClick={() => deleteEvent(ev)}
                              disabled={isDeleting}
                            >
                              {isDeleting ? '…' : 'Sí'}
                            </button>
                            <button
                              className="events-action-btn"
                              onClick={() => setConfirmDeleteId(null)}
                              disabled={isDeleting}
                            >
                              No
                            </button>
                          </div>
                        ) : (
                          <button
                            className="events-action-btn events-action-btn--delete"
                            onClick={() => setConfirmDeleteId(ev.id)}
                            title="Eliminar evento"
                          >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <polyline points="3 6 5 6 21 6" />
                              <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
                              <path d="M10 11v6M14 11v6" />
                              <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </DashboardLayout>
    </ErrorBoundary>
  );
}
