import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import eventService from '../services/eventService';
import { queryKeys, cacheConfig } from '../config/queryClient';
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor,
  useSensor, useSensors
} from '@dnd-kit/core';
import {
  SortableContext, sortableKeyboardCoordinates,
  verticalListSortingStrategy, arrayMove
} from '@dnd-kit/sortable';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import apiClient from '../utils/apiClient';
import DashboardLayout from '../components/DashboardLayout';
import { GlowingEffect, SkeletonCard, InlineError } from '../components/ui';
import ErrorBoundary from '../components/ErrorBoundary';
import {
  FIELD_TYPES, DEFAULT_FIELD_IDS, DEFAULT_FIELDS,
  relativeLuminance, extractAccentFromImage,
  SortableField, LockedField, FieldTypePicker, NumberStepper,
} from '../components/events/eventFieldComponents';
import logger from '../utils/logger';
import DatePicker from '../components/DatePicker';
import './EventEditorScreen.css';

// ─── Helpers ──────────────────────────────────────────────────────
function formatDateForInput(ts) {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toISOString().split('T')[0];
}


// ─── Main Screen ───────────────────────────────────────────────────
export default function EventEditorScreen() {
  const { eventId } = useParams();
  const isEdit = Boolean(eventId);
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { showToast } = useToast();

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
  const [fieldErrors, setFieldErrors] = useState({});
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
    if (!user) return;
    if (eventData.creator_id !== user.uid) {
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
    return extractAccentFromImage(imagePreview, setAccentRgb);
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

  async function uploadImageForEvent(evId) {
    if (!imageFile) return imageUrl;
    const contentType = imageFile.type || 'image/jpeg';
    const { data } = await apiClient.post(`/creator/events/${evId}/image/upload-url`, { contentType });
    await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', data.uploadUrl);
      xhr.setRequestHeader('Content-Type', contentType);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) setUploadProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed: ${xhr.status}`)));
      xhr.onerror = () => reject(new Error('Network error during upload'));
      xhr.timeout = 120000;
      xhr.ontimeout = () => reject(new Error('Upload timed out'));
      xhr.send(imageFile);
    });
    const confirmRes = await apiClient.post(`/creator/events/${evId}/image/confirm`, { storagePath: data.storagePath });
    setImageFile(null);
    setUploadProgress(null);
    const url = confirmRes.data.imageUrl;
    setImageUrl(url);
    return url;
  }

  async function handleSave(targetStatus = status) {
    const errors = {};
    if (!title.trim()) errors.title = 'El titulo es obligatorio';
    if (!date) errors.date = 'La fecha es obligatoria';
    if (maxRegistrations && Number(maxRegistrations) <= 0) errors.capacity = 'Los cupos deben ser un numero positivo';
    if (Object.keys(errors).length > 0) { setFieldErrors(errors); return; }
    setFieldErrors({});
    setSaving(true);
    try {
      let evId = currentEventId;
      let isNewDoc = false;
      if (!evId) {
        evId = `event-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
        setCurrentEventId(evId);
        isNewDoc = true;
      }

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
        date: eventService.makeDateTimestamp(date),
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
        image_url: imageUrl,
      };

      if (isNewDoc) {
        eventData.creator_id = user.uid;
        eventData.registration_count = 0;
        await eventService.createEvent(evId, eventData);
        navigate(`/events/${evId}/edit`, { replace: true });
      }

      const finalImageUrl = await uploadImageForEvent(evId);

      if (!isNewDoc) {
        await eventService.updateEvent(evId, { ...eventData, image_url: finalImageUrl });
      } else if (finalImageUrl !== imageUrl) {
        await eventService.updateEvent(evId, { image_url: finalImageUrl });
      }

      queryClient.invalidateQueries({ queryKey: queryKeys.events.byCreator(user.uid) });
      setStatus(targetStatus);
    } catch (err) {
      logger.error('[EventEditor] save failed', err);
      showToast('No pudimos guardar el evento. Intenta de nuevo.', 'error');
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
        <SkeletonCard style={{ height: '80vh' }} />
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

        {/* Two-panel layout */}
        <div className="ee-panels">
          {/* ── Left: Metadata ── */}
          <div className="ee-panel ee-panel--meta" style={{ position: 'relative' }}>
            <GlowingEffect />
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
                onChange={e => { setTitle(e.target.value); setFieldErrors(prev => ({ ...prev, title: undefined })); }}
                aria-describedby={fieldErrors.title ? 'title-error' : undefined}
              />
              <InlineError message={fieldErrors.title} field="title" />
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
              <label className="ee-label">Fecha <span className="ee-required">*</span></label>
              <DatePicker
                value={date}
                onChange={e => { setDate(e.target.value); setFieldErrors(prev => ({ ...prev, date: undefined })); }}
                placeholder="Selecciona la fecha del evento"
                allowFuture
              />
              <InlineError message={fieldErrors.date} field="date" />
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
                onChange={(v) => { setMaxRegistrations(v); setFieldErrors(prev => ({ ...prev, capacity: undefined })); }}
                placeholder="Ilimitado"
                min={1}
              />
              <InlineError message={fieldErrors.capacity} field="capacity" />
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

            {/* Acceso section hidden for now */}
          </div>

          {/* ── Right: Field Builder ── */}
          <div className="ee-panel ee-panel--builder" style={{ position: 'relative' }}>
            <GlowingEffect />
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
                  onRemove={() => removeField(field.id)}
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
