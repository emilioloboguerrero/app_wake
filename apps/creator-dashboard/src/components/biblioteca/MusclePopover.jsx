import { useState, useEffect, useRef, useCallback } from 'react';
import { MUSCLE_DISPLAY_NAMES } from '../../constants/exerciseConstants';

export default function MusclePopover({ muscleId, value, position, onChangeValue, onRemove, onClose }) {
  const [localValue, setLocalValue] = useState(value);
  const ref = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    setLocalValue(value);
  }, [value, muscleId]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [muscleId]);

  // Close on outside click or Escape
  useEffect(() => {
    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  const handleSliderChange = useCallback((e) => {
    const v = parseInt(e.target.value, 10);
    setLocalValue(v);
    onChangeValue(muscleId, v);
  }, [muscleId, onChangeValue]);

  const muscleName = MUSCLE_DISPLAY_NAMES[muscleId] || muscleId;

  return (
    <div
      ref={ref}
      className="lex-muscle-popover"
      style={{ top: position.y, left: position.x }}
    >
      <div className="lex-muscle-popover-header">
        <span className="lex-muscle-popover-name">{muscleName}</span>
        <button
          className="lex-muscle-popover-remove"
          onClick={() => onRemove(muscleId)}
          title="Quitar músculo"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </button>
      </div>
      <div className="lex-muscle-popover-slider-row">
        <input
          ref={inputRef}
          type="range"
          min="0"
          max="100"
          step="1"
          value={localValue}
          onChange={handleSliderChange}
          className="lex-muscle-popover-slider"
        />
        <span className="lex-muscle-popover-value">{localValue}</span>
      </div>
    </div>
  );
}
