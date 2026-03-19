import { useState, useEffect, useRef, useCallback } from 'react';
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

    const top = triggerRect.bottom + 6;
    let left = 'auto';
    let right = 'auto';

    if (triggerRect.right + 8 >= vp.w - menuRect.width) {
      right = vp.w - triggerRect.right;
    } else {
      left = triggerRect.left;
    }

    setPosition({ top, left, right });
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

      {open && (
        <div
          ref={menuRef}
          className="menu-dropdown"
          style={{
            top: position.top,
            left: position.left !== 'auto' ? position.left : undefined,
            right: position.right !== 'auto' ? position.right : undefined,
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
        </div>
      )}
    </div>
  );
}
