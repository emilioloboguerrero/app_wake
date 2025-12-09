import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import DashboardLayout from '../components/DashboardLayout';
import Modal from '../components/Modal';
import Input from '../components/Input';
import Button from '../components/Button';
import libraryService from '../services/libraryService';
import { getUser } from '../services/firestoreService';
import './LibrariesScreen.css';

const LibrariesScreen = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [libraries, setLibraries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [libraryName, setLibraryName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [creatorName, setCreatorName] = useState('');
  const [isEditMode, setIsEditMode] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [libraryToDelete, setLibraryToDelete] = useState(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const loadCreatorData = async () => {
      if (!user) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);
        
        // Load creator name from user document
        const userDoc = await getUser(user.uid);
        if (userDoc) {
          setCreatorName(userDoc.displayName || userDoc.name || user.email || '');
        }
        
        // Load libraries
        const creatorLibraries = await libraryService.getLibrariesByCreator(user.uid);
        setLibraries(creatorLibraries);
      } catch (err) {
        console.error('Error loading data:', err);
        setError('Error al cargar las bibliotecas');
      } finally {
        setLoading(false);
      }
    };

    loadCreatorData();
  }, [user]);

  const handleAddLibrary = () => {
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setLibraryName(''); // Reset form when closing
  };

  const handleCreateLibrary = async () => {
    if (!libraryName.trim() || !user || !creatorName) {
      return;
    }

    try {
      setIsCreating(true);
      setError(null);
      
      const newLibrary = await libraryService.createLibrary(user.uid, creatorName, libraryName.trim());
      
      // Navigate to the new library page
      navigate(`/libraries/${newLibrary.id}`);
    } catch (err) {
      console.error('Error creating library:', err);
      setError('Error al crear la biblioteca');
      alert('Error al crear la biblioteca. Por favor, intenta de nuevo.');
    } finally {
      setIsCreating(false);
    }
  };

  const handleEditLibraries = () => {
    setIsEditMode(!isEditMode);
  };

  const handleDeleteLibrary = (library) => {
    setLibraryToDelete(library);
    setIsDeleteModalOpen(true);
    setDeleteConfirmation('');
  };

  const handleCloseDeleteModal = () => {
    setIsDeleteModalOpen(false);
    setLibraryToDelete(null);
    setDeleteConfirmation('');
  };

  const handleConfirmDelete = async () => {
    if (!libraryToDelete || !deleteConfirmation.trim()) {
      return;
    }

    // Verify the confirmation matches the library title
    if (deleteConfirmation.trim() !== libraryToDelete.title) {
      return;
    }

    try {
      setIsDeleting(true);
      setError(null);
      
      await libraryService.deleteLibrary(libraryToDelete.id);
      
      // Reload libraries
      const creatorLibraries = await libraryService.getLibrariesByCreator(user.uid);
      setLibraries(creatorLibraries);
      
      // Close modal and exit edit mode if no libraries left
      handleCloseDeleteModal();
      if (creatorLibraries.length === 0) {
        setIsEditMode(false);
      }
    } catch (err) {
      console.error('Error deleting library:', err);
      setError('Error al eliminar la biblioteca');
      alert('Error al eliminar la biblioteca. Por favor, intenta de nuevo.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <DashboardLayout screenName="Bibliotecas">
      <div className="libraries-content">
        <div className="libraries-actions">
          <button 
            className={`library-action-pill ${isEditMode ? 'library-action-pill-disabled' : ''}`}
            onClick={handleAddLibrary}
            disabled={isEditMode}
          >
            <span className="library-action-icon">+</span>
          </button>
          <button 
            className="library-action-pill"
            onClick={handleEditLibraries}
          >
            <span className="library-action-text">{isEditMode ? 'Guardar' : 'Editar'}</span>
          </button>
        </div>
        
        {/* Libraries List */}
        {loading ? (
          <div className="libraries-loading">
            <p>Cargando bibliotecas...</p>
          </div>
        ) : error ? (
          <div className="libraries-error">
            <p>{error}</p>
          </div>
        ) : libraries.length === 0 ? (
          <div className="libraries-empty">
            <p>No tienes bibliotecas aún. Crea una nueva biblioteca para comenzar.</p>
          </div>
        ) : (
          <div className="libraries-list">
            {libraries.map((library) => {
              const exerciseCount = libraryService.getExerciseCount(library);
              return (
                <div 
                  key={library.id} 
                  className={`library-card ${isEditMode ? 'library-card-edit-mode' : ''}`}
                  onClick={() => {
                    if (!isEditMode) {
                      navigate(`/libraries/${library.id}`);
                    }
                  }}
                >
                  {isEditMode && (
                    <button
                      className="library-delete-button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteLibrary(library);
                      }}
                    >
                      <span className="library-delete-icon">−</span>
                    </button>
                  )}
                  <div className="library-card-header">
                    <h3 className="library-card-title">
                      {library.title || `Biblioteca ${library.id.slice(0, 8)}`}
                    </h3>
                    {library.description && (
                      <p className="library-card-description">{library.description}</p>
                    )}
                  </div>
                  <div className="library-card-footer">
                    <span className="library-card-count">
                      {exerciseCount} {exerciseCount === 1 ? 'ejercicio' : 'ejercicios'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create Library Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title="Nueva biblioteca"
      >
        <div className="modal-library-content">
          <Input
            placeholder="Nombre de la biblioteca"
            value={libraryName}
            onChange={(e) => setLibraryName(e.target.value)}
            type="text"
            light={true}
          />
          <div className="modal-actions">
            <Button
              title="Crear"
              onClick={handleCreateLibrary}
              disabled={!libraryName.trim() || isCreating}
              loading={isCreating}
            />
          </div>
        </div>
      </Modal>

      {/* Delete Library Modal */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={handleCloseDeleteModal}
        title={libraryToDelete?.title || 'Eliminar biblioteca'}
      >
        <div className="modal-library-content">
          <p className="delete-instruction-text">
            Para confirmar, escribe el nombre de la biblioteca:
          </p>
          <div className="delete-input-button-row">
            <Input
              placeholder={libraryToDelete?.title || 'Nombre de la biblioteca'}
              value={deleteConfirmation}
              onChange={(e) => setDeleteConfirmation(e.target.value)}
              type="text"
              light={true}
            />
            <button
              className={`delete-library-button ${deleteConfirmation.trim() !== libraryToDelete?.title ? 'delete-library-button-disabled' : ''}`}
              onClick={handleConfirmDelete}
              disabled={deleteConfirmation.trim() !== libraryToDelete?.title || isDeleting}
            >
              {isDeleting ? 'Eliminando...' : 'Eliminar'}
            </button>
          </div>
          <p className="delete-warning-text">
            Esta acción es irreversible. Todos los ejercicios en esta biblioteca se eliminarán permanentemente.
          </p>
        </div>
      </Modal>
    </DashboardLayout>
  );
};

export default LibrariesScreen;

