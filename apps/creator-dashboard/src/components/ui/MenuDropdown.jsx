import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import './MenuDropdown.css';

export default function MenuDropdown({ trigger, items }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 'auto', right: 'auto' });
  const containerRef = useRef(null);
  const menuRef = useRef(null);

  const updatePosition = useCallback(() => {
    if (!containerRef.current || !menuRef.current) return;
    const triggerRect = containerRef.current.getBoundingClientRect();
    const menuRect = menuRef.current.getBoundingClientRect();
    const vp = { w: window.innerWidth, h: window.innerHeight };

    const gap = 6;
    let top;
    let transformOriginY = 'top';

    if (triggerRect.bottom + gap + menuRect.height > vp.h) {
      top = triggerRect.top - menuRect.height - gap;
      transformOriginY = 'bottom';
    } else {
      top = triggerRect.bottom + gap;
    }

    // Clamp top so the menu never goes off-screen
    top = Math.max(8, Math.min(top, vp.h - menuRect.height - 8));

    let left = 'auto';
    let right = 'auto';

    if (triggerRect.right + 8 >= vp.w - menuRect.width) {
      right = vp.w - triggerRect.right;
    } else {
      left = triggerRect.left;
    }

    setPosition({ top, left, right, transformOrigin: `${transformOriginY} right` });
  }, []);

  useEffect(() => {
    if (!open) return;
    updatePosition();

    const onKeyDown = (e) => { if (e.key === 'Escape') setOpen(false); };
    const onClickOut = (e) => {
      if (!containerRef.current?.contains(e.target) && !menuRef.current?.contains(e.target)) {
        setOpen(false);
      }
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onClickOut);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onClickOut);
    };
  }, [open, updatePosition]);

  return (
    <div ref={containerRef} className="menu-dropdown-trigger" onClick={() => setOpen(v => !v)}>
      {trigger}

      {open && createPortal(
        <div
          ref={menuRef}
          className="menu-dropdown"
          style={{
            top: position.top,
            left: position.left !== 'auto' ? position.left : undefined,
            right: position.right !== 'auto' ? position.right : undefined,
            transformOrigin: position.transformOrigin,
          }}
          role="menu"
          onClick={(e) => e.stopPropagation()}
        >
          {items.map((item, i) => {
            if (item.divider) {
              return <div key={i} className="menu-dropdown-divider" role="separator" />;
            }
            return (
              <button
                key={i}
                className={`menu-dropdown-item ${item.danger ? 'menu-dropdown-item--danger' : ''}`}
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  item.onClick?.();
                }}
              >
                {item.icon && <span className="menu-dropdown-item-icon">{item.icon}</span>}
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>,
        document.body
      )}
    </div>
  );
}
