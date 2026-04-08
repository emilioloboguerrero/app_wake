import { useState } from 'react';
import { Square, Pause, Play, Pen, Eraser, Trash2 } from 'lucide-react';
import './ReactionToolbar.css';

const COLORS = [
  { id: 'red', value: '#ef4444' },
  { id: 'yellow', value: '#facc15' },
  { id: 'green', value: '#22c55e' },
  { id: 'white', value: '#ffffff' },
];

const WIDTHS = [
  { id: 'thin', value: 2, size: 6 },
  { id: 'medium', value: 4, size: 10 },
  { id: 'thick', value: 8, size: 14 },
];

const MODES = [
  { id: 'pointer', label: 'Puntero' },
  { id: 'permanent', label: 'Permanente' },
];

export default function ReactionToolbar({
  elapsed,
  maxDuration,
  isPaused,
  activeTool,
  strokeColor,
  strokeWidth,
  drawingMode,
  onStop,
  onTogglePause,
  onToolChange,
  onColorChange,
  onWidthChange,
  onModeChange,
  onClearAll,
}) {
  const [showPenMenu, setShowPenMenu] = useState(false);

  const progress = Math.min(elapsed / maxDuration, 1);
  const remaining = maxDuration - elapsed;
  const showTime = remaining <= 60;

  const formatTime = (s) => {
    const m = Math.floor(s / 60).toString().padStart(2, '0');
    const sec = (s % 60).toString().padStart(2, '0');
    return `${m}:${sec}`;
  };

  // SVG circle progress
  const r = 16;
  const circumference = 2 * Math.PI * r;
  const dashOffset = circumference * (1 - progress);

  return (
    <div className="rt-toolbar">
      {/* Circular progress / timer */}
      <div className="rt-timer">
        <svg width="40" height="40" viewBox="0 0 40 40">
          <circle
            cx="20" cy="20" r={r}
            fill="none"
            stroke="rgba(255,255,255,0.1)"
            strokeWidth="3"
          />
          <circle
            cx="20" cy="20" r={r}
            fill="none"
            stroke={remaining <= 60 ? '#ef4444' : 'rgba(255,255,255,0.5)'}
            strokeWidth="3"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
            transform="rotate(-90 20 20)"
            style={{ transition: 'stroke-dashoffset 0.3s ease' }}
          />
        </svg>
        {showTime && (
          <span className="rt-timer-text">{formatTime(remaining)}</span>
        )}
      </div>

      {/* Stop & save */}
      <button className="rt-btn rt-btn--stop" onClick={onStop} title="Detener y guardar">
        <Square size={16} />
      </button>

      {/* Pause */}
      <button className="rt-btn" onClick={onTogglePause} title={isPaused ? 'Reanudar video' : 'Pausar video'}>
        {isPaused ? <Play size={16} /> : <Pause size={16} />}
      </button>

      <div className="rt-divider" />

      {/* Pen tool */}
      <div
        className="rt-pen-wrapper"
        onMouseEnter={() => activeTool === 'pen' && setShowPenMenu(true)}
        onMouseLeave={() => setShowPenMenu(false)}
      >
        <button
          className={`rt-btn ${activeTool === 'pen' ? 'rt-btn--active' : ''}`}
          onClick={() => {
            const next = activeTool === 'pen' ? null : 'pen';
            onToolChange(next);
            setShowPenMenu(next === 'pen');
          }}
          title="Dibujar"
        >
          <Pen size={16} />
        </button>

        {showPenMenu && (
          <div className="rt-pen-menu">
            {/* Stroke width */}
            <div className="rt-pen-section">
              <span className="rt-pen-label">Grosor</span>
              <div className="rt-pen-row">
                {WIDTHS.map((w) => (
                  <button
                    key={w.id}
                    className={`rt-width-btn ${strokeWidth === w.value ? 'rt-width-btn--active' : ''}`}
                    onClick={() => onWidthChange(w.value)}
                  >
                    <span
                      className="rt-width-dot"
                      style={{ width: w.size, height: w.size, background: strokeColor }}
                    />
                  </button>
                ))}
              </div>
            </div>

            {/* Mode */}
            <div className="rt-pen-section">
              <span className="rt-pen-label">Modo</span>
              <div className="rt-pen-row">
                {MODES.map((m) => (
                  <button
                    key={m.id}
                    className={`rt-mode-btn ${drawingMode === m.id ? 'rt-mode-btn--active' : ''}`}
                    onClick={() => onModeChange(m.id)}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Colors */}
            <div className="rt-pen-section">
              <span className="rt-pen-label">Color</span>
              <div className="rt-pen-row">
                {COLORS.map((c) => (
                  <button
                    key={c.id}
                    className={`rt-color-btn ${strokeColor === c.value ? 'rt-color-btn--active' : ''}`}
                    onClick={() => onColorChange(c.value)}
                  >
                    <span className="rt-color-swatch" style={{ background: c.value }} />
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Eraser */}
      <button
        className={`rt-btn ${activeTool === 'eraser' ? 'rt-btn--active' : ''}`}
        onClick={() => onToolChange(activeTool === 'eraser' ? null : 'eraser')}
        title="Borrador"
      >
        <Eraser size={16} />
      </button>

      {/* Clear all */}
      <button className="rt-btn" onClick={onClearAll} title="Borrar todo">
        <Trash2 size={16} />
      </button>
    </div>
  );
}
