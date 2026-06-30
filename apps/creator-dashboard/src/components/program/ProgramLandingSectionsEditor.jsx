import { useState, useEffect, useCallback, useMemo } from 'react';
import { BentoCard } from '../ui/BentoGrid';
import GlowingEffect from '../ui/GlowingEffect';
import MediaPickerModal from '../MediaPickerModal';
import { extractYouTubeId } from '../../utils/videoUtils';
import './ProgramLandingSectionsEditor.css';

// ─── Block factories ──────────────────────────────────────────────
const newBlock = (type) => {
  switch (type) {
    case 'text': return { type: 'text', value: '' };
    case 'image': return { type: 'image', url: '' };
    case 'youtube': return { type: 'youtube', url: '' };
    case 'video': return { type: 'video', url: '' };
    default: return { type: 'text', value: '' };
  }
};

const PRESETS = [
  { heading: 'Qué incluye', label: 'Qué incluye' },
  { heading: 'Qué hay de nuevo', label: 'Qué hay de nuevo' },
];

// Deep clone so local edits never mutate the React Query cache object.
const cloneSections = (sections) =>
  (sections || []).map((s) => ({
    heading: s?.heading ?? '',
    blocks: (s?.blocks || []).map((b) => ({ ...b })),
  }));

// Drop empty headings + empty blocks so we never persist junk.
const sanitize = (sections) =>
  sections
    .map((s) => ({
      heading: (s.heading || '').trim(),
      blocks: (s.blocks || []).filter((b) => {
        if (b.type === 'text') return (b.value || '').trim() !== '';
        return (b.url || '').trim() !== '';
      }),
    }))
    .filter((s) => s.heading !== '' || s.blocks.length > 0);

// Stable serialization for the dirty check (block order matters).
const serialize = (sections) => JSON.stringify(sanitize(sections));

export default function ProgramLandingSectionsEditor({ program, onSave }) {
  const [sections, setSections] = useState(() => cloneSections(program?.landing_sections));
  const [isSaving, setIsSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  // Which block a media pick targets: { sectionIndex, blockIndex, accept }
  const [pickTarget, setPickTarget] = useState(null);

  // Re-seed when switching to a different program.
  useEffect(() => {
    setSections(cloneSections(program?.landing_sections));
    setJustSaved(false);
  }, [program?.id]);

  const savedSerialized = useMemo(
    () => serialize(cloneSections(program?.landing_sections)),
    [program?.landing_sections],
  );
  const isDirty = useMemo(
    () => serialize(sections) !== savedSerialized,
    [sections, savedSerialized],
  );

  // ─── Section mutations ──────────────────────────────────────────
  const updateSection = useCallback((idx, updater) => {
    setSections((prev) => prev.map((s, i) => (i === idx ? updater(s) : s)));
    setJustSaved(false);
  }, []);

  const addSection = useCallback((heading = '') => {
    setSections((prev) => [...prev, { heading, blocks: [] }]);
    setJustSaved(false);
  }, []);

  const removeSection = useCallback((idx) => {
    setSections((prev) => prev.filter((_, i) => i !== idx));
    setJustSaved(false);
  }, []);

  const moveSection = useCallback((idx, dir) => {
    setSections((prev) => {
      const target = idx + dir;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
    setJustSaved(false);
  }, []);

  // ─── Block mutations ────────────────────────────────────────────
  const addBlock = useCallback((sectionIdx, type) => {
    if (type === 'image' || type === 'video') {
      // Open the picker first; append the block on select.
      setPickTarget({ sectionIndex: sectionIdx, blockIndex: null, accept: type === 'image' ? 'image/*' : 'video/*' });
      return;
    }
    updateSection(sectionIdx, (s) => ({ ...s, blocks: [...s.blocks, newBlock(type)] }));
  }, [updateSection]);

  const updateBlock = useCallback((sectionIdx, blockIdx, patch) => {
    updateSection(sectionIdx, (s) => ({
      ...s,
      blocks: s.blocks.map((b, i) => (i === blockIdx ? { ...b, ...patch } : b)),
    }));
  }, [updateSection]);

  const removeBlock = useCallback((sectionIdx, blockIdx) => {
    updateSection(sectionIdx, (s) => ({
      ...s,
      blocks: s.blocks.filter((_, i) => i !== blockIdx),
    }));
  }, [updateSection]);

  const moveBlock = useCallback((sectionIdx, blockIdx, dir) => {
    updateSection(sectionIdx, (s) => {
      const target = blockIdx + dir;
      if (target < 0 || target >= s.blocks.length) return s;
      const blocks = [...s.blocks];
      [blocks[blockIdx], blocks[target]] = [blocks[target], blocks[blockIdx]];
      return { ...s, blocks };
    });
  }, [updateSection]);

  // ─── Media picker ───────────────────────────────────────────────
  const handleMediaSelect = useCallback((item) => {
    if (!pickTarget || !item?.url) { setPickTarget(null); return; }
    const { sectionIndex, blockIndex, accept } = pickTarget;
    const type = accept === 'video/*' ? 'video' : 'image';
    updateSection(sectionIndex, (s) => {
      if (blockIndex == null) {
        // New block from "Agregar"
        return { ...s, blocks: [...s.blocks, { type, url: item.url }] };
      }
      // Replacing an existing block's media ("Cambiar")
      return {
        ...s,
        blocks: s.blocks.map((b, i) => (i === blockIndex ? { ...b, type, url: item.url } : b)),
      };
    });
    setPickTarget(null);
  }, [pickTarget, updateSection]);

  const openReplacePicker = useCallback((sectionIdx, blockIdx, type) => {
    setPickTarget({ sectionIndex: sectionIdx, blockIndex: blockIdx, accept: type === 'video' ? 'video/*' : 'image/*' });
  }, []);

  // ─── Save ───────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (isSaving) return;
    const cleaned = sanitize(sections);
    setIsSaving(true);
    setJustSaved(false);
    try {
      await onSave(cleaned);
      // Reflect the trimmed result locally so empties collapse visibly.
      setSections(cloneSections(cleaned));
      setJustSaved(true);
    } catch {
      // Parent's saveField surfaces a toast; keep local edits intact.
    } finally {
      setIsSaving(false);
    }
  }, [isSaving, sections, onSave]);

  const saveLabel = isSaving ? 'Guardando…' : (justSaved && !isDirty ? 'Guardado' : 'Guardar');

  return (
    <BentoCard className="gp-config__card gp-config__card--span-2 pls-card">
      <GlowingEffect spread={24} proximity={60} />

      <div className="pls-card__header">
        <h3>Página de venta</h3>
        {isDirty && <span className="pls-dirty">cambios sin guardar</span>}
      </div>
      <p className="gp-config__hint">
        Estas secciones aparecen en la página pública del programa. Si las dejas vacías, no se muestran.
      </p>

      {sections.length === 0 ? (
        <div className="pls-empty">
          <p className="pls-empty__title">Aún no tienes secciones</p>
          <p className="pls-empty__sub">Crea una para contarle a la gente qué incluye tu programa.</p>
        </div>
      ) : (
        <div className="pls-sections">
          {sections.map((section, si) => (
            <div key={si} className="pls-section">
              <div className="pls-section__head">
                <input
                  className="pls-section__heading"
                  type="text"
                  value={section.heading}
                  onChange={(e) => updateSection(si, (s) => ({ ...s, heading: e.target.value }))}
                  placeholder="Título de la sección, ej. Qué incluye"
                />
                <div className="pls-section__controls">
                  <button
                    type="button"
                    className="pls-icon-btn"
                    onClick={() => moveSection(si, -1)}
                    disabled={si === 0}
                    aria-label="Subir sección"
                    title="Subir"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    className="pls-icon-btn"
                    onClick={() => moveSection(si, 1)}
                    disabled={si === sections.length - 1}
                    aria-label="Bajar sección"
                    title="Bajar"
                  >
                    ▼
                  </button>
                  <button
                    type="button"
                    className="pls-icon-btn pls-icon-btn--danger"
                    onClick={() => removeSection(si)}
                    aria-label="Eliminar sección"
                    title="Eliminar"
                  >
                    Eliminar
                  </button>
                </div>
              </div>

              {section.blocks.length > 0 && (
                <div className="pls-blocks">
                  {section.blocks.map((block, bi) => (
                    <div key={bi} className="pls-block">
                      <div className="pls-block__bar">
                        <span className="pls-block__type">{BLOCK_LABELS[block.type] || 'Bloque'}</span>
                        <div className="pls-block__controls">
                          <button
                            type="button"
                            className="pls-icon-btn"
                            onClick={() => moveBlock(si, bi, -1)}
                            disabled={bi === 0}
                            aria-label="Subir bloque"
                            title="Subir"
                          >
                            ▲
                          </button>
                          <button
                            type="button"
                            className="pls-icon-btn"
                            onClick={() => moveBlock(si, bi, 1)}
                            disabled={bi === section.blocks.length - 1}
                            aria-label="Bajar bloque"
                            title="Bajar"
                          >
                            ▼
                          </button>
                          <button
                            type="button"
                            className="pls-icon-btn pls-icon-btn--danger"
                            onClick={() => removeBlock(si, bi)}
                            aria-label="Eliminar bloque"
                            title="Eliminar"
                          >
                            ✕
                          </button>
                        </div>
                      </div>

                      <BlockBody
                        block={block}
                        onTextChange={(value) => updateBlock(si, bi, { value })}
                        onUrlChange={(url) => updateBlock(si, bi, { url })}
                        onReplace={() => openReplacePicker(si, bi, block.type)}
                        onClearMedia={() => updateBlock(si, bi, { url: '' })}
                      />
                    </div>
                  ))}
                </div>
              )}

              <div className="pls-add-row">
                <button type="button" className="pls-add-btn" onClick={() => addBlock(si, 'text')}>+ Texto</button>
                <button type="button" className="pls-add-btn" onClick={() => addBlock(si, 'image')}>+ Imagen</button>
                <button type="button" className="pls-add-btn" onClick={() => addBlock(si, 'youtube')}>+ YouTube</button>
                <button type="button" className="pls-add-btn" onClick={() => addBlock(si, 'video')}>+ Video</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="pls-footer">
        <div className="pls-presets">
          {PRESETS.map((p) => (
            <button
              key={p.heading}
              type="button"
              className="pls-preset-btn"
              onClick={() => addSection(p.heading)}
            >
              + {p.label}
            </button>
          ))}
          <button type="button" className="pls-preset-btn" onClick={() => addSection('')}>
            + Sección
          </button>
        </div>
        <button
          type="button"
          className="gp-config__save-btn pls-save-btn"
          onClick={handleSave}
          disabled={isSaving || !isDirty}
        >
          {saveLabel}
        </button>
      </div>

      <MediaPickerModal
        isOpen={!!pickTarget}
        onClose={() => setPickTarget(null)}
        onSelect={handleMediaSelect}
        accept={pickTarget?.accept || 'image/*'}
      />
    </BentoCard>
  );
}

const BLOCK_LABELS = {
  text: 'Texto',
  image: 'Imagen',
  youtube: 'YouTube',
  video: 'Video',
};

function BlockBody({ block, onTextChange, onUrlChange, onReplace, onClearMedia }) {
  if (block.type === 'text') {
    return (
      <textarea
        className="pls-textarea"
        value={block.value || ''}
        onChange={(e) => onTextChange(e.target.value)}
        placeholder="Escribe el texto de esta sección…"
        rows={3}
      />
    );
  }

  if (block.type === 'image') {
    if (!block.url) {
      return (
        <button type="button" className="pls-media-empty" onClick={onReplace}>
          Elegir imagen
        </button>
      );
    }
    return (
      <div className="pls-media">
        <img src={block.url} alt="" className="pls-media__img" />
        <div className="pls-media__actions">
          <button type="button" className="gp-config__btn" onClick={onReplace}>Cambiar</button>
          <button type="button" className="gp-config__btn gp-config__btn--danger" onClick={onClearMedia}>Eliminar</button>
        </div>
      </div>
    );
  }

  if (block.type === 'video') {
    if (!block.url) {
      return (
        <button type="button" className="pls-media-empty" onClick={onReplace}>
          Elegir video
        </button>
      );
    }
    return (
      <div className="pls-media">
        <video src={block.url} className="pls-media__video" controls playsInline />
        <div className="pls-media__actions">
          <button type="button" className="gp-config__btn" onClick={onReplace}>Cambiar</button>
          <button type="button" className="gp-config__btn gp-config__btn--danger" onClick={onClearMedia}>Eliminar</button>
        </div>
      </div>
    );
  }

  // youtube
  const url = (block.url || '').trim();
  const ytId = url ? extractYouTubeId(url) : null;
  const isValid = !url || !!ytId;
  return (
    <div className="pls-youtube">
      <input
        className="pls-url-input"
        type="url"
        value={block.url || ''}
        onChange={(e) => onUrlChange(e.target.value)}
        placeholder="https://youtube.com/watch?v=… o https://youtu.be/…"
      />
      {url && !isValid && (
        <span className="pls-url-hint pls-url-hint--bad">
          Pega un enlace de youtube.com o youtu.be
        </span>
      )}
      {ytId && (
        <div className="pls-youtube__preview">
          <img
            src={`https://img.youtube.com/vi/${ytId}/mqdefault.jpg`}
            alt=""
            className="pls-youtube__thumb"
          />
        </div>
      )}
    </div>
  );
}
