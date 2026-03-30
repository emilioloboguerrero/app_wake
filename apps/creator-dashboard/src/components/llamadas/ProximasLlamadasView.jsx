import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../contexts/AuthContext';
import { queryKeys, cacheConfig } from '../../config/queryClient';
import { getBookingsForCreator, cancelBookingAsCreator } from '../../services/callBookingService';
import Modal from '../Modal';
import { GlowingEffect } from '../ui';
import './ProximasLlamadasView.css';

const MONTHS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];
const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

function formatDateHeader(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  const weekday = WEEKDAYS[d.getDay()];
  const day = d.getDate();
  const month = MONTHS[d.getMonth()];
  return `${weekday.charAt(0).toUpperCase() + weekday.slice(1)}, ${day} de ${month}`;
}

function formatTime(isoUtc) {
  const d = new Date(isoUtc);
  return d.toLocaleTimeString('es-CO', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });
}

function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return parts.length >= 2
    ? (parts[0][0] + parts[1][0]).toUpperCase()
    : parts[0].slice(0, 2).toUpperCase();
}

export default function ProximasLlamadasView() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [cancelTarget, setCancelTarget] = useState(null);
  const [showPast, setShowPast] = useState(false);
  const [toast, setToast] = useState(null);

  const { data: allBookings = [], isLoading } = useQuery({
    queryKey: queryKeys.bookings.byCreator(user?.uid),
    queryFn: () => getBookingsForCreator(),
    enabled: !!user?.uid,
    ...cacheConfig.bookings,
  });

  const [now, setNow] = useState(() => new Date().toISOString());
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date().toISOString()), 60_000);
    return () => clearInterval(interval);
  }, []);

  const { upcoming, past } = useMemo(() => {
    const scheduled = allBookings.filter((b) => b.status === 'scheduled');
    const up = scheduled.filter((b) => b.slotStartUtc >= now);
    const pa = scheduled.filter((b) => b.slotStartUtc < now);
    // Also include cancelled ones in past for reference
    const cancelled = allBookings.filter((b) =>
      b.status === 'cancelled' || b.status === 'cancelled_by_creator'
    );
    return {
      upcoming: up.sort((a, b) => a.slotStartUtc.localeCompare(b.slotStartUtc)),
      past: [...pa, ...cancelled].sort((a, b) => b.slotStartUtc.localeCompare(a.slotStartUtc)),
    };
  }, [allBookings, now]);

  const groupedUpcoming = useMemo(() => {
    const groups = [];
    let currentDate = null;
    let currentGroup = null;
    for (const booking of upcoming) {
      const dateStr = booking.slotStartUtc.substring(0, 10);
      if (dateStr !== currentDate) {
        currentDate = dateStr;
        currentGroup = { dateStr, bookings: [] };
        groups.push(currentGroup);
      }
      currentGroup.bookings.push(booking);
    }
    return groups;
  }, [upcoming]);

  const cancelMutation = useMutation({
    mutationFn: (bookingId) => cancelBookingAsCreator(bookingId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.bookings.byCreator(user?.uid) });
      queryClient.invalidateQueries({ queryKey: queryKeys.availability.byCreator(user?.uid) });
      setCancelTarget(null);
      setToast({ message: 'Llamada cancelada', type: 'success' });
      setTimeout(() => setToast(null), 3000);
    },
    onError: (err) => {
      setToast({ message: err?.message || 'Error al cancelar', type: 'error' });
      setTimeout(() => setToast(null), 3000);
    },
  });

  const handleJoin = useCallback((callLink) => {
    if (callLink) window.open(callLink, '_blank', 'noopener');
  }, []);

  if (isLoading) {
    return (
      <div className="proximas-llamadas">
        <div className="proximas-loading">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="proximas-card-skeleton" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="proximas-llamadas">
      {upcoming.length === 0 && past.length === 0 && (
        <div className="proximas-empty">
          <GlowingEffect spread={24} borderWidth={1} />
          <div className="proximas-empty-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
              <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h3 className="proximas-empty-title">No tienes llamadas programadas</h3>
          <p className="proximas-empty-desc">
            Configura tu horario en "Mi horario" y tus clientes podrán agendar llamadas desde su app.
          </p>
        </div>
      )}

      {upcoming.length === 0 && past.length > 0 && (
        <div className="proximas-empty proximas-empty--small">
          <p className="proximas-empty-desc">No hay llamadas próximas.</p>
        </div>
      )}

      {groupedUpcoming.map((group, gi) => (
        <div key={group.dateStr} className="proximas-group" style={{ '--group-index': gi }}>
          <h3 className="proximas-date-header">{formatDateHeader(group.dateStr)}</h3>
          <div className="proximas-cards">
            {group.bookings.map((booking, bi) => (
              <div
                key={booking.bookingId}
                className="proximas-card"
                style={{ '--card-index': bi }}
              >
                <GlowingEffect spread={18} borderWidth={1} />
                <div className="proximas-card-avatar">
                  {getInitials(booking.clientDisplayName)}
                </div>
                <div className="proximas-card-info">
                  <span className="proximas-card-name">
                    {booking.clientDisplayName || 'Cliente'}
                  </span>
                  <span className="proximas-card-time">
                    {formatTime(booking.slotStartUtc)} – {formatTime(booking.slotEndUtc)}
                  </span>
                </div>
                <span className="proximas-card-duration">
                  {booking.durationMinutes || Math.round(
                    (new Date(booking.slotEndUtc).getTime() - new Date(booking.slotStartUtc).getTime()) / 60000
                  )} min
                </span>
                <div className="proximas-card-actions">
                  {booking.callLink && (
                    <button
                      type="button"
                      className="proximas-btn proximas-btn--join"
                      onClick={() => handleJoin(booking.callLink)}
                    >
                      Unirse
                    </button>
                  )}
                  <button
                    type="button"
                    className="proximas-btn proximas-btn--cancel"
                    onClick={() => setCancelTarget(booking)}
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Past calls */}
      {past.length > 0 && (
        <div className="proximas-past-section">
          <button
            type="button"
            className="proximas-past-toggle"
            onClick={() => setShowPast((v) => !v)}
          >
            <span>Pasadas ({past.length})</span>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              className={`proximas-past-chevron ${showPast ? 'proximas-past-chevron--open' : ''}`}
            >
              <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          {showPast && (
            <div className="proximas-past-list">
              {past.map((booking, i) => (
                <div key={booking.bookingId || booking.id || i} className="proximas-card proximas-card--past">
                  <GlowingEffect spread={14} borderWidth={1} />
                  <div className="proximas-card-avatar proximas-card-avatar--past">
                    {getInitials(booking.clientDisplayName)}
                  </div>
                  <div className="proximas-card-info">
                    <span className="proximas-card-name">
                      {booking.clientDisplayName || 'Cliente'}
                    </span>
                    <span className="proximas-card-time">
                      {booking.slotStartUtc.substring(0, 10)} · {formatTime(booking.slotStartUtc)}
                    </span>
                  </div>
                  {(booking.status === 'cancelled' || booking.status === 'cancelled_by_creator') && (
                    <span className="proximas-card-badge proximas-card-badge--cancelled">
                      Cancelada
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Cancel confirmation modal */}
      <Modal
        isOpen={!!cancelTarget}
        onClose={() => setCancelTarget(null)}
        title="Cancelar llamada"
      >
        {cancelTarget && (
          <div className="proximas-cancel-modal">
            <p className="proximas-cancel-text">
              ¿Cancelar la llamada con <strong>{cancelTarget.clientDisplayName || 'este cliente'}</strong> el{' '}
              {formatDateHeader(cancelTarget.slotStartUtc.substring(0, 10))} a las{' '}
              {formatTime(cancelTarget.slotStartUtc)}?
            </p>
            <p className="proximas-cancel-note">
              Se le notificará al cliente por correo electrónico.
            </p>
            <div className="proximas-cancel-actions">
              <button
                type="button"
                className="proximas-btn proximas-btn--secondary"
                onClick={() => setCancelTarget(null)}
              >
                No, mantener
              </button>
              <button
                type="button"
                className="proximas-btn proximas-btn--danger"
                onClick={() => cancelMutation.mutate(cancelTarget.bookingId)}
                disabled={cancelMutation.isPending}
              >
                {cancelMutation.isPending ? 'Cancelando…' : 'Sí, cancelar'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {toast && (
        <div className={`proximas-toast proximas-toast--${toast.type}`}>
          {toast.message}
        </div>
      )}
    </div>
  );
}
