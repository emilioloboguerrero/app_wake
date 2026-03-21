import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { usePrograms } from '../hooks/usePrograms';
import oneOnOneService from '../services/oneOnOneService';
import './CommandPalette.css';

const STATIC_COMMANDS = [
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

function fuzzyMatch(label, query) {
  if (!query) return true;
  return label.toLowerCase().includes(query.toLowerCase());
}

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

const ClientIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
    <circle cx="12" cy="7" r="4"/>
  </svg>
);

const ProgramIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
    <line x1="8" y1="21" x2="16" y2="21"/>
    <line x1="12" y1="17" x2="12" y2="21"/>
  </svg>
);

function iconForGroup(group) {
  switch (group) {
    case 'Crear': return <CreateIcon />;
    case 'Clientes': return <ClientIcon />;
    case 'Programas': return <ProgramIcon />;
    default: return <NavIcon />;
  }
}

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);
  const navigate = useNavigate();
  const { user } = useAuth();

  const { data: programs, isError: programsError } = usePrograms();
  const { data: clients, isError: clientsError } = useQuery({
    queryKey: ['clients', user?.uid],
    queryFn: () => oneOnOneService.getClientsByCreator(),
    enabled: !!user,
    staleTime: 2 * 60 * 1000,
  });

  const hasError = programsError || clientsError;

  const allCommands = useMemo(() => {
    const groups = [...STATIC_COMMANDS];

    if (clients?.length) {
      groups.push({
        group: 'Clientes',
        items: clients.map(c => ({
          id: `client-${c.id || c.clientUserId}`,
          label: c.displayName || c.name || c.email || 'Cliente',
          path: `/products?tab=clientes&client=${c.id || c.clientUserId}`,
          hint: '',
        })),
      });
    }

    if (programs?.length) {
      groups.push({
        group: 'Programas',
        items: programs.map(p => ({
          id: `program-${p.id}`,
          label: p.title || p.name || 'Programa',
          path: `/products?program=${p.id}`,
          hint: '',
        })),
      });
    }

    return groups;
  }, [clients, programs]);

  const allItems = useMemo(
    () => allCommands.flatMap(g => g.items.map(item => ({ ...item, group: g.group }))),
    [allCommands]
  );

  const filteredItems = useMemo(
    () => allItems.filter(item => fuzzyMatch(item.label, query)),
    [allItems, query]
  );

  const groupedFiltered = useMemo(
    () => allCommands.map(g => ({
      group: g.group,
      items: filteredItems.filter(i => i.group === g.group),
    })).filter(g => g.items.length > 0),
    [allCommands, filteredItems]
  );

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

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

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

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  if (!open) return null;

  let flatIndex = 0;
  const showEmpty = query && filteredItems.length === 0 && !hasError;
  const showError = query && hasError && filteredItems.length === 0;

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
          {showEmpty && (
            <div className="cp-empty-state">
              No encontramos resultados para &lsquo;{query}&rsquo;.
            </div>
          )}
          {showError && (
            <div className="cp-error-state">
              No pudimos buscar. Intenta de nuevo.
            </div>
          )}
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
                      {iconForGroup(item.group)}
                    </span>
                    <span className="cp-item-label">{item.label}</span>
                    {item.hint && <span className="cp-item-hint">{item.hint}</span>}
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
