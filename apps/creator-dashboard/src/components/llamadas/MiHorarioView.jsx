import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../contexts/AuthContext';
import { queryKeys, cacheConfig } from '../../config/queryClient';
import availabilityService from '../../services/availabilityService';
import { GlowingEffect } from '../ui';
import TimePicker from './TimePicker';
import DurationPicker from './DurationPicker';
import DatePickerInline from './DatePickerInline';
import './MiHorarioView.css';

const DAYS = [
  { key: '1', label: 'Lunes' },
  { key: '2', label: 'Martes' },
  { key: '3', label: 'Miércoles' },
  { key: '4', label: 'Jueves' },
  { key: '5', label: 'Viernes' },
  { key: '6', label: 'Sábado' },
  { key: '7', label: 'Domingo' },
];

const MONTHS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];
const WEEKDAYS_SHORT = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

function computeEndTime(startTime, durationMinutes) {
  const [h, m] = startTime.split(':').map(Number);
  const totalMin = h * 60 + m + durationMinutes;
  const endH = Math.floor(totalMin / 60);
  const endM = totalMin % 60;
  return `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
}

function formatBlockedDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  const wd = WEEKDAYS_SHORT[d.getDay()];
  const day = d.getDate();
  const mo = MONTHS[d.getMonth()];
  return `${wd} ${day} ${mo}`;
}

export default function MiHorarioView() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: availability, isLoading } = useQuery({
    queryKey: queryKeys.availability.byCreator(user?.uid),
    queryFn: () => availabilityService.getAvailability(),
    enabled: !!user?.uid,
    ...cacheConfig.userProfile,
  });

  const [draftTemplate, setDraftTemplate] = useState(null);
  const [draftDisabledDates, setDraftDisabledDates] = useState(null);
  const [addingToDay, setAddingToDay] = useState(null);
  const [newSlotTime, setNewSlotTime] = useState('09:00');
  const [newSlotDuration, setNewSlotDuration] = useState(45);
  const [toast, setToast] = useState(null);

  const template = draftTemplate ?? availability?.weeklyTemplate ?? {};
  const disabledDates = draftDisabledDates ?? availability?.disabledDates ?? [];
  const defaultDuration = availability?.defaultSlotDuration ?? 45;

  const isDirty = draftTemplate !== null || draftDisabledDates !== null;

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const ensureDraft = useCallback(() => {
    if (draftTemplate === null) setDraftTemplate({ ...(availability?.weeklyTemplate ?? {}) });
    if (draftDisabledDates === null) setDraftDisabledDates([...(availability?.disabledDates ?? [])]);
  }, [availability, draftTemplate, draftDisabledDates]);

  const saveMutation = useMutation({
    mutationKey: ['availability', 'save-template'],
    mutationFn: () => availabilityService.saveWeeklyTemplate(
      draftTemplate ?? template,
      draftDisabledDates ?? disabledDates,
      defaultDuration
    ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.availability.byCreator(user?.uid) });
      setDraftTemplate(null);
      setDraftDisabledDates(null);
      setToast({ message: 'Horario guardado', type: 'success' });
    },
    onError: (err) => {
      setToast({ message: err?.message || 'Error al guardar', type: 'error' });
    },
  });

  const handleAddSlot = useCallback((dayKey) => {
    ensureDraft();
    const currentSlots = [...(draftTemplate ?? template)[dayKey] || []];
    const duration = newSlotDuration;
    const newSlot = { startTime: newSlotTime, durationMinutes: duration };

    const [nh, nm] = newSlotTime.split(':').map(Number);
    const newStart = nh * 60 + nm;
    const newEnd = newStart + duration;
    for (const existing of currentSlots) {
      const [eh, em] = existing.startTime.split(':').map(Number);
      const existStart = eh * 60 + em;
      const existEnd = existStart + existing.durationMinutes;
      if (newStart < existEnd && newEnd > existStart) {
        setToast({ message: 'Esa franja se superpone con otra', type: 'error' });
        return;
      }
    }

    currentSlots.push(newSlot);
    currentSlots.sort((a, b) => a.startTime.localeCompare(b.startTime));

    setDraftTemplate((prev) => ({
      ...(prev ?? template),
      [dayKey]: currentSlots,
    }));
    setAddingToDay(null);
  }, [draftTemplate, template, newSlotTime, newSlotDuration, ensureDraft]);

  const handleRemoveSlot = useCallback((dayKey, slotIndex) => {
    ensureDraft();
    const currentSlots = [...(draftTemplate ?? template)[dayKey] || []];
    currentSlots.splice(slotIndex, 1);
    setDraftTemplate((prev) => ({
      ...(prev ?? template),
      [dayKey]: currentSlots,
    }));
  }, [draftTemplate, template, ensureDraft]);

  const handleAddDisabledDate = useCallback((dateStr) => {
    if (!dateStr) return;
    ensureDraft();
    const current = [...(draftDisabledDates ?? disabledDates)];
    if (current.includes(dateStr)) {
      setToast({ message: 'Esa fecha ya está bloqueada', type: 'error' });
      return;
    }
    current.push(dateStr);
    current.sort();
    setDraftDisabledDates(current);
  }, [draftDisabledDates, disabledDates, ensureDraft]);

  const handleRemoveDisabledDate = useCallback((dateStr) => {
    ensureDraft();
    setDraftDisabledDates((prev) =>
      (prev ?? disabledDates).filter((d) => d !== dateStr)
    );
  }, [draftDisabledDates, disabledDates, ensureDraft]);

  const totalSlots = useMemo(() => {
    return DAYS.reduce((sum, day) => sum + (template[day.key]?.length || 0), 0);
  }, [template]);

  if (isLoading) {
    return (
      <div className="mi-horario">
        <div className="mi-horario-loading">
          {Array.from({ length: 7 }, (_, i) => (
            <div key={i} className="mi-horario-col-skeleton" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mi-horario">
      {/* Recurring indicator */}
      <div className="mi-horario-recurring">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="mi-horario-recurring-icon">
          <path d="M17 1l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M3 11V9a4 4 0 014-4h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M7 23l-4-4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M21 13v2a4 4 0 01-4 4H3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="mi-horario-recurring-text">
          Horario semanal recurrente — se repite cada semana automáticamente
        </span>
      </div>

      {/* 7-column weekly grid */}
      <div className="mi-horario-grid">
        {DAYS.map((day, colIdx) => {
          const daySlots = template[day.key] || [];
          const isAdding = addingToDay === day.key;

          return (
            <div
              key={day.key}
              className="mi-horario-col"
              style={{ '--col-index': colIdx }}
            >
              <GlowingEffect spread={20} borderWidth={1} />
              <div className="mi-horario-col-header">
                <span className="mi-horario-col-day">{day.label}</span>
                {daySlots.length > 0 && (
                  <span className="mi-horario-col-count">{daySlots.length}</span>
                )}
              </div>

              <div className="mi-horario-slots">
                {daySlots.map((slot, si) => (
                  <div key={si} className="mi-horario-slot" style={{ '--slot-index': si }}>
                    <div className="mi-horario-slot-info">
                      <span className="mi-horario-slot-time">
                        {slot.startTime} – {computeEndTime(slot.startTime, slot.durationMinutes)}
                      </span>
                      <span className="mi-horario-slot-dur">{slot.durationMinutes} min</span>
                    </div>
                    <button
                      type="button"
                      className="mi-horario-slot-remove"
                      onClick={() => handleRemoveSlot(day.key, si)}
                      aria-label="Eliminar franja"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                        <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                      </svg>
                    </button>
                  </div>
                ))}

                {isAdding ? (
                  <div className="mi-horario-add-form">
                    <TimePicker
                      value={newSlotTime}
                      onChange={setNewSlotTime}
                      label="Hora"
                    />
                    <DurationPicker
                      value={newSlotDuration}
                      onChange={setNewSlotDuration}
                    />
                    <div className="mi-horario-add-actions">
                      <button
                        type="button"
                        className="mi-horario-add-confirm"
                        onClick={() => handleAddSlot(day.key)}
                      >
                        Agregar
                      </button>
                      <button
                        type="button"
                        className="mi-horario-add-cancel"
                        onClick={() => setAddingToDay(null)}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                          <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="mi-horario-add-btn"
                    onClick={() => {
                      setAddingToDay(day.key);
                      setNewSlotTime('09:00');
                      setNewSlotDuration(defaultDuration);
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                    Agregar
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Blocked dates */}
      <div className="mi-horario-blocked">
        <GlowingEffect spread={24} borderWidth={1} />
        <div className="mi-horario-blocked-left">
          <div className="mi-horario-blocked-header">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="mi-horario-blocked-icon">
              <rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.5" />
              <path d="M3 10h18M8 2v4M16 2v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <path d="M9 16l6-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <h3 className="mi-horario-blocked-title">Fechas bloqueadas</h3>
          </div>
          <p className="mi-horario-blocked-desc">
            Selecciona días específicos donde no estarás disponible para llamadas.
          </p>
          {disabledDates.length > 0 && (
            <div className="mi-horario-blocked-pills">
              {disabledDates.map((dateStr) => (
                <span key={dateStr} className="mi-horario-blocked-pill">
                  <span className="mi-horario-blocked-pill-text">{formatBlockedDate(dateStr)}</span>
                  <button
                    type="button"
                    className="mi-horario-blocked-pill-x"
                    onClick={() => handleRemoveDisabledDate(dateStr)}
                    aria-label={`Desbloquear ${dateStr}`}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                      <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                    </svg>
                  </button>
                </span>
              ))}
            </div>
          )}
          {disabledDates.length === 0 && (
            <p className="mi-horario-blocked-empty">Ninguna fecha bloqueada</p>
          )}
        </div>
        <div className="mi-horario-blocked-right">
          <DatePickerInline
            onSelect={handleAddDisabledDate}
            disabledDates={disabledDates}
          />
        </div>
      </div>

      {/* Save bar */}
      {isDirty && (
        <div className="mi-horario-save-bar">
          <div className="mi-horario-save-bar-inner">
            <span className="mi-horario-save-summary">
              {totalSlots} franja{totalSlots !== 1 ? 's' : ''} por semana
              {disabledDates.length > 0 ? ` · ${disabledDates.length} bloqueada${disabledDates.length !== 1 ? 's' : ''}` : ''}
            </span>
            <button
              type="button"
              className="mi-horario-save-btn"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending ? 'Guardando…' : 'Guardar cambios'}
            </button>
          </div>
        </div>
      )}

      {toast && (
        <div className={`mi-horario-toast mi-horario-toast--${toast.type}`}>
          {toast.message}
        </div>
      )}
    </div>
  );
}
