import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  doc, serverTimestamp, Timestamp
} from 'firebase/firestore';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import eventService from '../services/eventService';
import { queryKeys, cacheConfig } from '../config/queryClient';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor,
  useSensor, useSensors
} from '@dnd-kit/core';
import {
  SortableContext, sortableKeyboardCoordinates,
  verticalListSortingStrategy, useSortable, arrayMove
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { storage } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext';
import DashboardLayout from '../components/DashboardLayout';
import ScreenSkeleton from '../components/ScreenSkeleton';
import ErrorBoundary from '../components/ErrorBoundary';
import logger from '../utils/logger';
import DatePicker from '../components/DatePicker';
import './EventEditorScreen.css';

// ─── Helpers ──────────────────────────────────────────────────────
function formatDateForInput(ts) {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toISOString().split('T')[0];
}

function relativeLuminance(r, g, b) {
  return [r, g, b]
    .map(v => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); })
    .reduce((acc, c, i) => acc + c * [0.2126, 0.7152, 0.0722][i], 0);
}

const FIELD_TYPES = [
  { type: 'text',        label: 'Texto corto' },
  { type: 'email',       label: 'Email' },
  { type: 'tel',         label: 'Teléfono' },
  { type: 'number',      label: 'Número' },
  { type: 'select',      label: 'Selección' },
  { type: 'radio',       label: 'Radio' },
  { type: 'multiselect', label: 'Selección múltiple' },
  { type: 'textarea',    label: 'Párrafo' },
  { type: 'date',        label: 'Fecha' },
];

const TYPE_LABELS = Object.fromEntries(FIELD_TYPES.map(f => [f.type, f.label]));

// Default V1 fields — always present, cannot be removed
const DEFAULT_FIELD_IDS = ['f_nombre', 'f_email', 'f_telefono', 'f_edad', 'f_genero'];
const DEFAULT_FIELDS = [
  { id: 'f_nombre',   type: 'text',   label: 'Nombre',   placeholder: 'Tu nombre completo', required: true,  locked: true },
  { id: 'f_email',    type: 'email',  label: 'Email',    placeholder: 'correo@ejemplo.com', required: true,  locked: true },
  { id: 'f_telefono', type: 'tel',    label: 'Teléfono', placeholder: '+57 300 000 0000',   required: false, locked: true },
  { id: 'f_edad',     type: 'number', label: 'Edad',     placeholder: '25',                 required: false, locked: true },
  { id: 'f_genero',   type: 'select', label: 'Género',   placeholder: '',                   required: false, locked: true, options: ['Masculino', 'Femenino', 'Prefiero no decir'] },
];

// ─── SortableField ─────────────────────────────────────────────────
function SortableField({ field, onUpdate, onRemove }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: field.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.45 : 1,
    zIndex: isDragging ? 9 : undefined,
  };
  const [expanded, setExpanded] = useState(false);
  const hasOptions = ['select', 'radio', 'multiselect'].includes(field.type);

  return (
    <div ref={setNodeRef} style={style} className={`ee-field-card${isDragging ? ' ee-field-card--dragging' : ''}`}>
      <div className="ee-field-card-header">
        <button
          className="ee-field-drag"
          {...attributes}
          {...listeners}
          aria-label="Arrastrar"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="9" cy="5" r="1.2" fill="currentColor" /><circle cx="15" cy="5" r="1.2" fill="currentColor" />
            <circle cx="9" cy="12" r="1.2" fill="currentColor" /><circle cx="15" cy="12" r="1.2" fill="currentColor" />
            <circle cx="9" cy="19" r="1.2" fill="currentColor" /><circle cx="15" cy="19" r="1.2" fill="currentColor" />
          </svg>
        </button>
        <span className="ee-field-type-badge">{TYPE_LABELS[field.type]}</span>
        <input
          className="ee-field-label-input"
          placeholder="Etiqueta del campo…"
          value={field.label}
          onChange={e => onUpdate({ label: e.target.value })}
        />
        <div className="ee-field-actions">
          <button
            className="ee-field-expand-btn"
            onClick={() => setExpanded(e => !e)}
            aria-label={expanded ? 'Colapsar' : 'Expandir'}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              {expanded
                ? <polyline points="18 15 12 9 6 15" />
                : <polyline points="6 9 12 15 18 9" />}
            </svg>
          </button>
          <button className="ee-field-remove-btn" onClick={onRemove} aria-label="Eliminar campo">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      {expanded && (
        <div className="ee-field-card-body">
          <div className="ee-field-row">
            <label className="ee-field-sub-label">Placeholder</label>
            <input
              className="ee-field-input"
              placeholder="Texto de ayuda…"
              value={field.placeholder || ''}
              onChange={e => onUpdate({ placeholder: e.target.value })}
            />
          </div>
          <div className="ee-field-row ee-field-row--toggle">
            <span className="ee-field-sub-label">Obligatorio</span>
            <button
              className={`ee-toggle${field.required ? ' ee-toggle--on' : ''}`}
              onClick={() => onUpdate({ required: !field.required })}
              aria-pressed={field.required}
            >
              <span className="ee-toggle-thumb" />
            </button>
          </div>
          {hasOptions && (
            <div className="ee-field-options">
              <label className="ee-field-sub-label">Opciones</label>
              {(field.options || []).map((opt, i) => (
                <div key={i} className="ee-option-row">
                  <input
                    className="ee-field-input"
                    placeholder={`Opción ${i + 1}`}
                    value={opt}
                    onChange={e => {
                      const o = [...(field.options || [])];
                      o[i] = e.target.value;
                      onUpdate({ options: o });
                    }}
                  />
                  <button
                    className="ee-option-remove"
                    onClick={() => {
                      const o = (field.options || []).filter((_, j) => j !== i);
                      onUpdate({ options: o });
                    }}
                    aria-label="Eliminar opción"
                  >×</button>
                </div>
              ))}
              <button
                className="ee-add-option-btn"
                onClick={() => onUpdate({ options: [...(field.options || []), ''] })}
              >
                + Agregar opción
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── LockedField ───────────────────────────────────────────────────
function LockedField({ field, onUpdate }) {
  const [expanded, setExpanded] = useState(false);
  const hasOptions = ['select', 'radio', 'multiselect'].includes(field.type);

  return (
    <div className="ee-field-card ee-field-card--locked">
      <div className="ee-field-card-header">
        <span className="ee-field-lock-icon" aria-label="Campo base">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <rect x="3" y="11" width="18" height="11" rx="2" />
            <path d="M7 11V7a5 5 0 0110 0v4" />
          </svg>
        </span>
        <span className="ee-field-type-badge">{TYPE_LABELS[field.type]}</span>
        <span className="ee-field-label-locked">{field.label}</span>
        <div className="ee-field-actions">
          <button
            className="ee-field-expand-btn"
            onClick={() => setExpanded(e => !e)}
            aria-label={expanded ? 'Colapsar' : 'Expandir'}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              {expanded
                ? <polyline points="18 15 12 9 6 15" />
                : <polyline points="6 9 12 15 18 9" />}
            </svg>
          </button>
        </div>
      </div>

      {expanded && (
        <div className="ee-field-card-body">
          <div className="ee-field-row">
            <label className="ee-field-sub-label">Placeholder</label>
            <input
              className="ee-field-input"
              placeholder="Texto de ayuda…"
              value={field.placeholder || ''}
              onChange={e => onUpdate({ placeholder: e.target.value })}
            />
          </div>
          <div className="ee-field-row ee-field-row--toggle">
            <span className="ee-field-sub-label">Obligatorio</span>
            <button
              className={`ee-toggle${field.required ? ' ee-toggle--on' : ''}`}
              onClick={() => onUpdate({ required: !field.required })}
              aria-pressed={field.required}
            >
              <span className="ee-toggle-thumb" />
            </button>
          </div>
          {hasOptions && (
            <div className="ee-field-options">
              <label className="ee-field-sub-label">Opciones</label>
              {(field.options || []).map((opt, i) => (
                <div key={i} className="ee-option-row">
                  <input
                    className="ee-field-input"
                    placeholder={`Opción ${i + 1}`}
                    value={opt}
                    onChange={e => {
                      const o = [...(field.options || [])];
                      o[i] = e.target.value;
                      onUpdate({ options: o });
                    }}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── FieldTypePicker ───────────────────────────────────────────────
function FieldTypePicker({ onPick, onClose }) {
  return (
    <div className="ee-picker-backdrop" onClick={onClose}>
      <div className="ee-picker-panel ee-fade-in" onClick={e => e.stopPropagation()}>
        <p className="ee-picker-title">Tipo de campo</p>
        <div className="ee-picker-grid">
          {FIELD_TYPES.map(ft => (
            <button key={ft.type} className="ee-picker-btn" onClick={() => onPick(ft.type)}>
              {ft.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── NumberStepper ─────────────────────────────────────────────────
function NumberStepper({ value, onChange, placeholder, min = 1 }) {
  const num = value === '' ? '' : Number(value);

  function decrement() {
    if (value === '') return;
    const next = Math.max(min, num - 1);
    onChange(next === min && num === min ? '' : String(next));
  }

  function increment() {
    const next = value === '' ? min : num + 1;
    onChange(String(next));
  }

  return (
    <div className="ee-number-stepper">
      <button
        type="button"
        className="ee-number-stepper-btn"
        onClick={decrement}
        disabled={value === '' || num <= min}
        aria-label="Reducir"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>
      <input
        className="ee-number-stepper-input"
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        placeholder={placeholder}
        value={value}
        onChange={e => {
          const v = e.target.value.replace(/[^0-9]/g, '');
          onChange(v);
        }}
      />
      <button
        type="button"
        className="ee-number-stepper-btn"
        onClick={increment}
        aria-label="Aumentar"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>
    </div>
  );
}

// ─── Main Screen ───────────────────────────────────────────────────
export default function EventEditorScreen() {
  const { eventId } = useParams();
  const isEdit = Boolean(eventId);
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState('');
  const [location, setLocation] = useState('');
  const [access, setAccess] = useState('public');
  const [maxRegistrations, setMaxRegistrations] = useState('');
  const [confirmationMessage, setConfirmationMessage] = useState('');
  const [sendConfirmationEmail, setSendConfirmationEmail] = useState(false);
  const [enableQrCheckin, setEnableQrCheckin] = useState(false);
  const [status, setStatus] = useState('draft');
  const [fields, setFields] = useState(DEFAULT_FIELDS);

  // Image state
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [imageUrl, setImageUrl] = useState('');
  const [uploadProgress, setUploadProgress] = useState(null);

  // UI state
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [showFieldPicker, setShowFieldPicker] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [currentEventId, setCurrentEventId] = useState(eventId || null);
  const [accentRgb, setAccentRgb] = useState([255, 255, 255]);
  const imageInputRef = useRef(null);

  const accentCss = `rgb(${accentRgb[0]},${accentRgb[1]},${accentRgb[2]})`;
  const cssVars = {
    '--ee-accent': accentCss,
    '--ee-accent-r': accentRgb[0],
    '--ee-accent-g': accentRgb[1],
    '--ee-accent-b': accentRgb[2],
  };

  const { data: eventData, isLoading: eventLoading } = useQuery({
    queryKey: queryKeys.events.detail(eventId),
    queryFn: () => eventService.getEvent(eventId),
    enabled: isEdit && !!user,
    ...cacheConfig.events,
  });

  useEffect(() => {
    if (!eventData) return;
    if (eventData.creator_id !== user?.uid) {
      navigate('/events');
      return;
    }
    const d = eventData;
    setTitle(d.title || '');
    setDescription(d.description || '');
    setDate(d.date ? formatDateForInput(d.date) : '');
    setLocation(d.location || '');
    setAccess(d.access || 'public');
    setMaxRegistrations(d.max_registrations != null ? String(d.max_registrations) : '');
    setConfirmationMessage(d.settings?.confirmation_message || '');
    setSendConfirmationEmail(d.settings?.send_confirmation_email === true);
    setEnableQrCheckin(d.settings?.enable_qr_checkin === true);
    setStatus(d.status || 'draft');
    const loadedFields = d.fields || [];
    const mergedDefaults = DEFAULT_FIELDS.map(def => {
      const saved = loadedFields.find(f => f.id === def.id);
      return saved ? { ...def, ...saved, locked: true } : def;
    });
    const customFields = loadedFields.filter(f => !DEFAULT_FIELD_IDS.includes(f.id));
    setFields([...mergedDefaults, ...customFields]);
    setImageUrl(d.image_url || '');
    setImagePreview(d.image_url || null);
  }, [eventData, user, navigate]);

  useEffect(() => {
    if (!imagePreview) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const size = 64;
        const canvas = document.createElement('canvas');
        canvas.width = size; canvas.height = size;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, size, size);
        const { data } = ctx.getImageData(0, 0, size, size);
        let bestR = 255, bestG = 255, bestB = 255, bestScore = -1;
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
          if (a < 128) continue;
          const max = Math.max(r, g, b), min = Math.min(r, g, b);
          if (max < 40 || max > 245) continue;
          const sat = max === 0 ? 0 : (max - min) / max;
          const score = sat * (max / 255);
          if (score > bestScore) { bestScore = score; bestR = r; bestG = g; bestB = b; }
        }
        setAccentRgb([bestR, bestG, bestB]);
      } catch {}
    };
    img.src = imagePreview;
  }, [imagePreview]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function handleDragEnd(event) {
    const { active, over } = event;
    if (active.id !== over?.id) {
      setFields(items => {
        const locked = items.filter(f => f.locked);
        const custom = items.filter(f => !f.locked);
        const oldIdx = custom.findIndex(f => f.id === active.id);
        const newIdx = custom.findIndex(f => f.id === over.id);
        return [...locked, ...arrayMove(custom, oldIdx, newIdx)];
      });
    }
  }

  function addField(type) {
    const id = `f${Date.now()}`;
    const hasOptions = ['select', 'radio', 'multiselect'].includes(type);
    setFields(prev => [...prev, {
      id, type,
      label: '',
      placeholder: '',
      required: false,
      options: hasOptions ? ['', ''] : undefined,
    }]);
    setShowFieldPicker(false);
  }

  function updateField(id, changes) {
    setFields(prev => prev.map(f => f.id === id ? { ...f, ...changes } : f));
  }

  function removeField(id) {
    setFields(prev => prev.filter(f => f.id !== id));
  }

  function handleImageChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = () => setImagePreview(reader.result);
    reader.readAsDataURL(file);
  }

  async function uploadImage(evId) {
    if (!imageFile) return imageUrl;
    const storageRef = ref(storage, `events/${evId}/cover`);
    return new Promise((resolve, reject) => {
      const task = uploadBytesResumable(storageRef, imageFile);
      task.on(
        'state_changed',
        snap => setUploadProgress(Math.round(snap.bytesTransferred / snap.totalBytes * 100)),
        reject,
        async () => {
          const url = await getDownloadURL(task.snapshot.ref);
          setImageFile(null);
          setImageUrl(url);
          setUploadProgress(null);
          resolve(url);
        }
      );
    });
  }

  async function handleSave(targetStatus = status) {
    if (!title.trim()) { setSaveError('El título es obligatorio'); return; }
    setSaving(true);
    setSaveError(null);
    try {
      let evId = currentEventId;
      let isNewDoc = false;
      if (!evId) {
        evId = `event-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
        setCurrentEventId(evId);
        isNewDoc = true;
      }

      const finalImageUrl = await uploadImage(evId);

      const validFields = fields
        .filter(f => f.locked || f.label.trim())
        .map(f => ({
          id: f.id,
          label: f.label.trim(),
          type: f.type,
          required: Boolean(f.required),
          placeholder: f.placeholder || '',
          locked: Boolean(f.locked),
          ...(f.options ? { options: f.options.filter(o => o.trim()) } : {}),
        }));

      const eventData = {
        title: title.trim(),
        description: description.trim(),
        date: date ? Timestamp.fromDate(new Date(date + 'T00:00:00')) : null,
        location: location.trim(),
        access,
        max_registrations: maxRegistrations ? Number(maxRegistrations) : null,
        settings: {
          confirmation_message: confirmationMessage.trim(),
          send_confirmation_email: sendConfirmationEmail,
          enable_qr_checkin: enableQrCheckin,
          show_registration_count: false,
        },
        status: targetStatus,
        fields: validFields,
        image_url: finalImageUrl,
        updated_at: serverTimestamp(),
      };

      if (!isNewDoc) {
        await eventService.updateEvent(evId, eventData);
      } else {
        eventData.creator_id = user.uid;
        eventData.created_at = serverTimestamp();
        eventData.registration_count = 0;
        await eventService.createEvent(evId, eventData);
        navigate(`/events/${evId}/edit`, { replace: true });
      }

      queryClient.invalidateQueries({ queryKey: queryKeys.events.byCreator(user.uid) });
      setStatus(targetStatus);
    } catch (err) {
      logger.error('[EventEditor] save failed', err);
      setSaveError('Error al guardar. Intenta de nuevo.');
      setUploadProgress(null);
    } finally {
      setSaving(false);
    }
  }

  function handlePreview() {
    const evId = currentEventId || eventId;
    if (evId) window.open(`https://wakelab.co/e/${evId}`, '_blank');
  }

  if (isEdit && eventLoading) {
    return (
      <DashboardLayout screenName="Evento" showBackButton backPath="/events">
        <ScreenSkeleton />
      </DashboardLayout>
    );
  }

  const lum = relativeLuminance(...accentRgb);
  const accentText = lum > 0.35 ? '#111' : '#fff';

  return (
    <ErrorBoundary>
    <DashboardLayout
      screenName={isEdit ? (title || 'Editar evento') : 'Nuevo evento'}
      showBackButton
      backPath="/events"
    >
      <div className="ee-screen" style={{ ...cssVars, '--ee-accent-text': accentText }}>
        {/* Ambient orbs */}
        <div className="ee-orbs" aria-hidden="true">
          <div className="ee-orb ee-orb-1" />
          <div className="ee-orb ee-orb-2" />
        </div>

        {/* Top action bar */}
        <div className="ee-top-bar">
          <div className="ee-status-pills">
            {['draft', 'active', 'closed'].map(s => (
              <button
                key={s}
                className={`ee-status-pill${status === s ? ' ee-status-pill--on' : ''}`}
                onClick={() => setStatus(s)}
              >
                {s === 'draft' ? 'Borrador' : s === 'active' ? 'Activo' : 'Cerrado'}
              </button>
            ))}
          </div>
          <div className="ee-top-actions">
            {(currentEventId || isEdit) && (
              <button className="ee-btn ee-btn--ghost" onClick={handlePreview}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
                  <polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
                </svg>
                Vista previa
              </button>
            )}
            <button
              className="ee-btn ee-btn--primary"
              onClick={() => handleSave(status)}
              disabled={saving}
            >
              {saving
                ? (uploadProgress != null ? `Subiendo ${uploadProgress}%…` : 'Guardando…')
                : 'Guardar'}
            </button>
            {status !== 'active' && (
              <button
                className="ee-btn ee-btn--publish"
                onClick={() => handleSave('active')}
                disabled={saving}
              >
                Publicar
              </button>
            )}
          </div>
        </div>

        {saveError && <p className="ee-save-error">{saveError}</p>}

        {/* Two-panel layout */}
        <div className="ee-panels">
          {/* ── Left: Metadata ── */}
          <div className="ee-panel ee-panel--meta">
            <h2 className="ee-panel-title">Detalles del evento</h2>

            {/* Cover image */}
            <div className="ee-field-group">
              <label className="ee-label">Imagen del evento</label>
              {imagePreview ? (
                <div className="ee-image-preview-wrap">
                  <img
                    src={imagePreview}
                    alt="Preview"
                    className="ee-image-preview ee-image-preview--clickable"
                    onClick={() => setLightboxOpen(true)}
                  />
                  <button
                    className="ee-image-remove"
                    onClick={() => { setImagePreview(null); setImageFile(null); setImageUrl(''); }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
              ) : (
                <button
                  className="ee-image-upload-area"
                  onClick={() => imageInputRef.current?.click()}
                >
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" strokeWidth="0" />
                    <polyline points="21 15 16 10 5 21" />
                  </svg>
                  <span>Subir imagen</span>
                </button>
              )}
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                className="ee-input-hidden"
                onChange={handleImageChange}
              />
            </div>

            {/* Title */}
            <div className="ee-field-group">
              <label className="ee-label">Título <span className="ee-required">*</span></label>
              <input
                className="ee-input"
                placeholder="Ej. Run Club Marzo 2026"
                value={title}
                onChange={e => setTitle(e.target.value)}
              />
            </div>

            {/* Description */}
            <div className="ee-field-group">
              <label className="ee-label">Descripción</label>
              <textarea
                className="ee-input ee-input--textarea"
                placeholder="Describe el evento…"
                rows={4}
                value={description}
                onChange={e => setDescription(e.target.value)}
              />
            </div>

            {/* Date */}
            <div className="ee-field-group">
              <label className="ee-label">Fecha</label>
              <DatePicker
                value={date}
                onChange={e => setDate(e.target.value)}
                placeholder="Selecciona la fecha del evento"
                allowFuture
              />
            </div>

            {/* Location */}
            <div className="ee-field-group">
              <label className="ee-label">Lugar</label>
              <input
                className="ee-input"
                placeholder="Ej. Parque El Virrey, Bogotá"
                value={location}
                onChange={e => setLocation(e.target.value)}
              />
            </div>

            {/* Max registrations */}
            <div className="ee-field-group">
              <label className="ee-label">Cupos máximos</label>
              <NumberStepper
                value={maxRegistrations}
                onChange={setMaxRegistrations}
                placeholder="Ilimitado"
                min={1}
              />
            </div>

            {/* Confirmation message */}
            <div className="ee-field-group">
              <label className="ee-label">Mensaje de confirmación</label>
              <textarea
                className="ee-input ee-input--textarea"
                placeholder="Ej. ¡Nos vemos el sábado en el parque!"
                rows={3}
                value={confirmationMessage}
                onChange={e => setConfirmationMessage(e.target.value)}
              />
            </div>

            {/* Features */}
            <div className="ee-field-group">
              <label className="ee-label">Funcionalidades</label>
              <div className="ee-feature-toggles">
                <div className="ee-feature-row">
                  <div className="ee-feature-info">
                    <span className="ee-feature-name">Email de confirmación</span>
                    <span className="ee-feature-desc">Enviar email con detalles al registrarse</span>
                  </div>
                  <button
                    className={`ee-toggle${sendConfirmationEmail ? ' ee-toggle--on' : ''}`}
                    onClick={() => setSendConfirmationEmail(v => !v)}
                    aria-pressed={sendConfirmationEmail}
                  >
                    <span className="ee-toggle-thumb" />
                  </button>
                </div>
                <div className="ee-feature-row">
                  <div className="ee-feature-info">
                    <span className="ee-feature-name">QR de check-in</span>
                    <span className="ee-feature-desc">Generar código QR para entrada al evento</span>
                  </div>
                  <button
                    className={`ee-toggle${enableQrCheckin ? ' ee-toggle--on' : ''}`}
                    onClick={() => setEnableQrCheckin(v => !v)}
                    aria-pressed={enableQrCheckin}
                  >
                    <span className="ee-toggle-thumb" />
                  </button>
                </div>
              </div>
            </div>

            {/* Access */}
            <div className="ee-field-group">
              <label className="ee-label">Acceso</label>
              <div className="ee-access-toggle">
                <button
                  className={`ee-access-opt${access === 'public' ? ' ee-access-opt--on' : ''}`}
                  onClick={() => setAccess('public')}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2a15.3 15.3 0 010 20M12 2a15.3 15.3 0 000 20" />
                  </svg>
                  Público
                </button>
                <button
                  className={`ee-access-opt${access === 'wake_users_only' ? ' ee-access-opt--on' : ''}`}
                  onClick={() => setAccess('wake_users_only')}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  </svg>
                  Solo usuarios Wake
                </button>
              </div>
              {access === 'wake_users_only' && (
                <p className="ee-access-note">
                  Los usuarios deben tener cuenta en Wake para registrarse.
                </p>
              )}
            </div>
          </div>

          {/* ── Right: Field Builder ── */}
          <div className="ee-panel ee-panel--builder">
            <div className="ee-panel-title-row">
              <h2 className="ee-panel-title">Campos del formulario</h2>
              {(() => {
                const customCount = fields.filter(f => !f.locked).length;
                return customCount > 0
                  ? <span className="ee-field-count">+{customCount} personalizado{customCount !== 1 ? 's' : ''}</span>
                  : null;
              })()}
            </div>

            {/* Locked default fields */}
            <div className="ee-fields-section-label">Campos base</div>
            <div className="ee-fields-list ee-fields-list--locked">
              {fields.filter(f => f.locked).map(field => (
                <LockedField
                  key={field.id}
                  field={field}
                  onUpdate={changes => updateField(field.id, changes)}
                />
              ))}
            </div>

            {/* Custom fields */}
            <div className="ee-fields-section-label ee-fields-section-label--custom">Campos adicionales</div>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext
                items={fields.filter(f => !f.locked).map(f => f.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="ee-fields-list">
                  {fields.filter(f => !f.locked).map(field => (
                    <SortableField
                      key={field.id}
                      field={field}
                      onUpdate={changes => updateField(field.id, changes)}
                      onRemove={() => removeField(field.id)}
                    />
                  ))}
                  {fields.filter(f => !f.locked).length === 0 && (
                    <div className="ee-fields-empty">
                      <p>Agrega campos personalizados para recopilar más información</p>
                    </div>
                  )}
                </div>
              </SortableContext>
            </DndContext>

            <button className="ee-add-field-btn" onClick={() => setShowFieldPicker(true)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Agregar campo
            </button>
          </div>
        </div>

        {showFieldPicker && (
          <FieldTypePicker
            onPick={addField}
            onClose={() => setShowFieldPicker(false)}
          />
        )}

        {lightboxOpen && imagePreview && (
          <div className="ee-lightbox" onClick={() => setLightboxOpen(false)}>
            <button className="ee-lightbox-close" aria-label="Cerrar">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
            <img
              src={imagePreview}
              alt="Imagen del evento"
              className="ee-lightbox-img"
              onClick={e => e.stopPropagation()}
            />
          </div>
        )}
      </div>
    </DashboardLayout>
    </ErrorBoundary>
  );
}
