import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import './CommandPalette.css';

const COMMANDS = [
  {
    group: 'Ir a',
    items: [
      { id: 'nav-lab', label: 'Inicio', path: '/lab', hint: 'G L' },
      { id: 'nav-clients', label: 'Clientes', path: '/products?tab=clientes', hint: 'G C' },
      { id: 'nav-content', label: 'Biblioteca', path: '/content', hint: 'G B' },
      { id: 'nav-nutrition', label: 'Nutrición', path: '/nutrition', hint: 'G N' },
      { id: 'nav-availability', label: 'Disponibilidad', path: '/availability', hint: 'G D' },
      { id: 'nav-profile', label: 'Perfil', path: '/profile', hint: 'G P' },
    ],
  },
  {
    group: 'Crear',
    items: [
      { id: 'create-session', label: 'Nueva sesión', path: '/content?create=true', hint: '⌘ S' },
      { id: 'create-program', label: 'Nuevo programa', path: '/products?create=true', hint: '⌘ P' },
      { id: 'create-client', label: 'Nuevo cliente', path: '/products?tab=clientes&create=true', hint: '⌘ C' },
    ],
  },
];

const ALL_ITEMS = COMMANDS.flatMap(g => g.items.map(item => ({ ...item, group: g.group })));

function fuzzyMatch(label, query) {
  if (!query) return true;
  return label.toLowerCase().includes(query.toLowerCase());
}

// SVG icons
const SearchIcon = () => (
  <svg className="cp-search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
  </svg>
);

const NavIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
    <polyline points="9 22 9 12 15 12 15 22"/>
  </svg>
);

const CreateIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
  </svg>
);

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);
  const navigate = useNavigate();

  const filteredItems = ALL_ITEMS.filter(item => fuzzyMatch(item.label, query));

  // Group filtered items
  const groupedFiltered = COMMANDS.map(g => ({
    group: g.group,
    items: filteredItems.filter(i => i.group === g.group),
  })).filter(g => g.items.length > 0);

  const handleOpen = useCallback(() => {
    setOpen(true);
    setQuery('');
    setSelectedIndex(0);
  }, []);

  const handleClose = useCallback(() => {
    setOpen(false);
    setQuery('');
  }, []);

  const handleSelect = useCallback((item) => {
    handleClose();
    navigate(item.path);
  }, [handleClose, navigate]);

  // Global keyboard shortcut
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (open) {
          handleClose();
        } else {
          handleOpen();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, handleOpen, handleClose]);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Keyboard navigation inside palette
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (e.key === 'Escape') {
        handleClose();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(i => Math.min(i + 1, filteredItems.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(i => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filteredItems[selectedIndex]) {
          handleSelect(filteredItems[selectedIndex]);
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, filteredItems, selectedIndex, handleClose, handleSelect]);

  // Reset selection when query changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  if (!open) return null;

  let flatIndex = 0;

  return (
    <div className="cp-overlay" onClick={handleClose}>
      <div className="cp-modal" onClick={e => e.stopPropagation()}>
        <div className="cp-input-row">
          <SearchIcon />
          <input
            ref={inputRef}
            className="cp-input"
            placeholder="Buscar..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        <div className="cp-results">
          {groupedFiltered.map(group => (
            <div key={group.group}>
              <div className="cp-group-label">{group.group}</div>
              {group.items.map(item => {
                const isSelected = flatIndex === selectedIndex;
                const currentIndex = flatIndex;
                flatIndex++;
                return (
                  <div
                    key={item.id}
                    className={`cp-item${isSelected ? ' cp-item--selected' : ''}`}
                    onMouseEnter={() => setSelectedIndex(currentIndex)}
                    onClick={() => handleSelect(item)}
                  >
                    <span className="cp-item-icon">
                      {item.group === 'Crear' ? <CreateIcon /> : <NavIcon />}
                    </span>
                    <span className="cp-item-label">{item.label}</span>
                    <span className="cp-item-hint">{item.hint}</span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <div className="cp-footer">
          <span className="cp-footer-hint"><kbd className="cp-kbd">↵</kbd> seleccionar</span>
          <span className="cp-footer-hint"><kbd className="cp-kbd">↑↓</kbd> navegar</span>
          <span className="cp-footer-hint"><kbd className="cp-kbd">Esc</kbd> cerrar</span>
        </div>
      </div>
    </div>
  );
}
