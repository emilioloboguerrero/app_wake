import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { STALE_TIMES, GC_TIMES } from '../config/queryConfig';
import { auth } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext';
import eventService from '../services/eventService';
import { FixedWakeHeader, WakeHeaderSpacer } from '../components/WakeHeader';
import WakeLoader from '../components/WakeLoader';

function statusConfig(status) {
  if (status === 'active')  return { label: 'Activo',   color: '#4ade80' };
  if (status === 'closed')  return { label: 'Cerrado',  color: 'rgba(255,255,255,0.4)' };
  if (status === 'draft')   return { label: 'Borrador', color: 'rgba(255,255,255,0.25)' };
  return { label: status, color: 'rgba(255,255,255,0.4)' };
}

function formatEventDate(ts) {
  if (!ts) return null;
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function EventsManagementScreen() {
  const { user: contextUser } = useAuth();
  const user = contextUser || auth.currentUser;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [copiedId, setCopiedId] = useState(null);
  const [togglingId, setTogglingId] = useState(null);

  const eventsQueryKey = ['events', 'creator', user?.uid];

  const { data: events = [], isLoading: loading } = useQuery({
    queryKey: eventsQueryKey,
    queryFn: () => eventService.getEventsByCreator(user.uid),
    enabled: !!user?.uid,
    staleTime: STALE_TIMES.events,
    gcTime: GC_TIMES.events,
  });

  const toggleStatusMutation = useMutation({
    mutationFn: ({ eventId, nextStatus }) => eventService.updateEventStatus(eventId, nextStatus),
    onMutate: async ({ eventId, nextStatus }) => {
      setTogglingId(eventId);
      await queryClient.cancelQueries({ queryKey: eventsQueryKey });
      const previous = queryClient.getQueryData(eventsQueryKey);
      queryClient.setQueryData(eventsQueryKey, old =>
        old?.map(e => e.id === eventId ? { ...e, status: nextStatus } : e)
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      queryClient.setQueryData(eventsQueryKey, context.previous);
    },
    onSettled: () => {
      setTogglingId(null);
      queryClient.invalidateQueries({ queryKey: eventsQueryKey });
    },
  });

  async function copyLink(ev) {
    const url = `https://wakelab.co/e/${ev.id}`;
    await navigator.clipboard.writeText(url).catch(() => {});
    setCopiedId(ev.id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  function toggleStatus(ev) {
    const nextStatus = ev.status === 'active' ? 'closed' : 'active';
    toggleStatusMutation.mutate({ eventId: ev.id, nextStatus });
  }

  if (loading) {
    return (
      <div style={s.screen}>
        <FixedWakeHeader showBackButton onBackPress={() => navigate('/profile')} />
        <div style={s.loaderWrap}>
          <WakeLoader />
        </div>
      </div>
    );
  }

  return (
    <div style={s.screen}>
      <FixedWakeHeader showBackButton onBackPress={() => navigate('/profile')} />

      <div style={s.content}>
        <WakeHeaderSpacer />
        <div style={s.pageHeader}>
          <h1 style={s.title}>Mis Eventos</h1>
          <p style={s.subtitle}>
            {events.length === 0 ? 'Sin eventos' : `${events.length} evento${events.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        {events.length === 0 ? (
          <div style={s.emptyState}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1.2">
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            <p style={s.emptyText}>Aún no tienes eventos.</p>
            <p style={s.emptyHint}>Crea tus eventos desde el panel de creador.</p>
          </div>
        ) : (
          <div style={s.list}>
            {events.map(ev => {
              const { label, color } = statusConfig(ev.status);
              const count = ev.registration_count ?? 0;
              const max = ev.max_registrations;
              const pct = max ? Math.min(count / max * 100, 100) : null;
              const eventDate = formatEventDate(ev.date);
              const isCopied = copiedId === ev.id;
              const isToggling = togglingId === ev.id;

              return (
                <div
                  key={ev.id}
                  style={s.card}
                  onClick={() => navigate(`/creator/events/${ev.id}/registrations`)}
                >
                  {/* Cover */}
                  {ev.image_url ? (
                    <img src={ev.image_url} alt={ev.title} style={s.cover} />
                  ) : (
                    <div style={s.coverPlaceholder}>
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5">
                        <rect x="3" y="3" width="18" height="18" rx="2" />
                        <circle cx="8.5" cy="8.5" r="1.5" fill="rgba(255,255,255,0.2)" strokeWidth="0" />
                        <polyline points="21 15 16 10 5 21" />
                      </svg>
                    </div>
                  )}

                  {/* Body */}
                  <div style={s.cardBody}>
                    <div style={s.cardTop}>
                      <div style={s.cardInfo}>
                        <div style={s.titleRow}>
                          <span style={s.cardTitle}>{ev.title}</span>
                          <span style={{ ...s.badge, color }}>{label}</span>
                        </div>
                        {(eventDate || ev.location) && (
                          <div style={s.meta}>
                            {eventDate && <span style={s.metaItem}>{eventDate}</span>}
                            {ev.location && <span style={s.metaItem}>{ev.location}</span>}
                          </div>
                        )}
                      </div>
                      <div style={s.countBox}>
                        <span style={s.countNum}>{count}{max ? ` / ${max}` : ''}</span>
                        <span style={s.countLabel}>registros</span>
                      </div>
                    </div>

                    {pct !== null && (
                      <div style={s.barOuter}>
                        <div style={{ ...s.barFill, width: `${pct}%` }} />
                      </div>
                    )}

                    {/* Actions */}
                    <div style={s.actions} onClick={e => e.stopPropagation()}>
                      <button
                        style={{ ...s.btn, ...s.btnPrimary }}
                        onClick={() => navigate(`/creator/events/${ev.id}/checkin`)}
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="3" y="3" width="7" height="7" rx="1" />
                          <rect x="14" y="3" width="7" height="7" rx="1" />
                          <rect x="3" y="14" width="7" height="7" rx="1" />
                          <rect x="14" y="14" width="3" height="3" rx="0.5" />
                          <rect x="18" y="14" width="3" height="3" rx="0.5" />
                          <rect x="14" y="18" width="3" height="3" rx="0.5" />
                          <rect x="18" y="18" width="3" height="3" rx="0.5" />
                        </svg>
                        Check-in
                      </button>
                      <button
                        style={isCopied ? { ...s.btn, ...s.btnCopied } : s.btn}
                        onClick={() => copyLink(ev)}
                      >
                        {isCopied ? '✓ Copiado' : 'Copiar link'}
                      </button>
                      <button
                        style={s.btn}
                        onClick={() => toggleStatus(ev)}
                        disabled={isToggling || ev.status === 'draft'}
                      >
                        {isToggling ? '…' : ev.status === 'active' ? 'Cerrar' : ev.status === 'closed' ? 'Reabrir' : 'Borrador'}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

const s = {
  screen: {
    minHeight: '100%',
    backgroundColor: '#1a1a1a',
    paddingBottom: 96,
  },
  loaderWrap: {
    position: 'fixed',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    padding: '0 16px 20px',
  },
  pageHeader: {
    paddingTop: 'max(16px, 2vh)',
    paddingLeft: 20,
    marginBottom: 'max(16px, 2vh)',
  },
  title: {
    color: '#ffffff',
    fontSize: 'clamp(26px, 8vw, 32px)',
    fontWeight: '600',
    margin: '0 0 6px',
  },
  subtitle: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 13,
    margin: 0,
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 12,
    padding: '60px 24px',
    textAlign: 'center',
  },
  emptyText: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 15,
    margin: 0,
  },
  emptyHint: {
    color: 'rgba(255,255,255,0.2)',
    fontSize: 13,
    margin: 0,
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
  },
  card: {
    backgroundColor: '#2a2a2a',
    borderRadius: 14,
    border: '1px solid rgba(255,255,255,0.1)',
    overflow: 'hidden',
    cursor: 'pointer',
  },
  cover: {
    width: '100%',
    height: 120,
    objectFit: 'cover',
    display: 'block',
  },
  coverPlaceholder: {
    width: '100%',
    height: 80,
    backgroundColor: 'rgba(255,255,255,0.04)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: {
    padding: '14px 14px 12px',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  cardTop: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  cardInfo: {
    flex: 1,
    minWidth: 0,
  },
  titleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  cardTitle: {
    color: '#ffffff',
    fontWeight: 700,
    fontSize: 15,
  },
  badge: {
    fontSize: 11,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  },
  meta: {
    display: 'flex',
    gap: 10,
    marginTop: 4,
    flexWrap: 'wrap',
  },
  metaItem: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 12,
  },
  countBox: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    flexShrink: 0,
  },
  countNum: {
    color: '#ffffff',
    fontWeight: 700,
    fontSize: 16,
  },
  countLabel: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 11,
  },
  barOuter: {
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 2,
    transition: 'width 0.3s ease',
  },
  actions: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
  },
  btn: {
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 8,
    color: 'rgba(255,255,255,0.7)',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 600,
    padding: '8px 14px',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontFamily: 'inherit',
  },
  btnPrimary: {
    background: 'rgba(255,255,255,0.12)',
    borderColor: 'rgba(255,255,255,0.2)',
    color: '#ffffff',
  },
  btnCopied: {
    background: 'rgba(74,222,128,0.12)',
    borderColor: 'rgba(74,222,128,0.3)',
    color: '#4ade80',
  },
};
