import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import DashboardLayout from '../components/DashboardLayout';
import MediaPickerModal from '../components/MediaPickerModal';
import Button from '../components/Button';
import Input from '../components/Input';
import libraryService from '../services/libraryService';
import logger from '../utils/logger';
import { useToast } from '../contexts/ToastContext';
import './ProgramDetailScreen.css';
import './SharedScreenLayout.css';
import './CreateLibrarySessionScreen.css';

const CreateLibrarySessionScreen = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const backPath = location.state?.returnTo || '/content';
  const backState = location.state?.returnState ?? {};
  const [sessionName, setSessionName] = useState('');
  const [sessionImageFile, setSessionImageFile] = useState(null);
  const [sessionImagePreview, setSessionImagePreview] = useState(null);
  const [sessionImageUrlFromLibrary, setSessionImageUrlFromLibrary] = useState(null);
  const [sessionImageUploadProgress, setSessionImageUploadProgress] = useState(0);
  const [isMediaPickerOpen, setIsMediaPickerOpen] = useState(false);

  const handleSessionImageDelete = () => {
    setSessionImageFile(null);
    setSessionImagePreview(null);
    setSessionImageUrlFromLibrary(null);
    setSessionImageUploadProgress(0);
  };

  const handleMediaPickerSelect = (item) => {
    setSessionImagePreview(item.url);
    setSessionImageFile(null);
    setSessionImageUrlFromLibrary(item.url);
    setIsMediaPickerOpen(false);
  };

  const createSessionMutation = useMutation({
    mutationFn: async () => {
      let imageUrl = sessionImageUrlFromLibrary || null;
      const librarySession = await libraryService.createLibrarySession(user.uid, {
        title: sessionName.trim(),
        image_url: imageUrl,
      });
      if (!imageUrl && sessionImageFile) {
        try {
          imageUrl = await libraryService.uploadLibrarySessionImage(
            user.uid,
            librarySession.id,
            sessionImageFile,
            (progress) => setSessionImageUploadProgress(Math.round(progress))
          );
          await libraryService.updateLibrarySession(user.uid, librarySession.id, {
            image_url: imageUrl,
          });
        } catch (uploadErr) {
          logger.error('Error uploading session image:', uploadErr);
          showToast(`Error al subir la imagen: ${uploadErr.message || 'Por favor, intenta de nuevo.'}`, 'error');
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['library', 'sessions', user.uid] });
      navigate(backPath, { state: backState });
    },
    onError: (err) => {
      showToast(`Error al crear la sesión: ${err.message || 'Por favor, intenta de nuevo.'}`, 'error');
    },
  });

  const handleCreateSession = () => {
    if (!sessionName.trim() || !user) return;
    createSessionMutation.mutate();
  };

  const handleCancel = () => {
    navigate(backPath, { state: backState });
  };

  return (
    <DashboardLayout
      screenName="Nueva Sesión"
      showBackButton={true}
      backPath={backPath}
      backState={backState}
    >
      <div className="create-session-root">
        <div className="create-session-content">
          <div className="create-session-header">
            <h1 className="create-session-title">
              Nueva Sesión de Biblioteca
            </h1>
            <button
              onClick={handleCancel}
              className="create-session-btn-cancel"
            >
              Cancelar
            </button>
          </div>

          <div className="edit-program-modal-content">
            <div className="edit-program-modal-body">
              {/* Left Side - Inputs */}
              <div className="edit-program-modal-left">
                <div className="edit-program-input-group">
                  <label className="edit-program-input-label">Nombre de la Sesión</label>
                  <Input
                    placeholder="Nombre de la sesión"
                    value={sessionName}
                    onChange={(e) => setSessionName(e.target.value)}
                    type="text"
                    light={true}
                  />
                </div>
              </div>

              {/* Right Side - Image */}
              <div className="edit-program-modal-right">
                <div className="edit-program-image-section" style={{ flex: '0 1 auto', minHeight: '300px', maxHeight: '400px' }}>
                  {sessionImagePreview ? (
                    <div className="edit-program-image-container">
                      <img
                        src={sessionImagePreview}
                        alt="Sesión"
                        className="edit-program-image"
                      />
                      <div className="edit-program-image-overlay">
                        <div className="edit-program-image-actions">
                          <button type="button" className="edit-program-image-action-pill" onClick={() => setIsMediaPickerOpen(true)}>
                            <span className="edit-program-image-action-text">Cambiar</span>
                          </button>
                          <button
                            className="edit-program-image-action-pill edit-program-image-delete-pill"
                            onClick={handleSessionImageDelete}
                            disabled={createSessionMutation.isPending}
                          >
                            <span className="edit-program-image-action-text">Eliminar</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="edit-program-no-image">
                      <p>No hay imagen disponible</p>
                      <button type="button" className="edit-program-image-upload-button" onClick={() => setIsMediaPickerOpen(true)}>
                        Subir Imagen
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <MediaPickerModal
              isOpen={isMediaPickerOpen}
              onClose={() => setIsMediaPickerOpen(false)}
              onSelect={handleMediaPickerSelect}
              creatorId={user?.uid}
              accept="image/*"
            />

            <div className="create-session-cta-bar">
              <button
                onClick={handleCancel}
                className="create-session-btn-cancel"
              >
                Cancelar
              </button>
              <Button
                title={createSessionMutation.isPending ? 'Creando...' : 'Crear'}
                onClick={handleCreateSession}
                disabled={!sessionName.trim() || createSessionMutation.isPending}
                loading={createSessionMutation.isPending}
              />
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default CreateLibrarySessionScreen;

