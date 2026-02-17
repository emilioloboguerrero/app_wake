import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import DashboardLayout from '../components/DashboardLayout';
import availabilityService from '../services/availabilityService';
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
  const [slots, setSlots] = useState([]);
  const [timezone, setTimezone] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const [addStart, setAddStart] = useState('09:00');
  const [addEnd, setAddEnd] = useState('12:00');
  const [addDuration, setAddDuration] = useState(30);

  const dateStr = dateParam;
  const isValidDate = dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr);

  const loadDay = useCallback(async () => {
    if (!user?.uid || !dateStr) return;
    setLoading(true);
    setError(null);
    try {
      const avail = await availabilityService.getAvailability(user.uid);
      setTimezone(avail.timezone || availabilityService.getCreatorTimezone());
      const daySlots = await availabilityService.getDaySlots(user.uid, dateStr);
      setSlots(daySlots);
    } catch (e) {
      setError(e?.message || 'Error al cargar');
    } finally {
      setLoading(false);
    }
  }, [user?.uid, dateStr]);

  useEffect(() => {
    loadDay();
  }, [loadDay]);

  const handleAddSlots = async () => {
    if (!user?.uid || !dateStr) return;
    const [sh, sm] = addStart.split(':').map(Number);
    const [eh, em] = addEnd.split(':').map(Number);
    const startMinutes = sh * 60 + sm;
    const endMinutes = eh * 60 + em;
    if (startMinutes >= endMinutes) {
      setError('La hora de inicio debe ser anterior a la de fin.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await availabilityService.addSlotsForDay(user.uid, dateStr, startMinutes, endMinutes, addDuration, timezone);
      await loadDay();
      setAddStart(addEnd);
      setAddEnd(addEnd === '12:00' ? '13:00' : String(eh + 1).padStart(2, '0') + ':00');
    } catch (e) {
      setError(e?.message || 'Error al añadir');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveSlot = async (index) => {
    if (!user?.uid || !dateStr) return;
    const newSlots = slots.filter((_, i) => i !== index);
    setSaving(true);
    setError(null);
    try {
      await availabilityService.setDaySlots(user.uid, dateStr, newSlots, timezone);
      setSlots(newSlots);
    } catch (e) {
      setError(e?.message || 'Error al eliminar');
    } finally {
      setSaving(false);
    }
  };

  if (!isValidDate) {
    return (
      <DashboardLayout screenName="Disponibilidad">
        <div className="availability-day-container">
          <p>Fecha no válida.</p>
          <button type="button" className="availability-day-back" onClick={() => navigate('/availability')}>
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
      <div className="availability-day-container">
        <div className="availability-day-header">
          <h2 className="availability-day-title">{dateLabel}</h2>
          <button type="button" className="availability-day-back" onClick={() => navigate('/availability')}>
            ← Calendario
          </button>
        </div>

        {error && <div className="availability-day-error">{error}</div>}

        <div className="availability-day-card propagate-modal-card">
          <div className="propagate-modal-users-header">
            <span className="propagate-modal-users-label">Franjas horarias disponibles</span>
            <span className="propagate-modal-users-count">{slots.length}</span>
          </div>
          {loading ? (
            <p className="availability-day-loading">Cargando...</p>
          ) : (
            <>
              <ul className="propagate-modal-users-list availability-day-list">
                {slots.length === 0 ? (
                  <li className="availability-day-empty">Aún no hay franjas. Añade horarios abajo.</li>
                ) : (
                  slots.map((slot, index) => (
                    <li key={index} className="availability-day-slot-item">
                      <span>{formatSlotTime(slot.startUtc)} – {formatSlotTime(slot.endUtc)}</span>
                      <button
                        type="button"
                        className="availability-day-remove-slot"
                        onClick={() => handleRemoveSlot(index)}
                        disabled={saving}
                        aria-label="Quitar franja"
                      >
                        Eliminar
                      </button>
                    </li>
                  ))
                )}
              </ul>

              <div className="availability-day-add">
                <h3 className="propagate-option-title">Añadir franjas</h3>
                <p className="propagate-option-desc">
                  Elige hora de inicio y fin, y la duración de cada franja. Se crearán todas las franjas posibles en ese rango.
                </p>
                <div className="availability-day-add-fields">
                  <label>
                    <span>Inicio</span>
                    <input
                      type="time"
                      value={addStart}
                      onChange={(e) => setAddStart(e.target.value)}
                      className="availability-day-input"
                    />
                  </label>
                  <label>
                    <span>Fin</span>
                    <input
                      type="time"
                      value={addEnd}
                      onChange={(e) => setAddEnd(e.target.value)}
                      className="availability-day-input"
                    />
                  </label>
                  <label>
                    <span>Duración</span>
                    <select
                      value={addDuration}
                      onChange={(e) => setAddDuration(Number(e.target.value))}
                      className="availability-day-select"
                    >
                      {DURATION_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <button
                  type="button"
                  className="propagate-modal-btn propagate-modal-btn-propagate"
                  onClick={handleAddSlots}
                  disabled={saving}
                >
                  {saving ? 'Añadiendo…' : 'Añadir franjas'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
