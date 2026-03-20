import React, { useState, useEffect, useRef } from 'react';
import Modal from './Modal';
import { listFiles, uploadFile } from '../services/creatorMediaService';
import logger from '../utils/logger';
import './MediaPickerModal.css';

const MAX_FILE_SIZE_MB = 50;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

/**
 * Modal to pick a media item from the creator's folder or upload a new one.
 * @param {boolean} isOpen
 * @param {() => void} onClose
 * @param {(item: { id: string, url: string, name: string, contentType: string }) => void} onSelect
 * @param {string} creatorId
 * @param {string} [accept] - e.g. 'image/*' or 'image/*,video/*'
 */
export default function MediaPickerModal({ isOpen, onClose, onSelect, creatorId, accept = 'image/*' }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (!isOpen || !creatorId) return;
    setError(null);
    setLoading(true);
    listFiles(creatorId)
      .then((files) => setItems(files))
      .catch((e) => {
        logger.error('Media list error:', e);
        setError(e.message || 'Error al cargar la carpeta');
      })
      .finally(() => setLoading(false));
  }, [isOpen, creatorId, accept]);

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !creatorId) return;
    e.target.value = '';
    setError(null);

    if (accept && accept !== '*') {
      const acceptedTypes = accept.split(',').map(t => t.trim());
      const fileTypeOk = acceptedTypes.some(t => {
        if (t.endsWith('/*')) return file.type.startsWith(t.replace('/*', '/'));
        return file.type === t;
      });
      if (!fileTypeOk) {
        setError(`Tipo de archivo no permitido. Se esperaba: ${accept}`);
        return;
      }
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setError(`El archivo es demasiado grande. Máximo ${MAX_FILE_SIZE_MB}MB.`);
      return;
    }
    setUploading(true);
    setUploadProgress(0);
    try {
      const newItem = await uploadFile(creatorId, file, (pct) => setUploadProgress(pct));
      setItems((prev) => [newItem, ...prev]);
      onSelect({ id: newItem.id, url: newItem.url, name: newItem.name, contentType: newItem.contentType });
      onClose();
    } catch (err) {
      logger.error('Upload error:', err);
      setError(err.message || 'Error al subir');
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const isVideoPicker = accept === 'video/*';

  const handleSelect = (item) => {
    if (isVideoPicker && item.contentType?.startsWith('image/')) return; // images not selectable in video picker
    onSelect({ id: item.id, url: item.url, name: item.name, contentType: item.contentType });
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={isVideoPicker ? 'Vídeo de tu carpeta' : 'Tu carpeta de medios'} extraWide>
      <div className="media-picker-modal">
        <input
          ref={fileInputRef}
          type="file"
          accept={accept}
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />

        {error && (
          <div className="media-picker-modal-error">
            {error}
          </div>
        )}

        {loading ? (
          <div className="media-picker-modal-loading">Cargando...</div>
        ) : (
          <div className="media-picker-modal-grid">
            <button
              type="button"
              className="media-picker-modal-card media-picker-modal-upload-card"
              onClick={handleUploadClick}
              disabled={uploading}
            >
              {uploading ? (
                <div className="media-picker-modal-upload-progress">
                  <div className="media-picker-modal-upload-progress-bar">
                    <div
                      className="media-picker-modal-upload-progress-fill"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                  <span>{Math.round(uploadProgress)}%</span>
                </div>
              ) : (
                <>
                  <span className="media-picker-modal-plus">+</span>
                  <span className="media-picker-modal-upload-label">Subir</span>
                </>
              )}
            </button>

            {items.map((item) => {
              const isImage = item.contentType?.startsWith('image/');
              const disabledInVideoMode = isVideoPicker && isImage;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`media-picker-modal-card media-picker-modal-item-card ${disabledInVideoMode ? 'media-picker-modal-item-card-disabled' : ''}`}
                  onClick={() => handleSelect(item)}
                  disabled={disabledInVideoMode}
                >
                  {isImage ? (
                    <img src={item.url} alt={item.name} className="media-picker-modal-thumb" />
                  ) : (
                    <div className="media-picker-modal-video-placeholder">
                      <span className="media-picker-modal-video-icon">▶</span>
                    </div>
                  )}
                  <span className="media-picker-modal-item-name" title={item.name}>
                    {item.name}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {!loading && items.length === 0 && !uploading && (
          <p className="media-picker-modal-empty">
            {isVideoPicker ? 'No hay vídeos en tu carpeta. Haz clic en + para subir un vídeo.' : 'No hay medios todavía. Haz clic en + para subir una imagen o video.'}
          </p>
        )}
      </div>
    </Modal>
  );
}
