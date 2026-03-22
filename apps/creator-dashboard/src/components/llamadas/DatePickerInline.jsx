import React, { useState, useMemo } from 'react';
import './DatePickerInline.css';

const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];
const DAY_NAMES = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'];

function toDateStr(d) {
  return d.toISOString().slice(0, 10);
}

export default function DatePickerInline({ onSelect, disabledDates = [] }) {
  const [viewDate, setViewDate] = useState(() => new Date());

  const todayStr = useMemo(() => toDateStr(new Date()), []);
  const disabledSet = useMemo(() => new Set(disabledDates), [disabledDates]);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  const calendarDays = useMemo(() => {
    const first = new Date(year, month, 1);
    const startDow = (first.getDay() + 6) % 7;
    const startDate = new Date(first);
    startDate.setDate(first.getDate() - startDow);
    const days = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(startDate);
      d.setDate(startDate.getDate() + i);
      days.push({
        date: d,
        day: d.getDate(),
        inMonth: d.getMonth() === month,
        dateStr: toDateStr(d),
      });
    }
    return days;
  }, [year, month]);

  const weeks = useMemo(() => {
    const w = [];
    for (let i = 0; i < calendarDays.length; i += 7) {
      w.push(calendarDays.slice(i, i + 7));
    }
    return w;
  }, [calendarDays]);

  const handleSelect = (dateStr) => {
    if (dateStr < todayStr) return;
    onSelect(dateStr);
  };

  return (
    <div className="dpi-calendar">
      <div className="dpi-nav">
        <button
          type="button"
          className="dpi-nav-btn"
          onClick={() => setViewDate(new Date(year, month - 1, 1))}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M15 18L9 12L15 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <span className="dpi-nav-label">{MONTHS[month]} {year}</span>
        <button
          type="button"
          className="dpi-nav-btn"
          onClick={() => setViewDate(new Date(year, month + 1, 1))}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M9 18L15 12L9 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
      <div className="dpi-weekdays">
        {DAY_NAMES.map((d) => (
          <span key={d} className="dpi-weekday">{d}</span>
        ))}
      </div>
      <div className="dpi-days">
        {weeks.map((week, wi) => (
          <div key={wi} className="dpi-week">
            {week.map((cell) => {
              const isPast = cell.dateStr < todayStr;
              const isDisabled = disabledSet.has(cell.dateStr);
              const isToday = cell.dateStr === todayStr;
              return (
                <button
                  key={cell.dateStr}
                  type="button"
                  className={[
                    'dpi-day',
                    !cell.inMonth && 'dpi-day--other',
                    isPast && 'dpi-day--past',
                    isDisabled && 'dpi-day--blocked',
                    isToday && 'dpi-day--today',
                  ].filter(Boolean).join(' ')}
                  onClick={() => handleSelect(cell.dateStr)}
                  disabled={isPast}
                  title={isDisabled ? 'Bloqueado' : undefined}
                >
                  {cell.day}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
