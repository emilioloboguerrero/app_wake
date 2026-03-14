import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import eventService from '../services/eventService';
import { queryKeys, cacheConfig } from '../config/queryClient';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell
} from 'recharts';
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
import './EventResultsScreen.css';
import './EventEditorScreen.css';

// ─── Shared helpers ────────────────────────────────────────────────

function relativeLuminance(r, g, b) {
  return [r, g, b]
    .map(v => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); })
    .reduce((acc, c, i) => acc + c * [0.2126, 0.7152, 0.0722][i], 0);
}

function formatDate(ts) {
  if (!ts) return '—';
  return ts.toDate().toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatTime(ts) {
  if (!ts) return '';
  return ts.toDate().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
}

function formatDay(ts) {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });
}

function formatDateForInput(ts) {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toISOString().split('T')[0];
}

// ─── Results helpers ───────────────────────────────────────────────

function isV2Registration(reg) {
  return Boolean(reg.responses && typeof reg.responses === 'object');
}

function getCellValue(reg, colId) {
  if (isV2Registration(reg)) {
    const val = reg.responses?.[colId];
    if (Array.isArray(val)) return val.join(', ');
    return val ?? '—';
  }
  return reg[colId] ?? '—';
}

function buildColumns(event) {
  if (event.fields && event.fields.length > 0) {
    return event.fields.map(f => ({ id: f.id, label: f.label }));
  }
  return [
    { id: 'nombre',   label: 'Nombre' },
    { id: 'email',    label: 'Email' },
    { id: 'telefono', label: 'Teléfono' },
    { id: 'edad',     label: 'Edad' },
    { id: 'genero',   label: 'Género' },
  ];
}

function getDisplayName(reg, columns) {
  if (reg.nombre) return reg.nombre;
  if (reg.responses) {
    const nameCol = columns.find(c =>
      c.label.toLowerCase().includes('nombre') || c.label.toLowerCase().includes('name')
    );
    if (nameCol) return reg.responses[nameCol.id] || 'Registrado';
    return Object.values(reg.responses).find(v => typeof v === 'string' && v.includes(' ')) || 'Registrado';
  }
  return 'Registrado';
}

function groupByDay(registrations) {
  const map = {};
  registrations.forEach(r => {
    const key = formatDay(r.created_at);
    if (!key) return;
    map[key] = (map[key] || 0) + 1;
  });
  return Object.entries(map).map(([day, count]) => ({ day, count }));
}

function buildFieldDistributions(event, registrations) {
  const chartFields = (event.fields || []).filter(f =>
    ['select', 'radio', 'multiselect'].includes(f.type)
  );
  return chartFields.map(field => {
    const counts = {};
    registrations.forEach(r => {
      const val = r.responses?.[field.id];
      if (!val) return;
      const values = Array.isArray(val) ? val : [val];
      values.forEach(v => { if (v) counts[v] = (counts[v] || 0) + 1; });
    });
    return {
      field,
      data: Object.entries(counts).map(([name, value]) => ({ name, value })),
    };
  });
}

const CHART_COLORS = [
  'rgba(255,255,255,0.75)',
  'rgba(255,255,255,0.5)',
  'rgba(255,255,255,0.35)',
  'rgba(255,255,255,0.2)',
  'rgba(255,255,255,0.12)',
];

// ─── Editor constants ──────────────────────────────────────────────

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

const DEFAULT_FIELD_IDS = ['f_nombre', 'f_email', 'f_telefono', 'f_edad', 'f_genero'];
const DEFAULT_FIELDS = [
  { id: 'f_nombre',   type: 'text',   label: 'Nombre',   placeholder: 'Tu nombre completo', required: true,  locked: true },
  { id: 'f_email',    type: 'email',  label: 'Email',    placeholder: 'correo@ejemplo.com', required: true,  locked: true },
  { id: 'f_telefono', type: 'tel',    label: 'Teléfono', placeholder: '+57 300 000 0000',   required: false, locked: true },
  { id: 'f_edad',     type: 'number', label: 'Edad',     placeholder: '25',                 required: false, locked: true },
  { id: 'f_genero',   type: 'select', label: 'Género',   placeholder: '',                   required: false, locked: true, options: ['Masculino', 'Femenino', 'Prefiero no decir'] },
];

// ─── Editor sub-components ─────────────────────────────────────────

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
        <button className="ee-field-drag" {...attributes} {...listeners} aria-label="Arrastrar">
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

// ─── Results sub-components ────────────────────────────────────────

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="er-tooltip">
      <p className="er-tooltip-label">{label}</p>
      <p className="er-tooltip-value">{payload[0].value}</p>
    </div>
  );
}

function StatCard({ label, value, sub }) {
  return (
    <div className="er-stat-card er-fade-in">
      <span className="er-stat-label">{label}</span>
      <span className="er-stat-value">{value}</span>
      {sub && <span className="er-stat-sub">{sub}</span>}
    </div>
  );
}

function RowModal({ reg, columns, onClose, onCheckIn, onDelete }) {
  const isCheckedIn = reg.checked_in;
  const [actionLoading, setActionLoading] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function handleCheckIn() {
    setActionLoading('checkin');
    await onCheckIn();
    setActionLoading(null);
  }

  async function handleDelete() {
    setActionLoading('delete');
    await onDelete();
    setActionLoading(null);
  }

  return (
    <div className="er-modal-backdrop" onClick={onClose}>
      <div className="er-modal er-fade-in" onClick={e => e.stopPropagation()}>
        <button className="er-modal-close" onClick={onClose} aria-label="Cerrar">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <div className="er-modal-header">
          <h2 className="er-modal-name">{getDisplayName(reg, columns)}</h2>
          <span className={`er-modal-checkin-badge${isCheckedIn ? ' er-modal-checkin-badge--yes' : ''}`}>
            {isCheckedIn ? 'Check-in ✓' : 'Sin check-in'}
          </span>
        </div>

        <div className="er-modal-fields">
          {columns.map(col => (
            <div key={col.id} className="er-modal-field">
              <span className="er-modal-field-label">{col.label}</span>
              <span className="er-modal-field-value">{getCellValue(reg, col.id)}</span>
            </div>
          ))}
          <div className="er-modal-field">
            <span className="er-modal-field-label">Fecha de registro</span>
            <span className="er-modal-field-value">{formatDate(reg.created_at)}</span>
          </div>
          {isCheckedIn && reg.checked_in_at && (
            <div className="er-modal-field">
              <span className="er-modal-field-label">Hora de check-in</span>
              <span className="er-modal-field-value">{formatTime(reg.checked_in_at)}</span>
            </div>
          )}
        </div>

        {!isCheckedIn && (
          <button
            className="er-modal-checkin-btn"
            onClick={handleCheckIn}
            disabled={actionLoading !== null}
          >
            {actionLoading === 'checkin' ? 'Registrando…' : 'Marcar check-in manual'}
          </button>
        )}

        {confirmDelete ? (
          <div className="er-modal-confirm-row">
            <span className="er-modal-confirm-text">¿Eliminar este registro?</span>
            <button
              className="er-modal-confirm-yes"
              onClick={handleDelete}
              disabled={actionLoading !== null}
            >
              {actionLoading === 'delete' ? 'Eliminando…' : 'Eliminar'}
            </button>
            <button className="er-modal-confirm-no" onClick={() => setConfirmDelete(false)}>
              Cancelar
            </button>
          </div>
        ) : (
          <button className="er-modal-delete-btn" onClick={() => setConfirmDelete(true)}>
            Eliminar registro
          </button>
        )}
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
    onChange(String(value === '' ? min : num + 1));
  }
  return (
    <div className="ee-number-stepper">
      <button type="button" className="ee-number-stepper-btn" onClick={decrement} disabled={value === '' || num <= min} aria-label="Reducir">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="5" y1="12" x2="19" y2="12" /></svg>
      </button>
      <input
        className="ee-number-stepper-input"
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value.replace(/[^0-9]/g, ''))}
      />
      <button type="button" className="ee-number-stepper-btn" onClick={increment} aria-label="Aumentar">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
      </button>
    </div>
  );
}

// ─── Main screen ───────────────────────────────────────────────────

export default function EventResultsScreen() {
  const { eventId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const routerLocation = useLocation();
  const queryClient = useQueryClient();

  const defaultTab = routerLocation.pathname.endsWith('/edit') ? 'editar' : 'registros';

  const { data: event, isLoading: eventLoading } = useQuery({
    queryKey: queryKeys.events.detail(eventId),
    queryFn: () => eventService.getEvent(eventId),
    enabled: !!user && !!eventId,
    ...cacheConfig.events,
  });

  const { data: registrations = [], isLoading: regsLoading } = useQuery({
    queryKey: queryKeys.events.registrations(eventId),
    queryFn: () => eventService.getEventRegistrations(eventId),
    enabled: !!user && !!eventId,
    ...cacheConfig.events,
  });

  const { data: waitlist = [], isLoading: waitlistLoading } = useQuery({
    queryKey: queryKeys.events.waitlist(eventId),
    queryFn: () => eventService.getEventWaitlist(eventId),
    enabled: !!user && !!eventId,
    ...cacheConfig.events,
  });

  const isLoading = eventLoading || regsLoading || waitlistLoading;

  const [selectedReg, setSelectedReg] = useState(null);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState(defaultTab);

  const [accentRgb, setAccentRgb] = useState([255, 255, 255]);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [eventLocation, setEventLocation] = useState('');
  const [access, setAccess] = useState('public');
  const [maxRegistrations, setMaxRegistrations] = useState('');
  const [confirmationMessage, setConfirmationMessage] = useState('');
  const [sendConfirmationEmail, setSendConfirmationEmail] = useState(false);
  const [enableQrCheckin, setEnableQrCheckin] = useState(false);
  const [eventStatus, setEventStatus] = useState('draft');
  const [fields, setFields] = useState(DEFAULT_FIELDS);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [imageUrl, setImageUrl] = useState('');
  const [uploadProgress, setUploadProgress] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [showFieldPicker, setShowFieldPicker] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const imageInputRef = useRef(null);
  const savedRef = useRef(null);

  useEffect(() => {
    if (!event) return;
    if (event.creator_id !== user?.uid) {
      navigate('/events', { replace: true });
      return;
    }
    const d = event;
    setTitle(d.title || '');
    setDescription(d.description || '');
    setEventDate(d.date ? formatDateForInput(d.date) : '');
    setEventLocation(d.location || '');
    setAccess(d.access || 'public');
    setMaxRegistrations(d.max_registrations != null ? String(d.max_registrations) : '');
    setConfirmationMessage(d.settings?.confirmation_message || '');
    setSendConfirmationEmail(d.settings?.send_confirmation_email === true);
    setEnableQrCheckin(d.settings?.enable_qr_checkin === true);
    setEventStatus(d.status || 'draft');
    const loadedFields = d.fields || [];
    const mergedDefaults = DEFAULT_FIELDS.map(def => {
      const saved = loadedFields.find(f => f.id === def.id);
      return saved ? { ...def, ...saved, locked: true } : def;
    });
    const customFields = loadedFields.filter(f => !DEFAULT_FIELD_IDS.includes(f.id));
    const initialFields = [...mergedDefaults, ...customFields];
    setFields(initialFields);
    setImageUrl(d.image_url || '');
    setImagePreview(d.image_url || null);
    savedRef.current = {
      title: d.title || '',
      description: d.description || '',
      eventDate: d.date ? formatDateForInput(d.date) : '',
      eventLocation: d.location || '',
      access: d.access || 'public',
      maxRegistrations: d.max_registrations != null ? String(d.max_registrations) : '',
      confirmationMessage: d.settings?.confirmation_message || '',
      sendConfirmationEmail: d.settings?.send_confirmation_email === true,
      enableQrCheckin: d.settings?.enable_qr_checkin === true,
      eventStatus: d.status || 'draft',
      fields: JSON.stringify(initialFields),
      imageUrl: d.image_url || '',
    };
  }, [event, user, navigate]);

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

  function handleDragEnd(ev) {
    const { active, over } = ev;
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

  async function uploadImage() {
    if (!imageFile) return imageUrl;
    const storageRef = ref(storage, `events/${eventId}/cover`);
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

  async function handleSave(targetStatus = eventStatus) {
    if (!title.trim()) { setSaveError('El título es obligatorio'); return; }
    setSaving(true);
    setSaveError(null);
    try {
      const finalImageUrl = await uploadImage();

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
        date: eventService.makeDateTimestamp(eventDate),
        location: eventLocation.trim(),
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
      };

      await eventService.updateEvent(eventId, eventData);
      queryClient.invalidateQueries({ queryKey: queryKeys.events.detail(eventId) });
      setEventStatus(targetStatus);
      savedRef.current = {
        title,
        description,
        eventDate,
        eventLocation,
        access,
        maxRegistrations,
        confirmationMessage,
        sendConfirmationEmail,
        enableQrCheckin,
        eventStatus: targetStatus,
        fields: JSON.stringify(fields),
        imageUrl: finalImageUrl,
      };
    } catch (err) {
      logger.error('[EventResults] save failed', err);
      setSaveError('Error al guardar. Intenta de nuevo.');
      setUploadProgress(null);
    } finally {
      setSaving(false);
    }
  }

  function exportCSV() {
    const cols = event ? buildColumns(event) : [];
    const headers = [...cols.map(c => c.label), 'Fecha', 'Check-in'];
    const rows = filteredRegs.map(r => [
      ...cols.map(c => String(getCellValue(r, c.id) ?? '')),
      r.created_at?.toDate().toLocaleDateString('es-CO') ?? '',
      r.checked_in ? 'Sí' : 'No',
    ]);
    const csv = [headers, ...rows]
      .map(row => row.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `registros-${eventId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleManualCheckIn(regId) {
    await eventService.checkInRegistration(eventId, regId);
    queryClient.invalidateQueries({ queryKey: queryKeys.events.registrations(eventId) });
  }

  async function handleDeleteRegistration(regId) {
    await eventService.deleteRegistration(eventId, regId);
    queryClient.invalidateQueries({ queryKey: queryKeys.events.registrations(eventId) });
    setSelectedReg(null);
  }

  async function admitFromWaitlist(waitId) {
    try {
      await eventService.admitFromWaitlist(eventId, waitId, event?.max_registrations != null);
      queryClient.invalidateQueries({ queryKey: queryKeys.events.waitlist(eventId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.events.detail(eventId) });
    } catch (err) {
      logger.error('[EventResults] admit failed', err);
    }
  }

  const columns = event ? buildColumns(event) : [];

  const isDirty = (() => {
    const s = savedRef.current;
    if (!s) return false;
    return (
      title !== s.title ||
      description !== s.description ||
      eventDate !== s.eventDate ||
      eventLocation !== s.eventLocation ||
      access !== s.access ||
      maxRegistrations !== s.maxRegistrations ||
      confirmationMessage !== s.confirmationMessage ||
      sendConfirmationEmail !== s.sendConfirmationEmail ||
      enableQrCheckin !== s.enableQrCheckin ||
      eventStatus !== s.eventStatus ||
      imageFile !== null ||
      imageUrl !== s.imageUrl ||
      JSON.stringify(fields) !== s.fields
    );
  })();
  const accentCss = `rgba(${accentRgb[0]},${accentRgb[1]},${accentRgb[2]},0.85)`;
  const lum = relativeLuminance(...accentRgb);
  const accentText = lum > 0.35 ? '#111' : '#fff';

  const filteredRegs = search.trim()
    ? registrations.filter(r => {
        const q = search.toLowerCase();
        if (isV2Registration(r)) {
          return Object.values(r.responses || {}).some(v =>
            typeof v === 'string' && v.toLowerCase().includes(q)
          );
        }
        return ['nombre', 'email', 'telefono'].some(k =>
          String(r[k] || '').toLowerCase().includes(q)
        );
      })
    : registrations;

  const total = registrations.length;
  const checkedIn = registrations.filter(r => r.checked_in).length;
  const checkinRate = total > 0 ? Math.round(checkedIn / total * 100) : 0;
  const capacity = event?.max_registrations;
  const capacityPct = capacity ? Math.min(Math.round(total / capacity * 100), 100) : null;
  const timelineData = groupByDay([...registrations].reverse());
  const fieldDistributions = event ? buildFieldDistributions(event, registrations) : [];

  const cssVars = {
    '--er-accent-r': accentRgb[0],
    '--er-accent-g': accentRgb[1],
    '--er-accent-b': accentRgb[2],
    '--ee-accent': `rgb(${accentRgb[0]},${accentRgb[1]},${accentRgb[2]})`,
    '--ee-accent-r': accentRgb[0],
    '--ee-accent-g': accentRgb[1],
    '--ee-accent-b': accentRgb[2],
    '--ee-accent-text': accentText,
  };

  return (
    <ErrorBoundary>
    <DashboardLayout
      screenName={event?.title ?? 'Evento'}
      showBackButton
      backPath="/events"
    >
      <div className="event-results-screen" style={cssVars}>
        <div className="er-orbs" aria-hidden="true">
          <div className="er-orb er-orb-1" />
          <div className="er-orb er-orb-2" />
        </div>

        {isLoading ? (
          <ScreenSkeleton />
        ) : (
          <>
            {/* Header */}
            <div className="event-results-header">
              <div>
                <h1 className="event-results-title">{event?.title}</h1>
                <span className="event-results-count">
                  {registrations.length} registros
                  {event?.max_registrations != null && ` · ${event.max_registrations} cupos`}
                  {waitlist.length > 0 && ` · ${waitlist.length} en lista de espera`}
                </span>
                {event?.max_registrations != null && (
                  <div className="er-capacity-bar-outer">
                    <div
                      className="er-capacity-bar-fill"
                      style={{ width: `${Math.min((event.registration_count ?? 0) / event.max_registrations * 100, 100)}%` }}
                    />
                  </div>
                )}
              </div>
              <div className="er-header-actions">
                <button
                  className="ee-btn ee-btn--ghost"
                  onClick={() => navigate(`/events/${eventId}/checkin`)}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9 12l2 2 4-4" />
                    <path d="M21 12c0 4.97-4.03 9-9 9s-9-4.03-9-9 4.03-9 9-9 9 4.03 9 9z" />
                  </svg>
                  Check-in
                </button>
                <button
                  className="ee-btn ee-btn--ghost"
                  onClick={() => window.open(`https://wakelab.co/e/${eventId}`, '_blank')}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
                    <polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
                  </svg>
                  Vista previa
                </button>
                {eventStatus !== 'active' && (
                  <button
                    className="ee-btn ee-btn--publish"
                    onClick={() => handleSave('active')}
                    disabled={saving}
                  >
                    Publicar
                  </button>
                )}
                <button
                  className="ee-btn ee-btn--primary"
                  onClick={() => handleSave(eventStatus)}
                  disabled={saving || !isDirty}
                >
                  {saving
                    ? (uploadProgress != null ? `Subiendo ${uploadProgress}%…` : 'Guardando…')
                    : 'Guardar'}
                </button>
              </div>
            </div>

            {/* Tabs */}
            <div className="er-tabs">
              <button
                className={`er-tab${activeTab === 'registros' ? ' er-tab--active' : ''}`}
                onClick={() => setActiveTab('registros')}
              >
                Registros
                {registrations.length > 0 && (
                  <span className="er-tab-count">{registrations.length}</span>
                )}
              </button>
              <button
                className={`er-tab${activeTab === 'analytics' ? ' er-tab--active' : ''}`}
                onClick={() => setActiveTab('analytics')}
              >
                Analytics
              </button>
              <button
                className={`er-tab${activeTab === 'editar' ? ' er-tab--active' : ''}`}
                onClick={() => setActiveTab('editar')}
              >
                Editar
              </button>
            </div>

            {/* ── Registros tab ── */}
            {activeTab === 'registros' && (
              <>
                {registrations.length > 0 && (
                  <div className="er-search-row">
                    <div className="er-search-wrap">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
                      </svg>
                      <input
                        className="er-search-input"
                        placeholder="Buscar registros…"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                      />
                      {search && (
                        <button className="er-search-clear" onClick={() => setSearch('')}>×</button>
                      )}
                    </div>
                    <button className="event-results-export-btn" onClick={exportCSV}>
                      Exportar CSV
                    </button>
                  </div>
                )}

                {filteredRegs.length === 0 ? (
                  <div className="event-results-empty">
                    {search ? 'Sin resultados para esa búsqueda.' : 'Aún no hay registros.'}
                  </div>
                ) : (
                  <div className="event-results-table-wrap">
                    <table className="event-results-table">
                      <thead>
                        <tr>
                          {columns.map(col => (
                            <th key={col.id}>{col.label}</th>
                          ))}
                          <th>Fecha</th>
                          <th>Check-in</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredRegs.map(r => (
                          <tr
                            key={r.id}
                            className="er-table-row"
                            onClick={() => setSelectedReg(r)}
                            style={{ cursor: 'pointer' }}
                          >
                            {columns.map(col => (
                              <td key={col.id}>{getCellValue(r, col.id)}</td>
                            ))}
                            <td>{formatDate(r.created_at)}</td>
                            <td onClick={e => e.stopPropagation()}>
                              {r.checked_in ? (
                                <span className="event-results-checkin event-results-checkin-yes">Sí</span>
                              ) : (
                                <button
                                  className="er-checkin-btn"
                                  onClick={() => handleManualCheckIn(r.id)}
                                >
                                  Marcar
                                </button>
                              )}
                            </td>
                            <td onClick={e => e.stopPropagation()}>
                              <button
                                className="er-detail-btn"
                                onClick={() => setSelectedReg(r)}
                                aria-label="Ver detalle"
                              >
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /><circle cx="5" cy="12" r="1" />
                                </svg>
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {waitlist.length > 0 && (
                  <div className="er-waitlist-section">
                    <h2 className="er-waitlist-title">
                      Lista de espera <span className="er-waitlist-count">{waitlist.length}</span>
                    </h2>
                    <div className="event-results-table-wrap">
                      <table className="event-results-table">
                        <thead>
                          <tr>
                            <th>Contacto</th>
                            <th>Fecha</th>
                            <th></th>
                          </tr>
                        </thead>
                        <tbody>
                          {waitlist.map(w => (
                            <tr key={w.id}>
                              <td>{w.contact}</td>
                              <td>{formatDate(w.created_at)}</td>
                              <td>
                                <button className="er-admit-btn" onClick={() => admitFromWaitlist(w.id)}>
                                  Admitir
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* ── Analytics tab ── */}
            {activeTab === 'analytics' && (
              <div className="er-analytics">
                {total === 0 ? (
                  <div className="er-analytics-empty er-fade-in">
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2">
                      <path d="M18 20V10M12 20V4M6 20v-6" />
                    </svg>
                    <p>Aún no hay datos. Los analytics aparecerán cuando lleguen los primeros registros.</p>
                  </div>
                ) : (
                  <>
                    <div className="er-stats-row">
                      <StatCard label="Registros" value={total} />
                      <StatCard
                        label="Check-in"
                        value={`${checkedIn}`}
                        sub={total > 0 ? `${checkinRate}% del total` : undefined}
                      />
                      {capacity != null && (
                        <StatCard
                          label="Capacidad"
                          value={`${total} / ${capacity}`}
                          sub={`${capacityPct}% lleno`}
                        />
                      )}
                    </div>

                    {timelineData.length > 1 && (
                      <div className="er-analytics-card er-fade-in">
                        <h3 className="er-analytics-card-title">Registros por día</h3>
                        <div className="er-chart-wrap">
                          <ResponsiveContainer width="100%" height={220}>
                            <LineChart data={timelineData} margin={{ top: 8, right: 16, bottom: 0, left: -16 }}>
                              <XAxis
                                dataKey="day"
                                tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 11 }}
                                axisLine={{ stroke: 'rgba(255,255,255,0.07)' }}
                                tickLine={false}
                              />
                              <YAxis
                                allowDecimals={false}
                                tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 11 }}
                                axisLine={false}
                                tickLine={false}
                              />
                              <Tooltip content={<ChartTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.08)' }} />
                              <Line
                                type="monotone"
                                dataKey="count"
                                stroke={accentCss}
                                strokeWidth={2}
                                dot={{ fill: accentCss, r: 4, strokeWidth: 0 }}
                                activeDot={{ r: 6, fill: accentCss }}
                              />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    )}

                    <div className="er-analytics-card er-fade-in">
                      <h3 className="er-analytics-card-title">Tasa de check-in</h3>
                      <div className="er-checkin-rate-row">
                        <div className="er-checkin-bar-outer">
                          <div className="er-checkin-bar-fill" style={{ width: `${checkinRate}%` }} />
                        </div>
                        <span className="er-checkin-pct">{checkinRate}%</span>
                      </div>
                      <p className="er-checkin-sub">{checkedIn} de {total} registrados hicieron check-in</p>
                    </div>

                    {capacity != null && (
                      <div className="er-analytics-card er-fade-in">
                        <h3 className="er-analytics-card-title">Capacidad</h3>
                        <div className="er-analytics-cap-bar-outer">
                          <div className="er-analytics-cap-bar-fill" style={{ width: `${capacityPct}%` }} />
                        </div>
                        <div className="er-analytics-cap-labels">
                          <span>{total} registros</span>
                          <span>{capacity} cupos</span>
                        </div>
                      </div>
                    )}

                    {fieldDistributions.map(({ field, data }) =>
                      data.length > 0 && (
                        <div key={field.id} className="er-analytics-card er-fade-in">
                          <h3 className="er-analytics-card-title">{field.label}</h3>
                          <div className="er-chart-wrap">
                            <ResponsiveContainer width="100%" height={Math.max(180, data.length * 44)}>
                              <BarChart
                                data={data}
                                layout="vertical"
                                margin={{ top: 0, right: 40, bottom: 0, left: 8 }}
                              >
                                <XAxis
                                  type="number"
                                  allowDecimals={false}
                                  tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 11 }}
                                  axisLine={{ stroke: 'rgba(255,255,255,0.07)' }}
                                  tickLine={false}
                                />
                                <YAxis
                                  type="category"
                                  dataKey="name"
                                  width={120}
                                  tick={{ fill: 'rgba(255,255,255,0.6)', fontSize: 12 }}
                                  axisLine={false}
                                  tickLine={false}
                                />
                                <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                                <Bar dataKey="value" radius={[0, 5, 5, 0]}>
                                  {data.map((_, i) => (
                                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                                  ))}
                                </Bar>
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                      )
                    )}
                  </>
                )}
              </div>
            )}

            {/* ── Editar tab ── */}
            {activeTab === 'editar' && (
              <div style={{ paddingBottom: 48 }}>
                {/* Status pills */}
                <div className="ee-status-pills" style={{ marginBottom: 16 }}>
                  {['draft', 'active', 'closed'].map(s => (
                    <button
                      key={s}
                      className={`ee-status-pill${eventStatus === s ? ' ee-status-pill--on' : ''}`}
                      onClick={() => setEventStatus(s)}
                    >
                      {s === 'draft' ? 'Borrador' : s === 'active' ? 'Activo' : 'Cerrado'}
                    </button>
                  ))}
                </div>

                {saveError && <p className="ee-save-error">{saveError}</p>}

                {/* Two-panel layout */}
                <div className="ee-panels">
                  {/* ── Left: Metadata ── */}
                  <div className="ee-panel ee-panel--meta">
                    <h2 className="ee-panel-title">Detalles del evento</h2>

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

                    <div className="ee-field-group">
                      <label className="ee-label">Título <span className="ee-required">*</span></label>
                      <input
                        className="ee-input"
                        placeholder="Ej. Run Club Marzo 2026"
                        value={title}
                        onChange={e => setTitle(e.target.value)}
                      />
                    </div>

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

                    <div className="ee-field-group">
                      <label className="ee-label">Fecha</label>
                      <DatePicker
                        value={eventDate}
                        onChange={e => setEventDate(e.target.value)}
                        placeholder="Selecciona la fecha del evento"
                        allowFuture
                      />
                    </div>

                    <div className="ee-field-group">
                      <label className="ee-label">Lugar</label>
                      <input
                        className="ee-input"
                        placeholder="Ej. Parque El Virrey, Bogotá"
                        value={eventLocation}
                        onChange={e => setEventLocation(e.target.value)}
                      />
                    </div>

                    <div className="ee-field-group">
                      <label className="ee-label">Cupos máximos</label>
                      <NumberStepper
                        value={maxRegistrations}
                        onChange={setMaxRegistrations}
                        placeholder="Ilimitado"
                        min={1}
                      />
                    </div>

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
              </div>
            )}
          </>
        )}


      {selectedReg && (
        <RowModal
          reg={selectedReg}
          columns={columns}
          onClose={() => setSelectedReg(null)}
          onCheckIn={() => handleManualCheckIn(selectedReg.id)}
          onDelete={() => handleDeleteRegistration(selectedReg.id)}
        />
      )}

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
    </DashboardLayout>
    </ErrorBoundary>
  );
}
