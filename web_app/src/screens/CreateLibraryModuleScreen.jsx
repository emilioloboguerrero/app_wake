import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import DashboardLayout from '../components/DashboardLayout';
import Button from '../components/Button';
import Input from '../components/Input';
import libraryService from '../services/libraryService';
import './ProgramDetailScreen.css';

const CreateLibraryModuleScreen = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [moduleName, setModuleName] = useState('');
  const [isCreatingModule, setIsCreatingModule] = useState(false);

  const handleCreateModule = async () => {
    if (!moduleName.trim() || !user) {
      return;
    }

    try {
      setIsCreatingModule(true);
      
      // Create library module
      await libraryService.createLibraryModule(user.uid, {
        title: moduleName.trim(),
        sessionRefs: []
      });
      
      // Navigate back to the previous page
      navigate(-1);
    } catch (err) {
      console.error('Error creating library module:', err);
      alert(`Error al crear el módulo: ${err.message || 'Por favor, intenta de nuevo.'}`);
    } finally {
      setIsCreatingModule(false);
    }
  };

  const handleCancel = () => {
    navigate(-1);
  };

  return (
    <DashboardLayout>
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
              Nuevo Módulo de Biblioteca
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
              <div className="edit-program-modal-right" style={{ overflowY: 'auto', overflowX: 'hidden', width: '100%' }}>
                <div className="edit-program-input-group">
                  <label className="edit-program-input-label">Nombre del Módulo</label>
                  <Input
                    placeholder="Nombre del módulo"
                    value={moduleName}
                    onChange={(e) => setModuleName(e.target.value)}
                    type="text"
                    light={true}
                  />
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
                title={isCreatingModule ? 'Creando...' : 'Crear'}
                onClick={handleCreateModule}
                disabled={!moduleName.trim() || isCreatingModule}
                loading={isCreatingModule}
              />
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default CreateLibraryModuleScreen;

