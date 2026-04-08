import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import DashboardLayout from '../components/DashboardLayout';
import availabilityService from '../services/availabilityService';
import { queryKeys, cacheConfig } from '../config/queryClient';
import { GlowingEffect, AnimatedList, ShimmerSkeleton, InlineError } from '../components/ui';
import { useToast } from '../contexts/ToastContext';
import './AvailabilityDayScreen.css';


const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

const DURATION_OPTIONS = [
  { value: 15, label: '15 min' },
  { value: 30, label: '30 min' },
  { value: 60, label: '60 min' },
];

function formatSlotTime(utcIso) {
  const d = new Date(utcIso);
  return d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: false });
}

export default function AvailabilityDayScreen() {
  const { date: dateParam } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [saving, setSaving] = useState(false);
  const [mutationError, setMutationError] = useState(null);

  const [addStart, setAddStart] = useState('09:00');
  const [addEnd, setAddEnd] = useState('12:00');
  const [addDuration, setAddDuration] = useState(30);

  const dateStr = dateParam;
  const isValidDate = dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr);

  const { data: dayData, isLoading: loading, error: dayError } = useQuery({
    queryKey: queryKeys.availability.day(user?.uid, dateStr),
    queryFn: async () => {
      const avail = await availabilityService.getAvailability(user.uid);
      const daySlots = await availabilityService.getDaySlots(user.uid, dateStr);
      return { timezone: avail.timezone || availabilityService.getCreatorTimezone(), slots: daySlots };
    },
    enabled: !!user?.uid && !!dateStr,
    ...cacheConfig.userProfile,
  });
  const slots = dayData?.slots ?? [];
  const timezone = dayData?.timezone ?? '';
  const error = mutationError ?? dayError?.message ?? null;

  const handleAddSlots = async () => {
    if (!user?.uid || !dateStr) return;
    const [sh, sm] = addStart.split(':').map(Number);
    const [eh, em] = addEnd.split(':').map(Number);
    const startMinutes = sh * 60 + sm;
    const endMinutes = eh * 60 + em;
    if (startMinutes >= endMinutes) {
      setMutationError('La hora de inicio debe ser antes de la hora de fin.');
      return;
    }
    setSaving(true);
    setMutationError(null);
    try {
      await availabilityService.addSlotsForDay(user.uid, dateStr, startMinutes, endMinutes, addDuration, timezone);
      await queryClient.invalidateQueries({ queryKey: queryKeys.availability.day(user?.uid, dateStr) });
      setAddStart(addEnd);
      setAddEnd(addEnd === '12:00' ? '13:00' : String(eh + 1).padStart(2, '0') + ':00');
    } catch (e) {
      showToast('No pudimos crear el horario. Intenta de nuevo.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveSlot = async (index) => {
    if (!user?.uid || !dateStr) return;
    const newSlots = slots.filter((_, i) => i !== index);
    setSaving(true);
    setMutationError(null);
    try {
      await availabilityService.setDaySlots(user.uid, dateStr, newSlots, timezone);
      await queryClient.invalidateQueries({ queryKey: queryKeys.availability.day(user?.uid, dateStr) });
    } catch (e) {
      showToast('No pudimos eliminar el horario. Intenta de nuevo.', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (!isValidDate) {
    return (
      <DashboardLayout screenName="Disponibilidad">
        <div className="avday-container">
          <p className="avday-invalid">Fecha no válida.</p>
          <button type="button" className="avday-back-btn" onClick={() => navigate('/availability')}>
            Volver al calendario
          </button>
        </div>
      </DashboardLayout>
    );
  }

  const [y, m, d] = dateStr.split('-').map(Number);
  const dateLabel = `${d} de ${MONTHS[m - 1]} de ${y}`;

  return (
    <DashboardLayout screenName={`Disponibilidad – ${dateLabel}`} showBackButton backPath="/availability">
      <div className="avday-container">

        {/* Header */}
        <div className="avday-header">
          <div className="avday-header-text">
            <h2 className="avday-title">{dateLabel}</h2>
            <span className="avday-slot-count">
              {slots.length} franja{slots.length !== 1 ? 's' : ''} disponible{slots.length !== 1 ? 's' : ''}
            </span>
          </div>
          <button type="button" className="avday-back-btn" onClick={() => navigate('/availability')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M15 18L9 12L15 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Calendario
          </button>
        </div>

        <InlineError message={error} />

        {/* Slot list card */}
        <div className="avday-card avday-card--slots">
          <GlowingEffect spread={26} borderWidth={1} />
          <p className="avday-card-label">Franjas horarias</p>

          {loading ? (
            <div className="avday-skeleton-list">
              <ShimmerSkeleton height="54px" borderRadius="12px" />
              <ShimmerSkeleton height="54px" borderRadius="12px" />
              <ShimmerSkeleton height="54px" width="70%" borderRadius="12px" />
            </div>
          ) : slots.length === 0 ? (
            <p className="avday-empty">Sin horarios para este dia. Agrega uno o usa la creacion por lotes.</p>
          ) : (
            <ul className="avday-slot-list" role="list">
              <AnimatedList stagger={55} initialDelay={40}>
                {slots.map((slot, index) => (
                  <li key={index} className="avday-slot-item">
                    <GlowingEffect spread={16} borderWidth={1} />
                    <div className="avday-slot-time">
                      <span className="avday-slot-start">{formatSlotTime(slot.startUtc)}</span>
                      <span className="avday-slot-sep">–</span>
                      <span className="avday-slot-end">{formatSlotTime(slot.endUtc)}</span>
                    </div>
                    <button
                      type="button"
                      className="avday-remove-btn"
                      onClick={() => handleRemoveSlot(index)}
                      disabled={saving}
                      aria-label="Quitar franja"
                    >
                      Eliminar
                    </button>
                  </li>
                ))}
              </AnimatedList>
            </ul>
          )}
        </div>

        {/* Add slots card */}
        <div className="avday-card avday-card--add">
          <GlowingEffect spread={26} borderWidth={1} />
          <p className="avday-card-label">Añadir franjas</p>
          <p className="avday-card-desc">
            Crea varios horarios de una vez. Selecciona la duracion, los descansos y listo.
          </p>
          <div className="avday-add-fields">
            <label className="avday-field">
              <span className="avday-field-label">Inicio</span>
              <input
                type="time"
                value={addStart}
                onChange={(e) => setAddStart(e.target.value)}
                className="avday-input"
              />
            </label>
            <label className="avday-field">
              <span className="avday-field-label">Fin</span>
              <input
                type="time"
                value={addEnd}
                onChange={(e) => setAddEnd(e.target.value)}
                className="avday-input"
              />
            </label>
            <label className="avday-field">
              <span className="avday-field-label">Duración</span>
              <select
                value={addDuration}
                onChange={(e) => setAddDuration(Number(e.target.value))}
                className="avday-select"
              >
                {DURATION_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </label>
          </div>
          <button
            type="button"
            className="avday-add-btn"
            onClick={handleAddSlots}
            disabled={saving}
          >
            {saving ? 'Añadiendo…' : 'Añadir franjas'}
          </button>
        </div>
      </div>
    </DashboardLayout>
  );
}
