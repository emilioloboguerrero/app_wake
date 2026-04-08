import { useRef, useEffect, useState } from 'react';
import './TimeRangeSelector.css';

export default function TimeRangeSelector({ ranges, activeId, onChange }) {
  const containerRef = useRef(null);
  const [indicatorStyle, setIndicatorStyle] = useState({});

  useEffect(() => {
    if (!containerRef.current) return;
    const activeBtn = containerRef.current.querySelector(`[data-id="${activeId}"]`);
    if (activeBtn) {
      setIndicatorStyle({
        left: activeBtn.offsetLeft,
        width: activeBtn.offsetWidth,
      });
    }
  }, [activeId]);

  return (
    <div className="trs-container" ref={containerRef}>
      <div className="trs-indicator" style={indicatorStyle} />
      {ranges.map((r) => (
        <button
          key={r.id}
          data-id={r.id}
          className={`trs-btn ${r.id === activeId ? 'trs-btn--active' : ''}`}
          onClick={() => onChange(r.id)}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}
