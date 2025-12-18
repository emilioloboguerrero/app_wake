import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import DashboardLayout from '../components/DashboardLayout';
import Button from '../components/Button';
import Input from '../components/Input';
import libraryService from '../services/libraryService';
import './ProgramDetailScreen.css';

const CreateLibrarySessionScreen = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [sessionName, setSessionName] = useState('');
  const [sessionImageFile, setSessionImageFile] = useState(null);
  const [sessionImagePreview, setSessionImagePreview] = useState(null);
  const [isUploadingSessionImage, setIsUploadingSessionImage] = useState(false);
  const [sessionImageUploadProgress, setSessionImageUploadProgress] = useState(0);
  const [isCreatingSession, setIsCreatingSession] = useState(false);

  const handleSessionImageUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) {
      return;
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert('Por favor, selecciona un archivo de imagen válido');
      return;
    }

    // Validate file size (e.g., max 10MB)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      alert('El archivo es demasiado grande. El tamaño máximo es 10MB');
      return;
    }

    setSessionImageFile(file);
    
    // Create preview URL
    const reader = new FileReader();
    reader.onloadend = () => {
      setSessionImagePreview(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleSessionImageDelete = () => {
    setSessionImageFile(null);
    setSessionImagePreview(null);
    setSessionImageUploadProgress(0);
  };

  const handleCreateSession = async () => {
    if (!sessionName.trim() || !user) {
      return;
    }

    try {
      setIsCreatingSession(true);
      
      // Create library session first
      const librarySession = await libraryService.createLibrarySession(user.uid, {
        title: sessionName.trim(),
        image_url: null
      });
      
      let imageUrl = null;
      
      // Upload image if provided
      if (sessionImageFile) {
        try {
          setIsUploadingSessionImage(true);
          setSessionImageUploadProgress(0);
          
          // Upload image for the library session
          imageUrl = await libraryService.uploadLibrarySessionImage(
            user.uid,
            librarySession.id,
            sessionImageFile,
            (progress) => {
              setSessionImageUploadProgress(Math.round(progress));
            }
          );
          
          setSessionImageUploadProgress(100);
        } catch (uploadErr) {
          console.error('Error uploading session image:', uploadErr);
          alert(`Error al subir la imagen: ${uploadErr.message || 'Por favor, intenta de nuevo.'}`);
          // Continue even if image upload fails
        } finally {
          setIsUploadingSessionImage(false);
        }
      }
      
      // Navigate back to content hub
      navigate('/content');
    } catch (err) {
      console.error('Error creating library session:', err);
      alert(`Error al crear la sesión: ${err.message || 'Por favor, intenta de nuevo.'}`);
    } finally {
      setIsCreatingSession(false);
    }
  };

  const handleCancel = () => {
    navigate('/content');
  };

  return (
    <DashboardLayout
      screenName="Nueva Sesión"
      showBackButton={true}
      backPath="/content"
    >
      <div style={{ 
        minHeight: '100vh', 
        backgroundColor: '#1a1a1a',
        padding: '24px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center'
      }}>
        <div style={{ 
          width: '100%', 
          maxWidth: '800px',
          display: 'flex',
          flexDirection: 'column',
          gap: '24px'
        }}>
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'space-between',
            marginBottom: '8px'
          }}>
            <h1 style={{ 
              color: '#ffffff', 
              fontSize: '24px', 
              fontWeight: '600',
              margin: 0
            }}>
              Nueva Sesión de Biblioteca
            </h1>
            <button
              onClick={handleCancel}
              style={{
                background: 'none',
                border: 'none',
                color: 'rgba(255, 255, 255, 0.7)',
                fontSize: '16px',
                cursor: 'pointer',
                padding: '8px 16px'
              }}
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
                          <label className="edit-program-image-action-pill">
                            <input
                              type="file"
                              accept="image/*"
                              onChange={handleSessionImageUpload}
                              disabled={isUploadingSessionImage || isCreatingSession}
                              style={{ display: 'none' }}
                            />
                            <span className="edit-program-image-action-text">
                              {isUploadingSessionImage ? 'Subiendo...' : 'Cambiar'}
                            </span>
                          </label>
                          {isUploadingSessionImage && (
                            <div className="edit-program-image-progress">
                              <div className="edit-program-image-progress-bar">
                                <div 
                                  className="edit-program-image-progress-fill"
                                  style={{ width: `${sessionImageUploadProgress}%` }}
                                />
                              </div>
                              <span className="edit-program-image-progress-text">
                                {sessionImageUploadProgress}%
                              </span>
                            </div>
                          )}
                          <button
                            className="edit-program-image-action-pill edit-program-image-delete-pill"
                            onClick={handleSessionImageDelete}
                            disabled={isUploadingSessionImage || isCreatingSession}
                          >
                            <span className="edit-program-image-action-text">Eliminar</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="edit-program-no-image">
                      <p>No hay imagen disponible</p>
                      <label className="edit-program-image-upload-button">
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleSessionImageUpload}
                          disabled={isUploadingSessionImage || isCreatingSession}
                          style={{ display: 'none' }}
                        />
                        {isUploadingSessionImage ? 'Subiendo...' : 'Subir Imagen'}
                      </label>
                      {isUploadingSessionImage && (
                        <div className="edit-program-image-progress">
                          <div className="edit-program-image-progress-bar">
                            <div 
                              className="edit-program-image-progress-fill"
                              style={{ width: `${sessionImageUploadProgress}%` }}
                            />
                          </div>
                          <span className="edit-program-image-progress-text">
                            {sessionImageUploadProgress}%
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="edit-program-modal-actions" style={{ flexShrink: 0, marginTop: '24px', paddingTop: '16px', display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={handleCancel}
                style={{
                  background: 'transparent',
                  border: '1px solid rgba(255, 255, 255, 0.3)',
                  color: 'rgba(255, 255, 255, 0.7)',
                  padding: '12px 24px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '16px'
                }}
              >
                Cancelar
              </button>
              <Button
                title={isCreatingSession || isUploadingSessionImage ? 'Creando...' : 'Crear'}
                onClick={handleCreateSession}
                disabled={!sessionName.trim() || isCreatingSession || isUploadingSessionImage}
                loading={isCreatingSession || isUploadingSessionImage}
              />
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default CreateLibrarySessionScreen;

