import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import DashboardLayout from '../components/DashboardLayout';
import Modal from '../components/Modal';
import availabilityService from '../services/availabilityService';
import { getBookingsForCreator, updateBookingCallLink } from '../services/callBookingService';
import { getUser } from '../services/firestoreService';
import '../components/CalendarView.css';
import './AvailabilityCalendarScreen.css';
import '../components/PropagateChangesModal.css';

const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];
const DAYS_OF_WEEK = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

const DURATION_OPTIONS = [
  { value: 15, label: '15 min' },
  { value: 30, label: '30 min' },
  { value: 45, label: '45 min' },
  { value: 60, label: '60 min' },
];

const BREAK_OPTIONS = [
  { value: 0, label: 'Sin pausa' },
  { value: 15, label: '15 min' },
  { value: 30, label: '30 min' },
  { value: 45, label: '45 min' },
];

function formatSlotTime(utcIso) {
  const d = new Date(utcIso);
  return d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: false });
}

/** Slot position in day timeline: start and end as fraction of day (0–1) */
function slotToPosition(slot) {
  const start = new Date(slot.startUtc);
  const end = new Date(slot.endUtc);
  const startMinutes = start.getHours() * 60 + start.getMinutes() + start.getSeconds() / 60;
  const endMinutes = end.getHours() * 60 + end.getMinutes() + end.getSeconds() / 60;
  return {
    top: (startMinutes / (24 * 60)) * 100,
    height: ((endMinutes - startMinutes) / (24 * 60)) * 100,
  };
}

function slotsOverlap(a, b) {
  const aStart = new Date(a.startUtc).getTime();
  const aEnd = new Date(a.endUtc).getTime();
  const bStart = new Date(b.startUtc).getTime();
  const bEnd = new Date(b.endUtc).getTime();
  return aStart < bEnd && bStart < aEnd;
}

/** Compute batch slots for a day: startTime "HH:mm", numSlots, slotDuration, breakDuration (minutes). Returns array of { startUtc, endUtc, durationMinutes } */
function computeBatchSlots(dateStr, startTime, numSlots, slotDuration, breakDuration) {
  const [sh, sm] = startTime.split(':').map(Number);
  let startMinutes = sh * 60 + sm;
  const [y, m, d] = dateStr.split('-').map(Number);
  const result = [];
  for (let i = 0; i < numSlots; i++) {
    const hour = Math.floor(startMinutes / 60);
    const min = startMinutes % 60;
    const startDate = new Date(y, m - 1, d, hour, min);
    const endDate = new Date(startDate.getTime() + slotDuration * 60 * 1000);
    result.push({
      startUtc: startDate.toISOString(),
      endUtc: endDate.toISOString(),
      durationMinutes: slotDuration,
    });
    startMinutes += slotDuration + breakDuration;
  }
  return result;
}

const DRAG_TYPE_SLOT = 'application/x-availability-slot-duration';

/**
 * Normalize date value to ms - handles Firestore Timestamp and ISO string variants.
 */
function toMs(value) {
  if (value == null) return NaN;
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? NaN : d.getTime();
}

/** Check if a booking overlaps a slot (more robust than exact start match) */
function bookingOverlapsSlot(booking, slot) {
  const bStart = toMs(booking.slotStartUtc);
  const bEnd = toMs(booking.slotEndUtc);
  const sStart = toMs(slot.startUtc);
  const sEnd = toMs(slot.endUtc);
  if (Number.isNaN(bStart) || Number.isNaN(bEnd) || Number.isNaN(sStart) || Number.isNaN(sEnd)) return false;
  return bStart < sEnd && bEnd > sStart;
}

export default function AvailabilityCalendarScreen() {
  const { user } = useAuth();
  const today = useMemo(() => new Date(), []);
  const [currentDate, setCurrentDate] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [availability, setAvailability] = useState({ timezone: '', days: {} });
  const [selectedDateStr, setSelectedDateStr] = useState(null);
  const [slots, setSlots] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [timelineDragOver, setTimelineDragOver] = useState(false);
  const [bookings, setBookings] = useState([]);
  const [bookingsError, setBookingsError] = useState(null);
  const [slotDetailModal, setSlotDetailModal] = useState(null); // { slot, booking? }
  const [clientUserData, setClientUserData] = useState(null);
  const [clientUserDataError, setClientUserDataError] = useState(null);
  const [callLinkInput, setCallLinkInput] = useState('');
  const [savingCallLink, setSavingCallLink] = useState(false);
  const timelineWrapRef = useRef(null);

  const [batchStart, setBatchStart] = useState('12:00');
  const [batchNumSlots, setBatchNumSlots] = useState(3);
  const [batchSlotDuration, setBatchSlotDuration] = useState(45);
  const [batchBreak, setBatchBreak] = useState(30);

  /** Minutes for the single draggable slot (15–120, step 15). */
  const [dragSlotMinutes, setDragSlotMinutes] = useState(30);

  const loadAvailability = useCallback(async () => {
    if (!user?.uid) return;
    try {
      const avail = await availabilityService.getAvailability(user.uid);
      setAvailability(avail);
      return avail;
    } catch (e) {
      console.error(e);
    }
  }, [user?.uid]);

  useEffect(() => {
    loadAvailability();
  }, [loadAvailability]);

  const loadBookings = useCallback(async () => {
    if (!user?.uid) return;
    setBookingsError(null);
    try {
      const list = await getBookingsForCreator(user.uid, { status: 'scheduled' });
      setBookings(list);
    } catch (e) {
      console.error('Error loading bookings:', e);
      setBookingsError(e?.message || 'Error al cargar reservas');
      setBookings([]);
    }
  }, [user?.uid]);

  useEffect(() => {
    loadBookings();
  }, [loadBookings]);

  // Refetch bookings when selecting a day so reserved slots reflect latest state
  useEffect(() => {
    if (selectedDateStr && user?.uid) loadBookings();
  }, [selectedDateStr, user?.uid, loadBookings]);

  const loadSlotsForDay = useCallback(async (dateStr) => {
    if (!user?.uid || !dateStr) return;
    setLoading(true);
    setError(null);
    try {
      const daySlots = await availabilityService.getDaySlots(user.uid, dateStr);
      setSlots(daySlots);
    } catch (e) {
      setError(e?.message || 'Error al cargar');
    } finally {
      setLoading(false);
    }
  }, [user?.uid]);

  useEffect(() => {
    if (selectedDateStr) loadSlotsForDay(selectedDateStr);
    else setSlots([]);
  }, [selectedDateStr, loadSlotsForDay]);

  const handleDayClick = (cell) => {
    setSelectedDateStr(cell.dateStr);
  };

  const batchPreview = useMemo(() => {
    if (!selectedDateStr) return [];
    return computeBatchSlots(selectedDateStr, batchStart, batchNumSlots, batchSlotDuration, batchBreak);
  }, [selectedDateStr, batchStart, batchNumSlots, batchSlotDuration, batchBreak]);

  const batchPreviewLabel = useMemo(() => {
    if (batchPreview.length === 0) return '';
    return batchPreview
      .map((s) => `${formatSlotTime(s.startUtc)}–${formatSlotTime(s.endUtc)}`)
      .join(', ');
  }, [batchPreview]);

  const handleBatchAdd = async () => {
    if (!user?.uid || !selectedDateStr || batchNumSlots < 1) return;
    const newSlots = computeBatchSlots(selectedDateStr, batchStart, batchNumSlots, batchSlotDuration, batchBreak);
    for (const ns of newSlots) {
      for (const existing of slots) {
        if (slotsOverlap(ns, existing)) {
          setError('Una o más franjas coinciden con horarios ya existentes. Ajusta la hora de inicio o el número de franjas.');
          return;
        }
      }
    }
    setSaving(true);
    setError(null);
    try {
      const tz = availability.timezone || availabilityService.getCreatorTimezone();
      const merged = [...slots, ...newSlots].sort(
        (a, b) => new Date(a.startUtc).getTime() - new Date(b.startUtc).getTime()
      );
      await availabilityService.setDaySlots(user.uid, selectedDateStr, merged, tz);
      setSlots(merged);
      await loadAvailability();
    } catch (e) {
      setError(e?.message || 'Error al añadir');
    } finally {
      setSaving(false);
    }
  };

  const handleDragStart = (e, durationMinutes) => {
    e.dataTransfer.setData(DRAG_TYPE_SLOT, String(durationMinutes));
    e.dataTransfer.effectAllowed = 'copy';
  };

  const handleTimelineDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setTimelineDragOver(true);
  };

  const handleTimelineDragLeave = () => {
    setTimelineDragOver(false);
  };

  /** Add a slot at the given position (minutes from midnight, snapped to 15). Used by both drop and click. */
  const addSlotAtPosition = useCallback(
    async (minutesFromMidnight, durationMinutes) => {
      if (!selectedDateStr || !user?.uid) return;
      const SNAP_MINUTES = 15;
      const snapped = Math.round(minutesFromMidnight / SNAP_MINUTES) * SNAP_MINUTES;
      const startMinutes = Math.max(0, Math.min(24 * 60 - durationMinutes, snapped));
      const [y_, m_, d_] = selectedDateStr.split('-').map(Number);
      const startDate = new Date(y_, m_ - 1, d_, Math.floor(startMinutes / 60), startMinutes % 60);
      const endDate = new Date(startDate.getTime() + durationMinutes * 60 * 1000);
      const newSlot = {
        startUtc: startDate.toISOString(),
        endUtc: endDate.toISOString(),
        durationMinutes,
      };
      for (const existing of slots) {
        if (slotsOverlap(newSlot, existing)) {
          setError('Esta franja coincide con un horario ya existente.');
          return;
        }
      }
      setSaving(true);
      setError(null);
      try {
        const tz = availability.timezone || availabilityService.getCreatorTimezone();
        const merged = [...slots, newSlot].sort(
          (a, b) => new Date(a.startUtc).getTime() - new Date(b.startUtc).getTime()
        );
        await availabilityService.setDaySlots(user.uid, selectedDateStr, merged, tz);
        setSlots(merged);
        await loadAvailability();
      } catch (err) {
        setError(err?.message || 'Error al añadir');
      } finally {
        setSaving(false);
      }
    },
    [selectedDateStr, user?.uid, slots, availability.timezone, loadAvailability]
  );

  const handleTimelineDrop = useCallback(
    async (e) => {
      setTimelineDragOver(false);
      e.preventDefault();
      const durationStr = e.dataTransfer.getData(DRAG_TYPE_SLOT);
      if (!durationStr || !selectedDateStr) return;
      const durationMinutes = parseInt(durationStr, 10);
      if (Number.isNaN(durationMinutes)) return;

      const wrap = timelineWrapRef.current;
      if (!wrap) return;
      const rect = wrap.getBoundingClientRect();
      const scrollTop = wrap.scrollTop || 0;
      const y = scrollTop + (e.clientY - rect.top);
      const totalHeight = 24 * 48;
      let fraction = y / totalHeight;
      fraction = Math.max(0, Math.min(1, fraction));
      const minutesFromMidnight = fraction * 24 * 60;
      await addSlotAtPosition(minutesFromMidnight, durationMinutes);
    },
    [selectedDateStr, addSlotAtPosition]
  );

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const calendarDays = useMemo(() => {
    const first = new Date(year, month, 1);
    const startDow = (first.getDay() + 6) % 7;
    const startDate = new Date(first);
    startDate.setDate(first.getDate() - startDow);
    const days = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(startDate);
      d.setDate(startDate.getDate() + i);
      const inMonth = d.getMonth() === month;
      const dateStr = d.toISOString().slice(0, 10);
      const hasSlots = availability.days[dateStr]?.slots?.length > 0;
      days.push({ date: d, day: d.getDate(), inMonth, dateStr, hasSlots });
    }
    return days;
  }, [year, month, availability.days]);

  const isToday = (cell) =>
    cell.date.getDate() === today.getDate() &&
    cell.date.getMonth() === today.getMonth() &&
    cell.date.getFullYear() === today.getFullYear();

  const weeksInMonth = [];
  for (let i = 0; i < calendarDays.length; i += 7) {
    weeksInMonth.push(calendarDays.slice(i, i + 7));
  }

  const selectedDateLabel = selectedDateStr
    ? (() => {
        const [y, m, d] = selectedDateStr.split('-').map(Number);
        return `${d} de ${MONTHS[m - 1]} de ${y}`;
      })()
    : null;

  const HOUR_HEIGHT = 48;
  const dayTimelineHeight = 24 * HOUR_HEIGHT;

  /** For each slot, whether any scheduled booking overlaps it */
  const isSlotReserved = useCallback(
    (slot) => bookings.some((b) => bookingOverlapsSlot(b, slot)),
    [bookings]
  );

  /** Reserved slot has call link filled: gold. Reserved without call link: red. */
  const getSlotReservedClass = useCallback(
    (slot) => {
      const booking = bookings.find((b) => bookingOverlapsSlot(b, slot));
      if (!booking) return null;
      const hasCallLink = !!(booking.callLink && String(booking.callLink).trim());
      return hasCallLink ? 'availability-timeline-slot-reserved' : 'availability-timeline-slot-reserved-no-call';
    },
    [bookings]
  );

  const getBookingForSlot = useCallback(
    (slot) => bookings.find((b) => bookingOverlapsSlot(b, slot)) || null,
    [bookings]
  );

  const handleSlotClick = useCallback((slot, e) => {
    e.stopPropagation();
    const booking = getBookingForSlot(slot);
    setSlotDetailModal({ slot, booking });
    setClientUserData(null);
    setClientUserDataError(null);
    setCallLinkInput(booking?.callLink ?? '');
  }, [getBookingForSlot]);

  // Fetch client user data when modal opens with a booking
  useEffect(() => {
    if (!slotDetailModal?.booking?.clientUserId) {
      setClientUserData(null);
      setClientUserDataError(null);
      return;
    }
    let cancelled = false;
    setClientUserDataError(null);
    getUser(slotDetailModal.booking.clientUserId)
      .then((userDoc) => {
        if (cancelled) return;
        if (!userDoc) {
          setClientUserData(null);
          return;
        }
        let age = userDoc.age;
        if ((age == null || age === '') && userDoc.birthDate) {
          const bd = userDoc.birthDate?.toDate ? userDoc.birthDate.toDate() : new Date(userDoc.birthDate);
          if (!Number.isNaN(bd.getTime())) {
            age = new Date().getFullYear() - bd.getFullYear();
            const m = new Date().getMonth() - bd.getMonth();
            if (m < 0 || (m === 0 && new Date().getDate() < bd.getDate())) age--;
          }
        }
        setClientUserData({
          displayName: userDoc.displayName || userDoc.name || '',
          email: userDoc.email || '',
          age: age ?? null,
          gender: userDoc.gender || '',
          country: userDoc.country || '',
          city: userDoc.city || userDoc.location || '',
          phoneNumber: userDoc.phoneNumber || '',
          height: userDoc.height ?? null,
          bodyweight: userDoc.bodyweight ?? userDoc.weight ?? null,
          onboardingData: userDoc.onboardingData || null,
        });
      })
      .catch((err) => {
        if (!cancelled) setClientUserDataError(err?.message || 'No se pudo cargar la información del cliente');
      });
    return () => { cancelled = true; };
  }, [slotDetailModal?.booking?.clientUserId]);

  const handleSaveCallLink = useCallback(async () => {
    if (!slotDetailModal?.booking?.id) return;
    setSavingCallLink(true);
    try {
      await updateBookingCallLink(slotDetailModal.booking.id, callLinkInput);
      setBookings((prev) =>
        prev.map((b) =>
          b.id === slotDetailModal.booking.id ? { ...b, callLink: callLinkInput.trim() || null } : b
        )
      );
      setSlotDetailModal((prev) =>
        prev?.booking ? { ...prev, booking: { ...prev.booking, callLink: callLinkInput.trim() || null } } : prev
      );
    } catch (err) {
      setError(err?.message || 'No se pudo guardar el enlace');
    } finally {
      setSavingCallLink(false);
    }
  }, [slotDetailModal?.booking?.id, callLinkInput]);

  const hasCallLinkChange = slotDetailModal?.booking && (
    (callLinkInput.trim() || '') !== (slotDetailModal.booking.callLink?.trim() || '')
  );

  return (
    <DashboardLayout screenName="Disponibilidad para llamadas">
      <div className="availability-container">
        <div className="availability-body">
          {/* Left: Controls */}
          <div className="availability-sidebar-left">
            <div className="availability-sidebar-header">
              <h3 className="availability-sidebar-title">Gestionar disponibilidad</h3>
            </div>
            {!selectedDateStr ? (
              <div className="availability-sidebar-content">
                <p className="availability-empty-hint propagate-option-desc">
                  Selecciona un día en el calendario para añadir franjas horarias y gestionar las reservas.
                </p>
              </div>
            ) : (
              <div className="availability-sidebar-content">
                {error && <div className="availability-day-error">{error}</div>}

                <div className="availability-add-block availability-add-block-single">
                  <span className="availability-add-block-title">Añadir una franja</span>
                  <div
                    className="availability-slot-drag-card"
                    draggable
                    onDragStart={(e) => handleDragStart(e, dragSlotMinutes)}
                  >
                    <div className="availability-slot-drag-card-content">
                      <div className="availability-slot-drag-card-row">
                        <div className="availability-draggable-single">
                          <input
                            type="number"
                            min={15}
                            max={120}
                            step={15}
                            value={dragSlotMinutes}
                            onChange={(e) => {
                              const v = parseInt(e.target.value, 10);
                              if (!Number.isNaN(v)) setDragSlotMinutes(Math.max(15, Math.min(120, v)));
                            }}
                            className="availability-draggable-slot-input"
                            aria-label="Minutos por franja"
                            onClick={(e) => e.stopPropagation()}
                            onDragStart={(e) => e.stopPropagation()}
                          />
                          <div className="availability-slot-chevrons">
                            <button
                              type="button"
                              className="availability-slot-chevron availability-slot-chevron-up"
                              aria-label="Aumentar duración"
                              disabled={dragSlotMinutes >= 120}
                              onClick={(e) => {
                                e.stopPropagation();
                                setDragSlotMinutes((m) => Math.min(120, m + 15));
                              }}
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
                                <path d="M19 9L12 16L5 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" transform="rotate(180 12 12)" />
                              </svg>
                            </button>
                            <button
                              type="button"
                              className="availability-slot-chevron availability-slot-chevron-down"
                              aria-label="Reducir duración"
                              disabled={dragSlotMinutes <= 15}
                              onClick={(e) => {
                                e.stopPropagation();
                                setDragSlotMinutes((m) => Math.max(15, m - 15));
                              }}
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
                                <path d="M19 9L12 16L5 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            </button>
                          </div>
                          <span className="availability-draggable-slot-unit">min</span>
                        </div>
                      </div>
                      <div className="availability-slot-drag-hint" aria-hidden>
                        <span className="availability-slot-drag-label">Arrastra al calendario</span>
                      </div>
                    </div>
                    <span className="availability-slot-drag-grip" aria-hidden>
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
                        <circle cx="9" cy="8" r="1.5" fill="currentColor" />
                        <circle cx="15" cy="8" r="1.5" fill="currentColor" />
                        <circle cx="9" cy="12" r="1.5" fill="currentColor" />
                        <circle cx="15" cy="12" r="1.5" fill="currentColor" />
                        <circle cx="9" cy="16" r="1.5" fill="currentColor" />
                        <circle cx="15" cy="16" r="1.5" fill="currentColor" />
                      </svg>
                    </span>
                  </div>
                </div>

                <div className="availability-add-block availability-add-block-batch">
                  <span className="availability-add-block-title">Varias franjas (con pausas)</span>
                  <div className="availability-add-fields">
                    <label className="availability-field">
                      <span className="availability-field-label">Hora de inicio</span>
                      <div className="availability-time-wrap">
                        <input
                          type="time"
                          value={batchStart}
                          onChange={(e) => setBatchStart(e.target.value)}
                          className="availability-input availability-time-input"
                          aria-label="Hora de inicio"
                        />
                      </div>
                    </label>
                    <label className="availability-field">
                      <span className="availability-field-label">Nº de franjas</span>
                      <div className="availability-num-slots-row">
                        <div className="availability-num-slots-card">
                          <input
                            type="number"
                            min={1}
                            max={20}
                            value={batchNumSlots}
                            onChange={(e) => setBatchNumSlots(Math.max(1, Math.min(20, parseInt(e.target.value, 10) || 1)))}
                            className="availability-num-slots-input"
                            aria-label="Número de franjas"
                          />
                        </div>
                        <div className="availability-num-slots-chevrons">
                          <button
                            type="button"
                            className="availability-num-slots-chevron"
                            aria-label="Aumentar número de franjas"
                            disabled={batchNumSlots >= 20}
                            onClick={(e) => {
                              e.preventDefault();
                              setBatchNumSlots((n) => Math.min(20, n + 1));
                            }}
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
                              <path d="M19 9L12 16L5 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" transform="rotate(180 12 12)" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            className="availability-num-slots-chevron availability-num-slots-chevron-down"
                            aria-label="Reducir número de franjas"
                            disabled={batchNumSlots <= 1}
                            onClick={(e) => {
                              e.preventDefault();
                              setBatchNumSlots((n) => Math.max(1, n - 1));
                            }}
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
                              <path d="M19 9L12 16L5 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    </label>
                    <label className="availability-field">
                      <span className="availability-field-label">Duración</span>
                      <select
                        value={batchSlotDuration}
                        onChange={(e) => setBatchSlotDuration(Number(e.target.value))}
                        className="availability-select availability-select-with-chevron"
                      >
                        {DURATION_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    </label>
                    <label className="availability-field">
                      <span className="availability-field-label">Pausa</span>
                      <select
                        value={batchBreak}
                        onChange={(e) => setBatchBreak(Number(e.target.value))}
                        className="availability-select availability-select-with-chevron"
                      >
                        {BREAK_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  {batchPreviewLabel && (
                    <p className="availability-preview">
                      <strong>Vista previa:</strong> {batchPreviewLabel}
                    </p>
                  )}
                  <div className="availability-add-block-btn-wrap">
                    <button
                      type="button"
                      className="availability-add-block-btn"
                      onClick={handleBatchAdd}
                      disabled={saving}
                    >
                      {saving ? 'Añadiendo…' : 'Añadir franjas'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Middle: Day timeline */}
          <div className="availability-day-panel">
            <div className="availability-day-panel-header">
              <h3 className="availability-day-panel-title">
                {selectedDateStr ? `Horario – ${selectedDateLabel}` : 'Horario del día'}
              </h3>
              {bookingsError && (
                <p className="availability-bookings-error" title={bookingsError}>
                  No se pudieron cargar las reservas. Las franjas reservadas podrían no mostrarse.
                </p>
              )}
              {selectedDateStr && !bookingsError && bookings.length > 0 && (
                <p className="availability-bookings-hint">
                  {bookings.length} reserva{bookings.length !== 1 ? 's' : ''} cargada{bookings.length !== 1 ? 's' : ''}. Doradas: con enlace. Rojas: falta enlace.
                </p>
              )}
            </div>
            <div className="availability-day-panel-content">
              {!selectedDateStr ? (
                <p className="availability-empty-hint">Selecciona un día en el calendario para ver las franjas.</p>
              ) : (
                <div
                  ref={timelineWrapRef}
                  className={`availability-timeline-wrap ${timelineDragOver ? 'availability-timeline-drag-over' : ''}`}
                  onDragOver={handleTimelineDragOver}
                  onDragLeave={handleTimelineDragLeave}
                  onDrop={handleTimelineDrop}
                >
                  <div
                    className="availability-timeline"
                    style={{ height: dayTimelineHeight }}
                  >
                    {Array.from({ length: 24 }, (_, i) => (
                      <div
                        key={i}
                        className="availability-timeline-hour"
                        style={{ height: HOUR_HEIGHT }}
                      >
                        <span className="availability-timeline-hour-label">
                          {String(i).padStart(2, '0')}:00
                        </span>
                      </div>
                    ))}
                    <div className="availability-timeline-slots">
                      {slots.map((slot, index) => {
                        const { top, height } = slotToPosition(slot);
                        const isReserved = isSlotReserved(slot);
                        const reservedClass = isReserved ? getSlotReservedClass(slot) : null;
                        return (
                          <div
                            key={index}
                            role="button"
                            tabIndex={0}
                            className={`availability-timeline-slot-block availability-timeline-slot-clickable ${reservedClass || 'availability-timeline-slot-available'}`}
                            style={{
                              top: `${top}%`,
                              height: `${height}%`,
                            }}
                            title={`${formatSlotTime(slot.startUtc)} – ${formatSlotTime(slot.endUtc)}${isReserved ? ' (Reservado)' : ''} – Clic para ver detalles`}
                            onClick={(e) => handleSlotClick(slot, e)}
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSlotClick(slot, e); } }}
                          >
                            <span className="availability-timeline-slot-label">
                              {formatSlotTime(slot.startUtc)} – {formatSlotTime(slot.endUtc)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right: Calendar */}
          <div className="availability-calendar-panel">
            <div className="availability-calendar-panel-header">
              <h3 className="availability-calendar-panel-title">Calendario</h3>
            </div>
            <div className="availability-calendar-panel-content">
              <div className="calendar-view availability-calendar-view">
                <div className="calendar-header-controls">
                  <div className="calendar-month-year-selector">
                    <select
                      className="calendar-month-year-select"
                      value={`${year}-${String(month + 1).padStart(2, '0')}`}
                      onChange={(e) => {
                        const [y, m] = e.target.value.split('-').map(Number);
                        setCurrentDate(new Date(y, m - 1, 1));
                      }}
                    >
                      {MONTHS.map((name, i) => (
                        <option key={i} value={`${year}-${String(i + 1).padStart(2, '0')}`}>
                          {name} {year}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="calendar-nav-buttons">
                    <button type="button" className="calendar-nav-button" onClick={() => setCurrentDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))} aria-label="Mes anterior">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                        <path d="M15 18L9 12L15 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                    <button type="button" className="calendar-nav-button" onClick={() => setCurrentDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))} aria-label="Mes siguiente">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                        <path d="M9 18L15 12L9 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                  </div>
                </div>
                <div className="calendar-grid-container">
                  <div className="calendar-weekdays">
                    {DAYS_OF_WEEK.map((day, index) => (
                      <div key={index} className="calendar-weekday">{day}</div>
                    ))}
                  </div>
                  <div className="calendar-days availability-calendar-days">
                    {weeksInMonth.map((row, rowIndex) => (
                      <React.Fragment key={rowIndex}>
                        {row.map((cell, colIndex) => {
                          const todayClass = isToday(cell) ? 'calendar-day-today' : '';
                          const otherMonth = !cell.inMonth ? 'calendar-day-other-month' : '';
                          const hasSlots = cell.hasSlots ? 'availability-day-has-slots' : '';
                          const selected = selectedDateStr === cell.dateStr ? 'availability-day-selected' : '';
                          return (
                            <button
                              key={`${rowIndex}-${colIndex}`}
                              type="button"
                              className={`calendar-day availability-calendar-day ${todayClass} ${otherMonth} ${hasSlots} ${selected}`}
                              onClick={() => handleDayClick(cell)}
                              data-date={cell.dateStr}
                            >
                              <span className="calendar-day-number">{cell.day}</span>
                              {cell.hasSlots && <span className="availability-day-dots" aria-hidden>••</span>}
                            </button>
                          );
                        })}
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Slot detail modal */}
      <Modal
        isOpen={!!slotDetailModal}
        onClose={() => setSlotDetailModal(null)}
        title="Detalles de la franja"
        containerClassName="slot-detail-modal-container"
        contentClassName="slot-detail-modal-content"
      >
        {slotDetailModal && (
          <div className="slot-detail-modal">
            <div className="slot-detail-modal-body">
              {/* Left: slot info + call link */}
              <div className="slot-detail-modal-left">
                <div className={`slot-detail-hero slot-detail-hero--${slotDetailModal.booking ? (slotDetailModal.booking.callLink?.trim() ? 'ready' : 'pending') : 'available'}`}>
                  <div className="slot-detail-hero-time">
                    {formatSlotTime(slotDetailModal.slot.startUtc)} – {formatSlotTime(slotDetailModal.slot.endUtc)}
                  </div>
                  <div className="slot-detail-hero-meta">
                    <span className="slot-detail-hero-duration">
                      {slotDetailModal.slot.durationMinutes || Math.round((new Date(slotDetailModal.slot.endUtc).getTime() - new Date(slotDetailModal.slot.startUtc).getTime()) / 60000)} min
                    </span>
                    <span className="slot-detail-hero-status">
                      {slotDetailModal.booking
                        ? (slotDetailModal.booking.callLink?.trim() ? 'Listo para llamar' : 'Falta enlace')
                        : 'Disponible'}
                    </span>
                  </div>
                </div>

                {slotDetailModal.booking && (
                  <div className="slot-detail-card slot-detail-card--call">
                    <h3 className="slot-detail-card-title">Enlace de la llamada</h3>
                    <div className="slot-detail-call-row">
                      <input
                        type="url"
                        className="slot-detail-call-input"
                        placeholder="https://meet.google.com/..."
                        value={callLinkInput}
                        onChange={(e) => setCallLinkInput(e.target.value)}
                        aria-label="Enlace de la llamada"
                      />
                      <button
                        type="button"
                        className={`slot-detail-call-btn ${hasCallLinkChange ? 'slot-detail-call-btn--changed' : ''}`}
                        onClick={handleSaveCallLink}
                        disabled={savingCallLink || !hasCallLinkChange}
                      >
                        {savingCallLink ? 'Guardando…' : 'Guardar'}
                      </button>
                    </div>
                  </div>
                )}

                {!slotDetailModal.booking && (
                  <p className="slot-detail-empty">Esta franja está disponible. Nadie la ha reservado.</p>
                )}
              </div>

              {/* Right: profile */}
              {slotDetailModal.booking && (
                <div className="slot-detail-modal-right">
                  <div className="slot-detail-grid">
                    {/* Who – person snapshot */}
                    <div className="slot-detail-card slot-detail-card--who">
                  <h3 className="slot-detail-card-title">Quién es</h3>
                  {clientUserDataError && (
                    <p className="slot-detail-error">{clientUserDataError}</p>
                  )}
                  {clientUserData && (
                    <div className="slot-detail-who">
                      <div className="slot-detail-who-name">
                        {clientUserData.displayName || slotDetailModal.booking.clientDisplayName || '—'}
                      </div>
                      <div className="slot-detail-who-badges">
                        {clientUserData.age != null && (
                          <span className="slot-detail-badge">{clientUserData.age} años</span>
                        )}
                        {clientUserData.gender && (
                          <span className="slot-detail-badge">{clientUserData.gender}</span>
                        )}
                        {slotDetailModal.booking.courseId && (
                          <span className="slot-detail-badge slot-detail-badge--program">Programa reservado</span>
                        )}
                      </div>
                    </div>
                  )}
                  {!clientUserData && !clientUserDataError && (
                    <p className="slot-detail-loading">Cargando…</p>
                  )}
                </div>

                {/* Contact */}
                {clientUserData && (clientUserData.email || clientUserData.phoneNumber) && (
                  <div className="slot-detail-card slot-detail-card--contact">
                    <h3 className="slot-detail-card-title">Contacto</h3>
                    <div className="slot-detail-contact-list">
                      {clientUserData.email && (
                        <div className="slot-detail-contact-item">
                          <span className="slot-detail-contact-label">Email</span>
                          <a href={`mailto:${clientUserData.email}`} className="slot-detail-contact-value">{clientUserData.email}</a>
                        </div>
                      )}
                      {clientUserData.phoneNumber && (
                        <div className="slot-detail-contact-item">
                          <span className="slot-detail-contact-label">Teléfono</span>
                          <a href={`tel:${clientUserData.phoneNumber}`} className="slot-detail-contact-value">{clientUserData.phoneNumber}</a>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Context – location + physical */}
                {clientUserData && (clientUserData.country || clientUserData.city || clientUserData.height != null || clientUserData.bodyweight != null) && (
                  <div className="slot-detail-card slot-detail-card--context">
                    <h3 className="slot-detail-card-title">Contexto</h3>
                    <div className="slot-detail-context-grid">
                      {(clientUserData.country || clientUserData.city) && (
                        <div className="slot-detail-context-item">
                          <span className="slot-detail-context-label">Ubicación</span>
                          <span className="slot-detail-context-value">
                            {[clientUserData.city, clientUserData.country].filter(Boolean).join(', ') || '—'}
                          </span>
                        </div>
                      )}
                      {clientUserData.height != null && (
                        <div className="slot-detail-context-item">
                          <span className="slot-detail-context-label">Altura</span>
                          <span className="slot-detail-context-value">{clientUserData.height} cm</span>
                        </div>
                      )}
                      {clientUserData.bodyweight != null && (
                        <div className="slot-detail-context-item">
                          <span className="slot-detail-context-label">Peso</span>
                          <span className="slot-detail-context-value">{clientUserData.bodyweight} kg</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Goals – motivation, interests, etc. */}
                {clientUserData?.onboardingData && typeof clientUserData.onboardingData === 'object' && (
                  (() => {
                    const od = clientUserData.onboardingData;
                    const hasGoals = od.motivation?.length || od.interests?.length || od.activityLevel || od.workoutPreference || od.obstacles;
                    if (!hasGoals) return null;
                    return (
                      <div className="slot-detail-card slot-detail-card--goals">
                        <h3 className="slot-detail-card-title">Objetivos y preferencias</h3>
                        <div className="slot-detail-goals-list">
                          {od.motivation?.length > 0 && (
                            <div className="slot-detail-goals-item">
                              <span className="slot-detail-goals-label">Motivación</span>
                              <span className="slot-detail-goals-value">
                                {Array.isArray(od.motivation) ? od.motivation.join(', ') : od.motivation}
                              </span>
                            </div>
                          )}
                          {od.interests?.length > 0 && (
                            <div className="slot-detail-goals-item">
                              <span className="slot-detail-goals-label">Intereses</span>
                              <span className="slot-detail-goals-value">
                                {Array.isArray(od.interests) ? od.interests.join(', ') : od.interests}
                              </span>
                            </div>
                          )}
                          {od.activityLevel && (
                            <div className="slot-detail-goals-item">
                              <span className="slot-detail-goals-label">Nivel de actividad</span>
                              <span className="slot-detail-goals-value">{od.activityLevel}</span>
                            </div>
                          )}
                          {od.workoutPreference && (
                            <div className="slot-detail-goals-item">
                              <span className="slot-detail-goals-label">Preferencia de entrenamiento</span>
                              <span className="slot-detail-goals-value">{od.workoutPreference}</span>
                            </div>
                          )}
                          {od.obstacles && (
                            <div className="slot-detail-goals-item">
                              <span className="slot-detail-goals-label">Obstáculos</span>
                              <span className="slot-detail-goals-value">{od.obstacles}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()
                )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </DashboardLayout>
  );
}
