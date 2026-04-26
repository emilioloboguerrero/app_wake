import { useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// ─── Constants ──────────────────────────────────────────────────────

export const FIELD_TYPES = [
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

export const TYPE_LABELS = Object.fromEntries(FIELD_TYPES.map(f => [f.type, f.label]));

export const DEFAULT_FIELD_IDS = ['f_nombre', 'f_email', 'f_telefono', 'f_edad', 'f_genero'];
export const UNDELETABLE_FIELD_IDS = ['f_nombre', 'f_email'];
export const DEFAULT_FIELDS = [
  { id: 'f_nombre',   type: 'text',   label: 'Nombre',   placeholder: 'Tu nombre completo', required: true,  locked: true },
  { id: 'f_email',    type: 'email',  label: 'Email',    placeholder: 'correo@ejemplo.com', required: true,  locked: true },
  { id: 'f_telefono', type: 'tel',    label: 'Teléfono', placeholder: '+57 300 000 0000',   required: false, locked: true },
  { id: 'f_edad',     type: 'number', label: 'Edad',     placeholder: '25',                 required: false, locked: true },
  { id: 'f_genero',   type: 'select', label: 'Género',   placeholder: '',                   required: false, locked: true, options: ['Masculino', 'Femenino', 'Prefiero no decir'] },
];

const TYPES_WITH_PLACEHOLDER = ['text', 'email', 'tel', 'number', 'textarea', 'date'];

// ─── Helpers ────────────────────────────────────────────────────────

export function relativeLuminance(r, g, b) {
  return [r, g, b]
    .map(v => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); })
    .reduce((acc, c, i) => acc + c * [0.2126, 0.7152, 0.0722][i], 0);
}

const _accentCache = new Map();

export function extractAccentFromImage(imageUrl, onAccent) {
  if (!imageUrl) return () => {};

  if (_accentCache.has(imageUrl)) {
    onAccent(_accentCache.get(imageUrl));
    return () => {};
  }

  let cancelled = false;
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    if (cancelled) return;
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
      const result = [bestR, bestG, bestB];
      _accentCache.set(imageUrl, result);
      onAccent(result);
    } catch {
      // Canvas tainted (CORS) or other read failure — caller should fall back.
      onAccent(null);
    }
  };
  img.onerror = () => {
    if (cancelled) return;
    onAccent(null);
  };
  img.src = imageUrl;
  return () => { cancelled = true; };
}

// ─── SortableField ──────────────────────────────────────────────────

export function SortableField({ field, onUpdate, onRemove }) {
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
  const showPlaceholder = TYPES_WITH_PLACEHOLDER.includes(field.type);

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
          {showPlaceholder && (
            <div className="ee-field-row">
              <label className="ee-field-sub-label">Placeholder</label>
              <input
                className="ee-field-input"
                placeholder="Texto de ayuda…"
                value={field.placeholder || ''}
                onChange={e => onUpdate({ placeholder: e.target.value })}
              />
            </div>
          )}
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
                    placeholder={`Opcion ${i + 1}`}
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
                    aria-label="Eliminar opcion"
                  >×</button>
                </div>
              ))}
              <button
                className="ee-add-option-btn"
                onClick={() => onUpdate({ options: [...(field.options || []), ''] })}
              >
                + Agregar opcion
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── LockedField ────────────────────────────────────────────────────

export function LockedField({ field, onUpdate, onRemove }) {
  const [expanded, setExpanded] = useState(false);
  const hasOptions = ['select', 'radio', 'multiselect'].includes(field.type);
  const showPlaceholder = TYPES_WITH_PLACEHOLDER.includes(field.type);
  const canDelete = !UNDELETABLE_FIELD_IDS.includes(field.id);

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
          {canDelete && (
            <button className="ee-field-remove-btn" onClick={onRemove} aria-label="Eliminar campo">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {expanded && (
        <div className="ee-field-card-body">
          {showPlaceholder && (
            <div className="ee-field-row">
              <label className="ee-field-sub-label">Placeholder</label>
              <input
                className="ee-field-input"
                placeholder="Texto de ayuda…"
                value={field.placeholder || ''}
                onChange={e => onUpdate({ placeholder: e.target.value })}
              />
            </div>
          )}
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
                    placeholder={`Opcion ${i + 1}`}
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

// ─── FieldTypePicker ────────────────────────────────────────────────

export function FieldTypePicker({ onPick, onClose }) {
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

// ─── NumberStepper ──────────────────────────────────────────────────

export function NumberStepper({ value, onChange, placeholder, min = 1 }) {
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
