import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { IMPLEMENTS_LIST } from '../../constants/exerciseConstants';

function ImplementsDropdown({ selected, allOptions, onToggle, onAddCustom, onClose, anchorRef }) {
  const [search, setSearch] = useState('');
  const [customInput, setCustomInput] = useState('');
  const menuRef = useRef(null);
  const [pos, setPos] = useState({ bottom: 0, left: 0 });

  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allOptions;
    return allOptions.filter(name => name.toLowerCase().includes(q));
  }, [allOptions, search]);

  // Position above the anchor
  useEffect(() => {
    if (!anchorRef.current) return;
    const update = () => {
      const rect = anchorRef.current.getBoundingClientRect();
      const vh = window.innerHeight;
      setPos({
        bottom: vh - rect.top + 6,
        left: rect.left,
      });
    };
    update();
    window.addEventListener('scroll', update, true);
    return () => window.removeEventListener('scroll', update, true);
  }, [anchorRef]);

  useEffect(() => {
    const handleClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target) &&
          anchorRef.current && !anchorRef.current.contains(e.target)) {
        onClose();
      }
    };
    const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose, anchorRef]);

  const handleAddCustom = () => {
    const name = customInput.trim();
    if (!name) return;
    onAddCustom(name);
    setCustomInput('');
  };

  return createPortal(
    <div
      ref={menuRef}
      className="lex-impl-dropdown lex-impl-dropdown--up"
      style={{ bottom: pos.bottom, left: pos.left }}
    >
      <div className="lex-impl-dropdown-custom">
        <input
          type="text"
          placeholder="Personalizado..."
          value={customInput}
          onChange={(e) => setCustomInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddCustom())}
        />
        <button onClick={handleAddCustom} disabled={!customInput.trim()}>+</button>
      </div>
      <div className="lex-impl-dropdown-list">
        {filtered.map(name => (
          <button
            key={name}
            className={`lex-impl-dropdown-item ${selectedSet.has(name) ? 'lex-impl-dropdown-item--selected' : ''}`}
            onClick={() => onToggle(name)}
          >
            <span className="lex-impl-dropdown-check">
              {selectedSet.has(name) ? '✓' : ''}
            </span>
            <span>{name}</span>
          </button>
        ))}
        {filtered.length === 0 && (
          <div className="lex-impl-dropdown-empty">Sin resultados</div>
        )}
      </div>
      <div className="lex-impl-dropdown-search">
        <input
          type="text"
          placeholder="Buscar..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
        />
      </div>
    </div>,
    document.body
  );
}

export default function ImplementsPills({ selected = [], allCustom = [], onChange }) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const addBtnRef = useRef(null);

  const allOptions = useMemo(() => {
    const set = new Set(IMPLEMENTS_LIST);
    allCustom.forEach(i => set.add(i));
    selected.forEach(i => set.add(i));
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'es'));
  }, [allCustom, selected]);

  const handleToggle = useCallback((name) => {
    const set = new Set(selected);
    if (set.has(name)) set.delete(name);
    else set.add(name);
    onChange(Array.from(set));
  }, [selected, onChange]);

  const handleRemove = useCallback((name) => {
    onChange(selected.filter(s => s !== name));
  }, [selected, onChange]);

  const handleAddCustom = useCallback((name) => {
    if (selected.includes(name)) return;
    onChange([...selected, name]);
  }, [selected, onChange]);

  return (
    <div className="lex-implements-card">
      <div className="lex-implements-card-header">
        <label className="lex-section-label">Implementos</label>
        <button
          ref={addBtnRef}
          className="lex-impl-add-btn"
          onClick={() => setDropdownOpen(v => !v)}
        >
          +
        </button>
      </div>

      <div className="lex-impl-pills">
        {selected.length === 0 && (
          <span className="lex-impl-empty">Sin implementos</span>
        )}
        {selected.map(name => (
          <span key={name} className="lex-impl-pill">
            {name}
            <button className="lex-impl-pill-remove" onClick={() => handleRemove(name)}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
                <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
              </svg>
            </button>
          </span>
        ))}
      </div>

      {dropdownOpen && (
        <ImplementsDropdown
          selected={selected}
          allOptions={allOptions}
          onToggle={handleToggle}
          onAddCustom={handleAddCustom}
          onClose={() => setDropdownOpen(false)}
          anchorRef={addBtnRef}
        />
      )}
    </div>
  );
}
