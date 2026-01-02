import React, { memo } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const SortableModuleCard = memo(({ module, isModuleEditMode, onModuleClick, onDeleteModule, moduleIndex, isModuleIncomplete }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: module.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const moduleNumber = (module.order !== undefined && module.order !== null) ? module.order + 1 : moduleIndex + 1;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`module-card ${isModuleEditMode ? 'module-card-edit-mode' : ''} ${isDragging ? 'module-card-dragging' : ''}`}
      onClick={() => onModuleClick(module)}
    >
      <div className="module-card-number">{moduleNumber}</div>
      {!isModuleEditMode && isModuleIncomplete && (
        <div className="module-incomplete-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M18.9199 17.1583L19.0478 15.5593C19.08 15.1564 19.2388 14.7743 19.5009 14.4667L20.541 13.2449C21.1527 12.527 21.1526 11.4716 20.5409 10.7538L19.5008 9.53271C19.2387 9.2251 19.0796 8.84259 19.0475 8.43972L18.9204 6.84093C18.8453 5.9008 18.0986 5.15403 17.1585 5.07901L15.5594 4.95108C15.1566 4.91893 14.7746 4.76143 14.467 4.49929L13.246 3.45879C12.5282 2.84707 11.4718 2.84707 10.754 3.45879L9.53285 4.49883C9.22525 4.76097 8.84274 4.91981 8.43987 4.95196L6.84077 5.07957M18.9208 17.159C18.8458 18.0991 18.0993 18.8457 17.1591 18.9207M17.1586 18.9197L15.5595 19.0473C15.1567 19.0795 14.7744 19.2376 14.4667 19.4997L13.246 20.5407C12.5282 21.1525 11.4717 21.1525 10.7539 20.5408L9.53316 19.5008C9.22555 19.2386 8.84325 19.0798 8.44038 19.0477L6.84077 18.9197M6.84173 18.9207C5.90159 18.8457 5.15505 18.0991 5.08003 17.159L4.9521 15.5594C4.91995 15.1565 4.76111 14.7742 4.49898 14.4666L3.45894 13.2459C2.84721 12.5281 2.84693 11.4715 3.45865 10.7537L4.49963 9.53301C4.76176 9.22541 4.91908 8.84311 4.95122 8.44024L5.07915 6.84063M5.08003 6.84158C5.15505 5.90145 5.9016 5.15491 6.84173 5.07989" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      )}
      {isModuleEditMode && (
        <>
          <button
            className="module-delete-button"
            onClick={(e) => {
              e.stopPropagation();
              onDeleteModule(module);
            }}
          >
            <span className="module-delete-icon">−</span>
          </button>
          <div
            className="module-drag-handle"
            {...attributes}
            {...listeners}
            onClick={(e) => e.stopPropagation()}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="9" cy="5" r="1.5" fill="currentColor"/>
              <circle cx="15" cy="5" r="1.5" fill="currentColor"/>
              <circle cx="9" cy="12" r="1.5" fill="currentColor"/>
              <circle cx="15" cy="12" r="1.5" fill="currentColor"/>
              <circle cx="9" cy="19" r="1.5" fill="currentColor"/>
              <circle cx="15" cy="19" r="1.5" fill="currentColor"/>
            </svg>
          </div>
        </>
      )}
      <div className="module-card-header">
        <h3 className="module-card-title">
          {module.title || module.name || `Módulo ${module.id.slice(0, 8)}`}
        </h3>
        {module.description && (
          <p className="module-card-description">{module.description}</p>
        )}
      </div>
      <div className="module-card-footer">
        {/* TODO: Add module count or other info */}
      </div>
    </div>
  );
});

SortableModuleCard.displayName = 'SortableModuleCard';

export default SortableModuleCard;

