import { ChevronLeft, ChevronRight } from 'lucide-react';
import './WeekNavigator.css';

export default function WeekNavigator({
  currentWeek,
  totalWeeks,
  label,
  onPrevious,
  onNext,
  onToday,
  showToday = true,
}) {
  return (
    <div className="wn-container">
      <button
        className="wn-btn"
        onClick={onPrevious}
        disabled={currentWeek <= 1}
        aria-label="Semana anterior"
      >
        <ChevronLeft size={16} />
      </button>

      <div className="wn-label-group">
        <span className="wn-label">{label || `Semana ${currentWeek}`}</span>
        {totalWeeks && (
          <span className="wn-total">de {totalWeeks}</span>
        )}
      </div>

      <button
        className="wn-btn"
        onClick={onNext}
        disabled={totalWeeks && currentWeek >= totalWeeks}
        aria-label="Semana siguiente"
      >
        <ChevronRight size={16} />
      </button>

      {showToday && onToday && (
        <button className="wn-today" onClick={onToday}>
          Hoy
        </button>
      )}
    </div>
  );
}
