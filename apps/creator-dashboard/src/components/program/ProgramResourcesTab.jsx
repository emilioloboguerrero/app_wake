import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { GlowingEffect } from '../ui';
import { useMediaUpload } from '../../contexts/MediaUploadContext';
import { useToast } from '../../contexts/ToastContext';
import { FileText, Youtube, Link2, Plus, Trash2 } from 'lucide-react';
import './ProgramResourcesTab.css';

const TYPE_OPTIONS = [
  { id: 'pdf', label: 'PDF', icon: FileText },
  { id: 'youtube', label: 'YouTube', icon: Youtube },
  { id: 'link', label: 'Link', icon: Link2 },
];

const TYPE_LABEL = { pdf: 'PDF', youtube: 'YouTube', link: 'Link' };

function isValidUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function normalizeOrder(list) {
  return list.map((r, i) => ({ ...r, order: i }));
}

export default function ProgramResourcesTab({ programId, initialResources = [], onSaved }) {
  const { enqueue } = useMediaUpload();
  const { showToast } = useToast();
  const fileInputRef = useRef(null);

  const sortedInitial = useMemo(
    () => [...(initialResources || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [initialResources],
  );

  const [resources, setResources] = useState(sortedInitial);
  const [draftType, setDraftType] = useState('pdf');
  const [draftTitle, setDraftTitle] = useState('');
  const [draftUrl, setDraftUrl] = useState('');
  const [pdfUpload, setPdfUpload] = useState(null); // { url, storagePath } once uploaded
  const [isUploading, setIsUploading] = useState(false);
  const [formError, setFormError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Re-sync local state if the program reloads from the server (e.g. after save
  // invalidates the detail query and a fresh array comes back).
  useEffect(() => {
    setResources(sortedInitial);
  }, [sortedInitial]);

  const isDirty = useMemo(() => {
    if (resources.length !== sortedInitial.length) return true;
    return resources.some((r, i) => {
      const o = sortedInitial[i];
      return !o || o.id !== r.id || o.title !== r.title || o.url !== r.url || o.type !== r.type;
    });
  }, [resources, sortedInitial]);

  const resetDraft = useCallback(() => {
    setDraftTitle('');
    setDraftUrl('');
    setPdfUpload(null);
    setFormError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const handleTypeChange = useCallback((typeId) => {
    setDraftType(typeId);
    resetDraft();
  }, [resetDraft]);

  const handlePdfSelect = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFormError('');
    if (file.type !== 'application/pdf') {
      setFormError('Solo se permiten archivos PDF.');
      e.target.value = '';
      return;
    }
    if (!draftTitle.trim()) {
      // Pre-fill the title from the filename if the creator hasn't typed one.
      setDraftTitle(file.name.replace(/\.pdf$/i, ''));
    }
    setIsUploading(true);
    setPdfUpload(null);
    enqueue([file], (result) => {
      setIsUploading(false);
      if (result?.url) {
        setPdfUpload({ url: result.url, storagePath: result.storagePath });
      } else {
        setFormError('No pudimos subir el PDF. Intenta de nuevo.');
      }
    });
  }, [draftTitle, enqueue]);

  const handleAdd = useCallback(() => {
    setFormError('');
    const title = draftTitle.trim();
    if (!title) {
      setFormError('Ponle un nombre al recurso.');
      return;
    }

    let url;
    let storage_path;
    if (draftType === 'pdf') {
      if (isUploading) {
        setFormError('Espera a que termine de subir el PDF.');
        return;
      }
      if (!pdfUpload?.url) {
        setFormError('Sube un archivo PDF primero.');
        return;
      }
      url = pdfUpload.url;
      storage_path = pdfUpload.storagePath;
    } else {
      const candidate = draftUrl.trim();
      if (!candidate) {
        setFormError(draftType === 'youtube' ? 'Pega el enlace del video.' : 'Pega el enlace.');
        return;
      }
      if (!isValidUrl(candidate)) {
        setFormError('El enlace no es válido. Debe empezar con http o https.');
        return;
      }
      url = candidate;
    }

    const newResource = {
      id: crypto.randomUUID(),
      type: draftType,
      title,
      url,
      order: resources.length,
    };
    if (storage_path) newResource.storage_path = storage_path;

    setResources((prev) => normalizeOrder([...prev, newResource]));
    resetDraft();
  }, [draftType, draftTitle, draftUrl, pdfUpload, isUploading, resources.length, resetDraft]);

  const handleDelete = useCallback((id) => {
    setResources((prev) => normalizeOrder(prev.filter((r) => r.id !== id)));
  }, []);

  const handleSave = useCallback(async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      const payload = normalizeOrder(resources);
      await onSaved?.({ additional_resources: payload });
      showToast('Recursos guardados.', 'success');
    } catch (err) {
      console.error('Failed to save additional resources', err);
      showToast('No pudimos guardar los recursos. Revisa tu conexión.', 'error');
    } finally {
      setIsSaving(false);
    }
  }, [isSaving, resources, onSaved, showToast]);

  return (
    <div className="prt-root">
      <div className="prt-card">
        <GlowingEffect spread={40} proximity={120} borderWidth={1} />
        <div className="prt-card-inner">
          <div className="prt-header">
            <div>
              <h3 className="prt-section-title">Recursos adicionales</h3>
              <p className="prt-section-sub">PDFs, videos de YouTube y enlaces para tus clientes.</p>
            </div>
            <button
              className="prt-save-btn"
              onClick={handleSave}
              disabled={!isDirty || isSaving}
            >
              {isSaving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>

          {/* Current resources */}
          {resources.length > 0 ? (
            <div className="prt-list">
              {resources.map((r) => {
                const Icon = (TYPE_OPTIONS.find((t) => t.id === r.type) || TYPE_OPTIONS[2]).icon;
                return (
                  <div key={r.id} className="prt-item">
                    <span className="prt-item-icon"><Icon size={15} /></span>
                    <div className="prt-item-info">
                      <span className="prt-item-title">{r.title}</span>
                      <span className="prt-item-type">{TYPE_LABEL[r.type] || 'Link'}</span>
                    </div>
                    <button
                      className="prt-item-delete"
                      onClick={() => handleDelete(r.id)}
                      aria-label={`Eliminar ${r.title}`}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="prt-empty">Aún no hay recursos. Agrega el primero abajo.</p>
          )}

          {/* Add resource */}
          <div className="prt-add">
            <span className="prt-add-label">Agregar recurso</span>

            <div className="prt-type-seg" role="radiogroup" aria-label="Tipo de recurso">
              {TYPE_OPTIONS.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={draftType === id}
                  className={`prt-type-seg-option ${draftType === id ? 'prt-type-seg-option--active' : ''}`}
                  onClick={() => handleTypeChange(id)}
                >
                  <Icon size={13} />
                  {label}
                </button>
              ))}
            </div>

            <input
              type="text"
              className="prt-input"
              placeholder="Nombre del recurso"
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
            />

            {draftType === 'pdf' ? (
              <div className="prt-pdf-row">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf"
                  className="prt-file-input"
                  id="prt-pdf-input"
                  onChange={handlePdfSelect}
                />
                <label htmlFor="prt-pdf-input" className="prt-file-label">
                  {isUploading
                    ? 'Subiendo PDF...'
                    : pdfUpload?.url
                      ? 'PDF listo. Cambiar archivo'
                      : 'Elegir archivo PDF'}
                </label>
                {pdfUpload?.url && !isUploading && <span className="prt-pdf-ready">Listo</span>}
              </div>
            ) : (
              <input
                type="url"
                className="prt-input"
                placeholder={draftType === 'youtube' ? 'https://youtube.com/watch?v=...' : 'https://...'}
                value={draftUrl}
                onChange={(e) => setDraftUrl(e.target.value)}
              />
            )}

            {formError && <p className="prt-form-error">{formError}</p>}

            <button
              type="button"
              className="prt-add-btn"
              onClick={handleAdd}
              disabled={isUploading}
            >
              <Plus size={14} />
              Agregar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
