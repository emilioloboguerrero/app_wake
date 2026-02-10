import React, { useState, useEffect, useRef } from 'react';
import Modal from './Modal';
import { listFiles, uploadFile } from '../services/creatorMediaService';
import './MediaPickerModal.css';

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
      .then(setItems)
      .catch((e) => {
        console.error('Media list error:', e);
        setError(e.message || 'Error al cargar la carpeta');
      })
      .finally(() => setLoading(false));
  }, [isOpen, creatorId]);

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !creatorId) return;
    e.target.value = '';
    setError(null);
    setUploading(true);
    setUploadProgress(0);
    try {
      const newItem = await uploadFile(creatorId, file, (pct) => setUploadProgress(pct));
      setItems((prev) => [newItem, ...prev]);
      onSelect({ id: newItem.id, url: newItem.url, name: newItem.name, contentType: newItem.contentType });
      onClose();
    } catch (err) {
      console.error('Upload error:', err);
      setError(err.message || 'Error al subir');
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const handleSelect = (item) => {
    onSelect({ id: item.id, url: item.url, name: item.name, contentType: item.contentType });
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Tu carpeta de medios" extraWide>
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

            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                className="media-picker-modal-card media-picker-modal-item-card"
                onClick={() => handleSelect(item)}
              >
                {item.contentType?.startsWith('image/') ? (
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
            ))}
          </div>
        )}

        {!loading && items.length === 0 && !uploading && (
          <p className="media-picker-modal-empty">
            No hay medios todavía. Haz clic en + para subir una imagen o video.
          </p>
        )}
      </div>
    </Modal>
  );
}
