import React, { useState, useEffect, useRef, useMemo } from 'react';
import './ExercisePicker.css';

const ExercisePicker = ({
  isOpen,
  mode, // 'primary' | 'add-alternative'
  libraries,
  isLoadingLibraries,
  onSelectLibrary,
  exercises,
  isLoadingExercises,
  selectedLibraryId,
  onSelect,
  onClose,
  isSaving,
}) => {
  const [step, setStep] = useState('library'); // 'library' | 'exercise'
  const [search, setSearch] = useState('');
  const searchRef = useRef(null);

  // Reset state when opening
  useEffect(() => {
    if (isOpen) {
      setStep('library');
      setSearch('');
    }
  }, [isOpen]);

  // Focus search on step change
  useEffect(() => {
    if (isOpen && searchRef.current) {
      setTimeout(() => searchRef.current?.focus(), 120);
    }
  }, [isOpen, step]);

  const handleLibraryClick = (libId) => {
    onSelectLibrary(libId);
    setStep('exercise');
    setSearch('');
  };

  const handleBack = () => {
    setStep('library');
    setSearch('');
  };

  const filteredLibraries = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return libraries || [];
    return (libraries || []).filter(l => (l.title || '').toLowerCase().includes(q));
  }, [libraries, search]);

  const filteredExercises = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return exercises || [];
    return (exercises || []).filter(e => (e.name || '').toLowerCase().includes(q));
  }, [exercises, search]);

  if (!isOpen) return null;

  const title = mode === 'primary' ? 'Sustituir ejercicio' : 'Agregar alternativa';
  const selectedLib = (libraries || []).find(l => l.id === selectedLibraryId);

  return (
    <div className="exp-picker">
      {isSaving && (
        <div className="exp-picker-saving">
          <div className="exp-picker-saving-spinner" />
        </div>
      )}

      {/* Header */}
      <div className="exp-picker-header">
        <div className="exp-picker-header-left">
          {step === 'exercise' && (
            <button type="button" className="exp-picker-back" onClick={handleBack}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M19 12H5M5 12L12 19M5 12L12 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
          )}
          <div className="exp-picker-header-text">
            <span className="exp-picker-title">{title}</span>
            {step === 'exercise' && selectedLib && (
              <span className="exp-picker-subtitle">{selectedLib.title}</span>
            )}
          </div>
        </div>
        <button type="button" className="exp-picker-close" onClick={onClose}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
        </button>
      </div>

      {/* Search */}
      <div className="exp-picker-search">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="exp-picker-search-icon">
          <path d="M21 21L15 15M17 10C17 13.866 13.866 17 10 17C6.13401 17 3 13.866 3 10C3 6.13401 6.13401 3 10 3C13.866 3 17 6.13401 17 10Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <input
          ref={searchRef}
          type="text"
          className="exp-picker-search-input"
          placeholder={step === 'library' ? 'Buscar biblioteca...' : 'Buscar ejercicio...'}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Content */}
      <div className="exp-picker-content">
        {step === 'library' ? (
          isLoadingLibraries ? (
            <div className="exp-picker-empty">Cargando...</div>
          ) : filteredLibraries.length === 0 ? (
            <div className="exp-picker-empty">{search ? 'Sin resultados' : 'No tienes bibliotecas'}</div>
          ) : (
            <div className="exp-picker-list">
              {filteredLibraries.map((lib, i) => (
                <button
                  key={lib.id}
                  type="button"
                  className="exp-picker-item exp-picker-item--lib"
                  onClick={() => handleLibraryClick(lib.id)}
                  style={{ '--item-delay': `${i * 30}ms` }}
                >
                  <span className="exp-picker-item-name">{lib.title || lib.id}</span>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="exp-picker-item-arrow"><path d="M9 18L15 12L9 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </button>
              ))}
            </div>
          )
        ) : (
          isLoadingExercises ? (
            <div className="exp-picker-empty">Cargando ejercicios...</div>
          ) : filteredExercises.length === 0 ? (
            <div className="exp-picker-empty">{search ? 'Sin resultados' : 'Biblioteca vacía'}</div>
          ) : (
            <div className="exp-picker-list exp-picker-list--exercises">
              {filteredExercises.map((ex, i) => (
                <button
                  key={ex.id || ex.name}
                  type="button"
                  className="exp-picker-item exp-picker-item--exercise"
                  // Pass the stable exerciseId (or name fallback for unmigrated libs) so
                  // primary/alternatives writes use ids, not display names.
                  onClick={() => onSelect(ex.id || ex.name, ex)}
                  disabled={isSaving}
                  style={{ '--item-delay': `${i * 25}ms` }}
                >
                  <span className="exp-picker-item-name">{ex.name}</span>
                </button>
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
};

export default ExercisePicker;
