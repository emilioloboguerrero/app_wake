import { useMemo } from 'react';
import MenuDropdown from '../ui/MenuDropdown';

function getMissingTags(exercise) {
  const d = exercise.data || exercise;
  const missing = [];
  if (!(d.video_url || d.video)) missing.push('Video');
  if (!(d.muscle_activation && Object.keys(d.muscle_activation).length > 0)) missing.push('Músculos');
  if (!(Array.isArray(d.implements) && d.implements.length > 0)) missing.push('Implementos');
  return missing;
}

export default function ExerciseListSidebar({
  exercises = [],
  selectedName,
  onSelect,
  onAdd,
  onDelete,
  searchQuery = '',
  onSearchChange,
}) {
  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return exercises;
    return exercises.filter(ex => (ex.name || '').toLowerCase().includes(q));
  }, [exercises, searchQuery]);

  return (
    <div className="lex-sidebar">
      <div className="lex-sidebar-header">
        <h3 className="lex-sidebar-title">Ejercicios</h3>
        <button className="lex-sidebar-add-btn" onClick={onAdd} title="Nuevo ejercicio">
          <span>+</span>
        </button>
      </div>

      <div className="lex-sidebar-search">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="lex-sidebar-search-icon">
          <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
        </svg>
        <input
          type="text"
          className="lex-sidebar-search-input"
          placeholder="Buscar..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>

      <div className="lex-sidebar-list">
        {filtered.length === 0 ? (
          <div className="lex-sidebar-empty">
            <p>{searchQuery.trim() ? 'Sin resultados' : 'Sin ejercicios'}</p>
          </div>
        ) : (
          <div className="lex-sidebar-list-inner">
            {filtered.map((exercise) => {
              const missing = getMissingTags(exercise);
              const isSelected = selectedName === exercise.name;

              return (
                <div key={exercise.name} className="lex-sidebar-item-wrap">
                  <div className={`lex-sidebar-item ${isSelected ? 'lex-sidebar-item--selected' : ''}`}>
                    <button
                      type="button"
                      className="lex-sidebar-item-btn"
                      onClick={() => onSelect(exercise)}
                    >
                      <span className="lex-sidebar-item-name">{exercise.name}</span>
                      {missing.length > 0 && (
                        <span className="lex-sidebar-item-tags">
                          {missing.map(tag => (
                            <span key={tag} className="lex-sidebar-missing-tag">{tag}</span>
                          ))}
                        </span>
                      )}
                    </button>
                    {onDelete && (
                      <MenuDropdown
                        trigger={
                          <span className="lex-sidebar-item-menu" role="button" tabIndex={0}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                              <circle cx="12" cy="6" r="1.5" fill="currentColor"/>
                              <circle cx="12" cy="12" r="1.5" fill="currentColor"/>
                              <circle cx="12" cy="18" r="1.5" fill="currentColor"/>
                            </svg>
                          </span>
                        }
                        items={[
                          {
                            label: 'Eliminar',
                            danger: true,
                            icon: (
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                                <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                              </svg>
                            ),
                            onClick: () => onDelete(exercise),
                          },
                        ]}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
