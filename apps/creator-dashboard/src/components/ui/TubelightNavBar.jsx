import { useState, useId } from 'react';
import { motion, LayoutGroup } from 'motion/react';
import './TubelightNavBar.css';

export default function TubelightNavBar({ items, activeId, onSelect, orientation = 'horizontal' }) {
  const [hovered, setHovered] = useState(null);
  const instanceId = useId();

  return (
    <LayoutGroup id={instanceId}>
      <nav
        className={`tubelight-nav tubelight-nav--${orientation}`}
        onMouseLeave={() => setHovered(null)}
      >
        {items.map((item) => {
          const isActive = item.id === activeId;
          const isHovered = item.id === hovered;

          return (
            <button
              key={item.id}
              className={`tubelight-item ${isActive ? 'tubelight-item--active' : ''}`}
              onClick={() => onSelect(item.id)}
              onMouseEnter={() => setHovered(item.id)}
              aria-current={isActive ? 'page' : undefined}
            >
              {item.icon && (
                <span className="tubelight-item-icon">{item.icon}</span>
              )}
              <span className="tubelight-item-label">{item.label}</span>

              {!isActive && item.badge != null && item.badge > 0 && (
                <span className="tubelight-badge">{item.badge}</span>
              )}

              {isActive && (
                <motion.div
                  layoutId="tubelight-indicator"
                  className="tubelight-indicator"
                  transition={{ type: 'spring', stiffness: 380, damping: 36 }}
                />
              )}

              {(isHovered || isActive) && (
                <motion.div
                  layoutId="tubelight-glow"
                  className="tubelight-glow"
                  transition={{ type: 'spring', stiffness: 380, damping: 36 }}
                />
              )}
            </button>
          );
        })}
      </nav>
    </LayoutGroup>
  );
}
