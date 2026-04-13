import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { listFiles, deleteFile } from '../services/creatorMediaService';
import { useMediaUpload } from '../contexts/MediaUploadContext';
import { formatFileSize } from '../utils/mediaCompressor';
import { isValidExternalVideoUrl, detectVideoSource } from '../utils/videoUtils';
import ShimmerSkeleton from './ui/ShimmerSkeleton';
import logger from '../utils/logger';
import './MediaPickerModal.css';

const ACCEPTED = {
  'image/*': (f) => f.contentType?.startsWith('image/'),
  'video/*': (f) => f.contentType?.startsWith('video/'),
  'image/*,video/*': () => true,
  '*': () => true,
};

export default function MediaPickerModal({ isOpen, onClose, onSelect, accept = 'image/*', multiple = false }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [search, setSearch] = useState('');
  const [deletingId, setDeletingId] = useState(null);
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [linkValue, setLinkValue] = useState('');
  const [linkError, setLinkError] = useState('');
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const fileInputRef = useRef(null);
  const dropZoneRef = useRef(null);
  const backdropRef = useRef(null);
  const linkInputRef = useRef(null);

  const { enqueue, items: queueItems, activeItems, STATUS } = useMediaUpload();

  const isVideoPicker = accept === 'video/*';
  const isImagePicker = accept === 'image/*';

  // Load files
  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setLoading(true);
    setSearch('');
    setShowLinkInput(false);
    setLinkValue('');
    setLinkError('');
    setSelectedIds(new Set());
    listFiles()
      .then((files) => setItems(files))
      .catch((e) => {
        logger.error('Media list error:', e);
        setError(e.message || 'Error al cargar tu carpeta');
      })
      .finally(() => setLoading(false));
  }, [isOpen]);

  // Merge completed queue items into the list
  useEffect(() => {
    const done = queueItems.filter((q) => q.status === STATUS.DONE && q.result);
    if (!done.length) return;
    setItems((prev) => {
      const existingIds = new Set(prev.map((p) => p.id));
      const newOnes = done
        .map((d) => d.result)
        .filter((r) => !existingIds.has(r.id));
      return [...newOnes, ...prev];
    });
  }, [queueItems, STATUS.DONE]);

  // Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  // Focus link input when shown
  useEffect(() => {
    if (showLinkInput) {
      setTimeout(() => linkInputRef.current?.focus(), 50);
    }
  }, [showLinkInput]);

  // Filter by search only
  const acceptFn = ACCEPTED[accept] || ACCEPTED['*'];
  const filteredItems = useMemo(() => {
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter((item) => item.name?.toLowerCase().includes(q));
  }, [items, search]);

  // Stable ref for onSelect so enqueue callback doesn't go stale
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  const handleFiles = useCallback((fileList) => {
    if (!fileList?.length) return;

    const files = Array.from(fileList);
    enqueue(files, (completedItem) => {
      // Auto-assign to the slot that triggered the upload
      if (onSelectRef.current) {
        onSelectRef.current({
          id: completedItem.id,
          url: completedItem.url,
          name: completedItem.name,
          contentType: completedItem.contentType,
        });
      }
    });
    // Close modal immediately — upload continues in background
    onClose();
  }, [enqueue, onClose]);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    if (dropZoneRef.current && !dropZoneRef.current.contains(e.relatedTarget)) {
      setDragOver(false);
    }
  }, []);

  const handleFileInput = useCallback((e) => {
    handleFiles(e.target.files);
    e.target.value = '';
  }, [handleFiles]);

  const handleSelect = useCallback((item) => {
    if (isVideoPicker && !item.contentType?.startsWith('video/')) return;
    if (isImagePicker && !item.contentType?.startsWith('image/')) return;
    if (multiple) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(item.id)) next.delete(item.id);
        else next.add(item.id);
        return next;
      });
      return;
    }
    onSelect({ id: item.id, url: item.url, name: item.name, contentType: item.contentType });
    onClose();
  }, [isVideoPicker, isImagePicker, multiple, onSelect, onClose]);

  const handleConfirmMultiple = useCallback(() => {
    if (!selectedIds.size) return;
    const selected = items.filter((it) => selectedIds.has(it.id));
    selected.forEach((item) => {
      onSelect({ id: item.id, url: item.url, name: item.name, contentType: item.contentType });
    });
    onClose();
  }, [selectedIds, items, onSelect, onClose]);

  const handleLinkSubmit = useCallback(() => {
    const trimmed = linkValue.trim();
    if (!isValidExternalVideoUrl(trimmed)) {
      setLinkError('Ingresa un enlace valido de YouTube o Vimeo');
      return;
    }
    setLinkError('');
    const source = detectVideoSource(trimmed);
    onSelect({
      id: null,
      url: trimmed,
      name: source === 'youtube' ? 'YouTube video' : 'Vimeo video',
      contentType: 'video/external',
      videoSource: source,
    });
    onClose();
  }, [linkValue, onSelect, onClose]);

  const handleDelete = useCallback(async (e, item) => {
    e.stopPropagation();
    if (deletingId) return;
    setDeletingId(item.id);
    try {
      await deleteFile(null, item.id);
      setItems((prev) => prev.filter((p) => p.id !== item.id));
    } catch (err) {
      logger.error('Delete error:', err);
    } finally {
      setDeletingId(null);
    }
  }, [deletingId]);

  const handleBackdropClick = useCallback((e) => {
    if (e.target === backdropRef.current) onClose();
  }, [onClose]);

  if (!isOpen) return null;

  return (
    <div className="mp-backdrop" ref={backdropRef} onClick={handleBackdropClick}>
      <div className="mp-container" role="dialog" aria-modal="true" aria-label="Carpeta de medios">
        {/* Header */}
        <div className="mp-header">
          <div className="mp-header-left">
            <h2 className="mp-title">
              {isVideoPicker ? 'Tus videos' : 'Tu carpeta de medios'}
            </h2>
            {items.length > 0 && (
              <span className="mp-count">{filteredItems.length} archivo{filteredItems.length !== 1 ? 's' : ''}</span>
            )}
          </div>
          <button className="mp-close" onClick={onClose} aria-label="Cerrar">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M4.5 4.5l9 9M13.5 4.5l-9 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* Toolbar */}
        <div className="mp-toolbar">
          <div className="mp-search-wrap">
            <svg className="mp-search-icon" width="15" height="15" viewBox="0 0 15 15" fill="none">
              <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.3"/>
              <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
            </svg>
            <input
              className="mp-search"
              type="text"
              placeholder="Buscar archivos..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button
            className="mp-upload-btn"
            onClick={() => fileInputRef.current?.click()}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
            </svg>
            <span>Subir</span>
          </button>
          {isVideoPicker && (
            <button
              className={`mp-link-btn ${showLinkInput ? 'mp-link-btn--active' : ''}`}
              onClick={() => { setShowLinkInput(!showLinkInput); setLinkError(''); }}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M6.5 9.5a3.5 3.5 0 005 0l2-2a3.5 3.5 0 00-5-5l-1 1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M9.5 6.5a3.5 3.5 0 00-5 0l-2 2a3.5 3.5 0 005 5l1-1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span>Pegar enlace</span>
            </button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept={accept}
            multiple
            onChange={handleFileInput}
            style={{ display: 'none' }}
          />
        </div>

        {/* Link input row */}
        {showLinkInput && (
          <div className="mp-link-row">
            <input
              ref={linkInputRef}
              type="url"
              className="mp-link-input"
              placeholder="https://youtube.com/watch?v=... o https://vimeo.com/..."
              value={linkValue}
              onChange={(e) => { setLinkValue(e.target.value); setLinkError(''); }}
              onKeyDown={(e) => e.key === 'Enter' && handleLinkSubmit()}
            />
            <button
              className="mp-link-submit"
              onClick={handleLinkSubmit}
              disabled={!linkValue.trim()}
            >
              Usar enlace
            </button>
            {linkError && <p className="mp-link-error">{linkError}</p>}
          </div>
        )}

        {/* Content area */}
        <div
          ref={dropZoneRef}
          className={`mp-content ${dragOver ? 'mp-content--drag-over' : ''}`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
        >
          {/* Drag overlay */}
          {dragOver && (
            <div className="mp-drag-overlay">
              <div className="mp-drag-overlay-content">
                <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                  <rect x="8" y="14" width="32" height="24" rx="4" stroke="currentColor" strokeWidth="2" strokeDasharray="4 3"/>
                  <path d="M24 22v8M20 26l4-4 4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span>Suelta aqui tus archivos</span>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="mp-error">
              <span>{error}</span>
              <button onClick={() => { setError(null); setLoading(true); listFiles().then(setItems).catch(() => {}).finally(() => setLoading(false)); }}>
                Reintentar
              </button>
            </div>
          )}

          {/* Loading skeletons */}
          {loading && (
            <div className="mp-grid">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="mp-card mp-card--skeleton" style={{ animationDelay: `${i * 60}ms` }}>
                  <ShimmerSkeleton width="100%" height="100%" borderRadius="0" />
                </div>
              ))}
            </div>
          )}

          {/* Empty state */}
          {!loading && !error && filteredItems.length === 0 && (
            <div className="mp-empty">
              <div className="mp-empty-icon">
                <svg width="56" height="56" viewBox="0 0 56 56" fill="none">
                  <rect x="8" y="14" width="40" height="28" rx="6" stroke="currentColor" strokeWidth="1.5"/>
                  <circle cx="20" cy="26" r="4" stroke="currentColor" strokeWidth="1.5"/>
                  <path d="M8 36l12-8 8 6 10-10 10 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <p className="mp-empty-title">Tu carpeta esta vacia</p>
              <p className="mp-empty-sub">
                Arrastra archivos aqui o haz clic en <strong>Subir</strong> para comenzar
              </p>
              <button className="mp-empty-cta" onClick={() => fileInputRef.current?.click()}>
                Subir tu primer archivo
              </button>
            </div>
          )}

          {/* Grid */}
          {!loading && !error && filteredItems.length > 0 && (
            <div className="mp-grid">
              {filteredItems.map((item, index) => {
                const isImg = item.contentType?.startsWith('image/');
                const disabled = !acceptFn(item);
                const isSelected = multiple && selectedIds.has(item.id);
                return (
                  <div
                    key={item.id}
                    role="button"
                    tabIndex={disabled ? -1 : 0}
                    aria-pressed={multiple ? isSelected : undefined}
                    className={`mp-card ${disabled ? 'mp-card--disabled' : ''} ${isSelected ? 'mp-card--selected' : ''}`}
                    onClick={() => !disabled && handleSelect(item)}
                    onKeyDown={(e) => { if (!disabled && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); handleSelect(item); } }}
                    style={{ animationDelay: `${Math.min(index, 15) * 40}ms` }}
                  >
                    <div className="mp-card-media">
                      {isImg ? (
                        <img src={item.url} alt={item.name} loading="lazy" />
                      ) : (
                        <div className="mp-card-video">
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                            <path d="M8 5.14v13.72a1 1 0 001.5.86l11.35-6.86a1 1 0 000-1.72L9.5 4.28A1 1 0 008 5.14z" fill="currentColor"/>
                          </svg>
                        </div>
                      )}
                      {multiple && (
                        <div className={`mp-card-check ${isSelected ? 'mp-card-check--on' : ''}`} aria-hidden="true">
                          {isSelected && (
                            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                              <path d="M2.5 7.5l3 3 6-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          )}
                        </div>
                      )}
                      <div className="mp-card-overlay">
                        <button
                          className="mp-card-delete"
                          onClick={(e) => handleDelete(e, item)}
                          disabled={deletingId === item.id}
                          aria-label="Eliminar"
                        >
                          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                            <path d="M3 3.5h8M5.5 3.5V2.5a1 1 0 011-1h1a1 1 0 011 1v1M4 5v5.5a1 1 0 001 1h4a1 1 0 001-1V5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </button>
                      </div>
                    </div>
                    <div className="mp-card-footer">
                      <span className="mp-card-name" title={item.name}>{item.name}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        {multiple ? (
          <div className="mp-footer mp-footer--actions">
            <span className="mp-footer-count">
              {selectedIds.size === 0
                ? 'Selecciona una o mas imagenes'
                : `${selectedIds.size} seleccionada${selectedIds.size === 1 ? '' : 's'}`}
            </span>
            <div className="mp-footer-actions">
              {selectedIds.size > 0 && (
                <button
                  className="mp-footer-clear"
                  onClick={() => setSelectedIds(new Set())}
                >
                  Limpiar
                </button>
              )}
              <button
                className="mp-footer-confirm"
                onClick={handleConfirmMultiple}
                disabled={selectedIds.size === 0}
              >
                Agregar{selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}
              </button>
            </div>
          </div>
        ) : (
          items.length > 0 && (
            <div className="mp-footer">
              <span className="mp-footer-hint">
                Arrastra archivos o usa <kbd>Subir</kbd> para agregar nuevos
              </span>
            </div>
          )
        )}
      </div>
    </div>
  );
}
