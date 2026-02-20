import React, { useState } from 'react';
import Modal from './Modal';
import Button from './Button';
import { submitCreatorFeedback } from '../services/creatorFeedbackService';
import './FeedbackModal.css';

const TYPE_BUG = 'bug';
const TYPE_SUGGESTION = 'suggestion';

const FeedbackModal = ({ isOpen, onClose, creatorId, creatorEmail = null, creatorDisplayName = null }) => {
  const [type, setType] = useState(null);
  const [text, setText] = useState('');
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [imageProgress, setImageProgress] = useState(null);

  const resetForm = () => {
    setType(null);
    setText('');
    setImageFile(null);
    setImagePreview(null);
    setError(null);
    setSuccess(false);
    setImageProgress(null);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleImageChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Solo se permiten imágenes.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('La imagen no puede superar 5MB.');
      return;
    }
    setError(null);
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = () => setImagePreview(reader.result);
    reader.readAsDataURL(file);
  };

  const removeImage = () => {
    setImageFile(null);
    setImagePreview(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    if (!type) {
      setError('Elige si es un bug o una sugerencia.');
      return;
    }
    if (!text.trim()) {
      setError('Escribe tu mensaje.');
      return;
    }
    if (!creatorId) {
      setError('No se pudo identificar tu sesión.');
      return;
    }
    setLoading(true);
    try {
      await submitCreatorFeedback({
        creatorId,
        type,
        text: text.trim(),
        imageFile: imageFile || null,
        creatorEmail: creatorEmail || null,
        creatorDisplayName: creatorDisplayName || null,
        onImageProgress: setImageProgress,
      });
      setSuccess(true);
    } catch (err) {
      setError(err.message || 'Error al enviar. Intenta de nuevo.');
    } finally {
      setLoading(false);
      setImageProgress(null);
    }
  };

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Enviar feedback" wide>
      <div className="feedback-modal-content">
        {success ? (
          <div className="feedback-success">
            <p className="feedback-success-message">
              Gracias. Tu feedback fue enviado correctamente. Lo revisaremos pronto.
            </p>
            <Button title="Cerrar" onClick={handleClose} variant="primary" />
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="feedback-form">
            <div className="feedback-type-row">
              <span className="feedback-label">Tipo</span>
              <div className="feedback-type-options">
                <button
                  type="button"
                  className={`feedback-type-btn ${type === TYPE_BUG ? 'feedback-type-btn-active' : ''}`}
                  onClick={() => setType(TYPE_BUG)}
                >
                  Reportar un bug
                </button>
                <button
                  type="button"
                  className={`feedback-type-btn ${type === TYPE_SUGGESTION ? 'feedback-type-btn-active' : ''}`}
                  onClick={() => setType(TYPE_SUGGESTION)}
                >
                  Hacer una sugerencia
                </button>
              </div>
            </div>

            <div className="feedback-field">
              <label className="feedback-label" htmlFor="feedback-text">
                Mensaje *
              </label>
              <textarea
                id="feedback-text"
                className="feedback-textarea"
                placeholder="Describe el bug o tu sugerencia..."
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={4}
                disabled={loading}
              />
            </div>

            <div className="feedback-field">
              <label className="feedback-label">Imagen (opcional)</label>
              <input
                type="file"
                accept="image/*"
                onChange={handleImageChange}
                className="feedback-file-input"
                disabled={loading}
              />
              {imagePreview && (
                <div className="feedback-image-preview">
                  <img src={imagePreview} alt="Vista previa" />
                  <button type="button" className="feedback-remove-image" onClick={removeImage} disabled={loading}>
                    Quitar imagen
                  </button>
                </div>
              )}
              {imageProgress != null && (
                <div className="feedback-image-progress">
                  Subiendo imagen… {Math.round(imageProgress)}%
                </div>
              )}
            </div>

            {error && <p className="feedback-error">{error}</p>}

            <div className="feedback-actions">
              <Button type="button" title="Cancelar" onClick={handleClose} variant="secondary" disabled={loading} />
              <Button type="submit" title={loading ? 'Enviando…' : 'Enviar'} loading={loading} disabled={loading} />
            </div>
          </form>
        )}
      </div>
    </Modal>
  );
};

export default FeedbackModal;
