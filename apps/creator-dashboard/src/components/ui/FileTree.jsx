import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { ChevronRight, ChevronDown, Folder as FolderIcon, File as FileIcon } from 'lucide-react';
import './FileTree.css';

/* ─── Context ────────────────────────────────────────────── */
const TreeContext = createContext(null);

function useTree() {
  const ctx = useContext(TreeContext);
  if (!ctx) throw new Error('useTree must be used within <Tree>');
  return ctx;
}

/* ─── Helpers ────────────────────────────────────────────── */
const isFolder = (el) => el.type === 'folder' || Array.isArray(el.children);

function collectAllFolderIds(elements) {
  const ids = [];
  const walk = (el) => {
    if (isFolder(el)) {
      ids.push(el.id);
      el.children?.forEach(walk);
    }
  };
  elements.forEach(walk);
  return ids;
}

function expandToTarget(elements, targetId) {
  const path = [];
  const find = (el, trail) => {
    const next = [...trail, el.id];
    if (el.id === targetId) { path.push(...next); return true; }
    if (el.children) return el.children.some((c) => find(c, next));
    return false;
  };
  elements.forEach((el) => find(el, []));
  return path;
}

/* ─── Tree (root) ────────────────────────────────────────── */
export function Tree({
  elements = [],
  initialSelectedId,
  initialExpandedItems,
  onSelect,
  openIcon,
  closeIcon,
  className = '',
  children,
}) {
  const [selectedId, setSelectedId] = useState(initialSelectedId);
  const [expandedItems, setExpandedItems] = useState(
    () => initialExpandedItems || []
  );

  const selectItem = useCallback((id) => {
    setSelectedId(id);
    onSelect?.(id);
  }, [onSelect]);

  const toggleExpand = useCallback((id) => {
    setExpandedItems((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }, []);

  // auto-expand parents when initialSelectedId changes
  useEffect(() => {
    if (initialSelectedId && elements.length) {
      const path = expandToTarget(elements, initialSelectedId);
      if (path.length) {
        setExpandedItems((prev) => [...new Set([...prev, ...path])]);
      }
    }
  }, [initialSelectedId, elements]);

  const rendered = children || renderElements(elements);

  return (
    <TreeContext.Provider
      value={{ selectedId, expandedItems, toggleExpand, selectItem, openIcon, closeIcon, setExpandedItems }}
    >
      <div className={`file-tree ${className}`}>
        {rendered}
      </div>
    </TreeContext.Provider>
  );
}

/* ─── Folder ─────────────────────────────────────────────── */
export function TreeFolder({
  id,
  label,
  icon,
  isSelectable = true,
  children,
  className = '',
}) {
  const { selectedId, expandedItems, toggleExpand, selectItem, openIcon, closeIcon } = useTree();
  const isOpen = expandedItems.includes(id);
  const isSelected = selectedId === id;

  const triggerClass = [
    'file-tree__folder-trigger',
    isSelected && isSelectable && 'file-tree__folder-trigger--selected',
    !isSelectable && 'file-tree__folder-trigger--disabled',
  ].filter(Boolean).join(' ');

  const folderIcon = icon || (
    isOpen
      ? (openIcon || <ChevronDown className="file-tree__icon" />)
      : (closeIcon || <ChevronRight className="file-tree__icon" />)
  );

  return (
    <div className={`file-tree__folder ${className}`}>
      <button
        className={triggerClass}
        disabled={!isSelectable}
        onClick={() => {
          if (isSelectable) selectItem(id);
          toggleExpand(id);
        }}
      >
        {folderIcon}
        <span>{label}</span>
      </button>
      <div className={`file-tree__folder-content ${isOpen ? 'file-tree__folder-content--open' : ''}`}>
        <div className="file-tree__folder-content-inner">
          {children}
        </div>
      </div>
    </div>
  );
}

/* ─── File ───────────────────────────────────────────────── */
export function TreeFile({
  id,
  label,
  icon,
  isSelectable = true,
  onClick,
  className = '',
  children,
}) {
  const { selectedId, selectItem } = useTree();
  const isSelected = selectedId === id;

  const fileClass = [
    'file-tree__file',
    isSelected && isSelectable && 'file-tree__file--selected',
    !isSelectable && 'file-tree__file--disabled',
  ].filter(Boolean).join(' ');

  return (
    <button
      className={`${fileClass} ${className}`}
      disabled={!isSelectable}
      onClick={(e) => {
        if (isSelectable) selectItem(id);
        onClick?.(e);
      }}
    >
      {icon || <FileIcon className="file-tree__icon" />}
      {children || <span>{label}</span>}
    </button>
  );
}

/* ─── Collapse all / Expand all button ───────────────────── */
export function CollapseButton({ elements = [], expandAll = false, children, className = '' }) {
  const { expandedItems, setExpandedItems } = useTree();

  const allIds = collectAllFolderIds(elements);
  const isExpanded = expandedItems.length > 0;

  useEffect(() => {
    if (expandAll) setExpandedItems(allIds);
  }, [expandAll]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <button
      className={`file-tree__collapse-btn ${className}`}
      onClick={() => setExpandedItems(isExpanded ? [] : allIds)}
    >
      {children || (isExpanded ? 'Contraer todo' : 'Expandir todo')}
    </button>
  );
}

/* ─── Data-driven renderer ───────────────────────────────── */
function renderElements(elements) {
  return elements.map((el) => {
    if (isFolder(el)) {
      return (
        <TreeFolder key={el.id} id={el.id} label={el.name} isSelectable={el.isSelectable}>
          {el.children ? renderElements(el.children) : null}
        </TreeFolder>
      );
    }
    return (
      <TreeFile key={el.id} id={el.id} label={el.name} isSelectable={el.isSelectable} />
    );
  });
}
