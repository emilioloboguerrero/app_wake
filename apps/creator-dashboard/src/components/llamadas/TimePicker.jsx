import React, { useState, useRef, useEffect, useCallback } from 'react';
import './TimePicker.css';

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = [0, 15, 30, 45];

function pad(n) {
  return String(n).padStart(2, '0');
}

export default function TimePicker({ value, onChange, label }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const hoursRef = useRef(null);

  const [h, m] = (value || '09:00').split(':').map(Number);

  const handleSelect = useCallback((hour, minute) => {
    onChange(`${pad(hour)}:${pad(minute)}`);
    setOpen(false);
  }, [onChange]);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  // Scroll to current hour when opening
  useEffect(() => {
    if (open && hoursRef.current) {
      const activeEl = hoursRef.current.querySelector('.tp-hour--active');
      if (activeEl) activeEl.scrollIntoView({ block: 'center', behavior: 'instant' });
    }
  }, [open]);

  return (
    <div className="tp-wrap" ref={ref}>
      {label && <span className="tp-label">{label}</span>}
      <button
        type="button"
        className="tp-trigger"
        onClick={() => setOpen((v) => !v)}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="tp-icon">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
          <path d="M12 6v6l4 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <span className="tp-value">{pad(h)}:{pad(m)}</span>
      </button>
      {open && (
        <div className="tp-dropdown">
          <div className="tp-columns">
            <div className="tp-col" ref={hoursRef}>
              <span className="tp-col-label">Hora</span>
              <div className="tp-col-scroll">
                {HOURS.map((hour) => (
                  <button
                    key={hour}
                    type="button"
                    className={`tp-hour ${hour === h ? 'tp-hour--active' : ''}`}
                    onClick={() => handleSelect(hour, m)}
                  >
                    {pad(hour)}
                  </button>
                ))}
              </div>
            </div>
            <div className="tp-col">
              <span className="tp-col-label">Min</span>
              <div className="tp-col-scroll">
                {MINUTES.map((minute) => (
                  <button
                    key={minute}
                    type="button"
                    className={`tp-min ${minute === m ? 'tp-min--active' : ''}`}
                    onClick={() => handleSelect(h, minute)}
                  >
                    {pad(minute)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
