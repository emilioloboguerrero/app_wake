import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import DashboardLayout from '../components/DashboardLayout';
import libraryService from '../services/libraryService';
import logger from '../utils/logger';
import { useToast } from '../contexts/ToastContext';
import './CreateLibraryModuleScreen.css';

const CreateLibraryModuleScreen = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { showToast } = useToast();
  const backPath = location.state?.returnTo || '/content';
  const backState = location.state?.returnState ?? {};
  const [moduleName, setModuleName] = useState('');
  const [isCreatingModule, setIsCreatingModule] = useState(false);

  const handleCreateModule = async () => {
    if (!moduleName.trim() || !user) {
      return;
    }

    try {
      setIsCreatingModule(true);
      
      await libraryService.createLibraryModule(user.uid, {
        title: moduleName.trim(),
        sessionRefs: []
      });
      
      navigate(backPath, { state: backState });
    } catch (err) {
      logger.error('Error creating library module:', err);
      showToast(`Error al crear el módulo: ${err.message || 'Por favor, intenta de nuevo.'}`, 'error');
    } finally {
      setIsCreatingModule(false);
    }
  };

  const handleCancel = () => {
    navigate(backPath, { state: backState });
  };

  return (
    <DashboardLayout
      screenName="Nuevo Módulo"
      showBackButton={true}
      backPath={backPath}
      backState={backState}
    >
      <div className="clm-root">
        <div className="clm-form-container">
          <h1 className="clm-title">Nuevo Módulo de Biblioteca</h1>
          <p className="clm-subtitle">Biblioteca de módulos</p>

          <div className="clm-form-group">
            <label className="clm-label">Nombre del Módulo</label>
            <input
              className="clm-input"
              placeholder="Nombre del módulo"
              value={moduleName}
              onChange={(e) => setModuleName(e.target.value)}
              type="text"
            />
          </div>

          <div className="clm-actions">
            <button className="clm-btn-cancel" onClick={handleCancel}>
              Cancelar
            </button>
            <button
              className="clm-btn-save"
              onClick={handleCreateModule}
              disabled={!moduleName.trim() || isCreatingModule}
            >
              {isCreatingModule ? 'Creando...' : 'Crear'}
            </button>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default CreateLibraryModuleScreen;

