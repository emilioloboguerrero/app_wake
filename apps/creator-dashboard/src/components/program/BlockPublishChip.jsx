// BlockPublishChip — toggles `module.published_at` for monthly-drop blocks.
// Extracted from ProgramContentTab so the Entrenamiento month-block header
// (ProgramWeeksGrid) can publish/unpublish without switching tabs.
import React from 'react';

export default function BlockPublishChip({ isPublished, busy, onClick, className = '' }) {
  return (
    <button
      type="button"
      className={`module-block-chip ${isPublished ? 'module-block-chip--published' : 'module-block-chip--draft'} ${className}`}
      onClick={(e) => { e.stopPropagation(); if (!busy) onClick?.(); }}
      disabled={busy}
      title={isPublished
        ? 'Quitar publicación (vuelve a borrador)'
        : 'Publicar este bloque (el cron podrá entregarlo)'}
    >
      <span className="module-block-chip__dot" />
      <span>{busy ? 'Guardando…' : (isPublished ? 'Publicado' : 'Borrador')}</span>
    </button>
  );
}
