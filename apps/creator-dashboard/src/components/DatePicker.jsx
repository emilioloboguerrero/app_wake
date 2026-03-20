import React, { useState, useRef, useEffect, useMemo } from 'react';
import './DatePicker.css';

const DatePicker = ({ value, onChange, error, max, placeholder, disabled, allowFuture }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(value ? new Date(value) : null);
  const [currentMonth, setCurrentMonth] = useState(() => {
    if (value) return new Date(value);
    if (max) return new Date(max);
    const today = new Date();
    if (allowFuture) return new Date(today.getFullYear(), today.getMonth(), 1);
    return new Date(today.getFullYear() - 13, today.getMonth(), 1);
  });
  const containerRef = useRef(null);

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const maxDate = useMemo(() => {
    const d = max
      ? new Date(max)
      : allowFuture
        ? new Date(new Date().getFullYear() + 5, 11, 31)
        : new Date(today.getFullYear() - 13, today.getMonth(), today.getDate());
    d.setHours(23, 59, 59, 999);
    return d;
  }, [max, allowFuture, today]);
  const minDate = useRef(allowFuture ? new Date(2020, 0, 1) : new Date(1900, 0, 1));

  const prevValueRef = useRef(value);
  useEffect(() => {
    if (prevValueRef.current !== value) {
      prevValueRef.current = value;
      if (value) {
        const [y, m, d] = value.split('-');
        const dateValue = new Date(parseInt(y), parseInt(m) - 1, parseInt(d), 12, 0, 0);
        setSelectedDate(dateValue);
        setCurrentMonth(new Date(dateValue.getFullYear(), dateValue.getMonth(), 1));
      } else {
        setSelectedDate(null);
        setCurrentMonth(new Date(maxDate.getFullYear(), maxDate.getMonth(), 1));
      }
    }
  }, [value]);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const close = (e) => {
      const popup = containerRef.current?.querySelector('.date-picker-popup');
      if (popup?.contains(e.target)) return;
      setIsOpen(false);
    };
    const id = setTimeout(() => document.addEventListener('mousedown', close), 0);
    return () => { clearTimeout(id); document.removeEventListener('mousedown', close); };
  }, [isOpen]);

  const formatDate = (dateString) => {
    if (!dateString) return '';
    if (typeof dateString === 'string' && dateString.includes('-')) {
      const [year, month, day] = dateString.split('-');
      return `${day}/${month}/${year}`;
    }
    if (dateString instanceof Date) {
      const year = dateString.getFullYear();
      const month = String(dateString.getMonth() + 1).padStart(2, '0');
      const day = String(dateString.getDate()).padStart(2, '0');
      return `${day}/${month}/${year}`;
    }
    return '';
  };

  const handleOpen = () => {
    if (!disabled) setIsOpen(true);
  };

  const handleDateClick = (day) => {
    const newDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
    newDate.setHours(12, 0, 0, 0);
    setSelectedDate(newDate);
    const year = newDate.getFullYear();
    const month = String(newDate.getMonth() + 1).padStart(2, '0');
    const dayStr = String(newDate.getDate()).padStart(2, '0');
    onChange({ target: { value: `${year}-${month}-${dayStr}` } });
    setIsOpen(false);
  };

  const handlePrevMonth = (e) => {
    e.stopPropagation();
    const newDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1);
    if (newDate < new Date(minDate.current.getFullYear(), minDate.current.getMonth(), 1)) return;
    setCurrentMonth(newDate);
  };

  const handleNextMonth = (e) => {
    e.stopPropagation();
    const newDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1);
    if (newDate > new Date(maxDate.getFullYear(), maxDate.getMonth(), 1)) return;
    setCurrentMonth(newDate);
  };

  const handleMonthYearSelect = (e) => {
    e.stopPropagation();
    const [month, year] = e.target.value.split('-');
    setCurrentMonth(new Date(parseInt(year), parseInt(month), 1));
  };

  const getDaysInMonth = () =>
    new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate();

  const getFirstDayOfMonth = () =>
    new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1).getDay();

  const isDisabled = (day) => {
    const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
    date.setHours(0, 0, 0, 0);
    if (allowFuture) return date > maxDate || date < minDate.current;
    return date > maxDate || date < minDate.current || date > today;
  };

  const isSelected = (day) => {
    if (!selectedDate) return false;
    return (
      day === selectedDate.getDate() &&
      currentMonth.getMonth() === selectedDate.getMonth() &&
      currentMonth.getFullYear() === selectedDate.getFullYear()
    );
  };

  const isToday = (day) => {
    const d = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
    const t = today;
    return d.getDate() === t.getDate() && d.getMonth() === t.getMonth() && d.getFullYear() === t.getFullYear();
  };

  const monthNames = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];
  const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

  // Build month-year options
  const monthYearOptions = [];
  const startYear = minDate.current.getFullYear();
  const endYear = maxDate.getFullYear();
  const minMonthDate = new Date(minDate.current.getFullYear(), minDate.current.getMonth(), 1);
  const maxMonthDate = new Date(maxDate.getFullYear(), maxDate.getMonth(), 1);
  for (let year = startYear; year <= endYear; year++) {
    for (let month = 0; month < 12; month++) {
      const d = new Date(year, month, 1);
      if (d < minMonthDate || d > maxMonthDate) continue;
      monthYearOptions.push({ value: `${month}-${year}`, label: `${monthNames[month]} ${year}` });
    }
  }

  const currentSelectValue = `${currentMonth.getMonth()}-${currentMonth.getFullYear()}`;
  const canGoPrev = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1) >= minMonthDate;
  const canGoNext = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1) <= maxMonthDate;

  const days = [];
  const firstDay = getFirstDayOfMonth();
  const daysInMonth = getDaysInMonth();
  for (let i = 0; i < firstDay; i++) days.push(null);
  for (let day = 1; day <= daysInMonth; day++) days.push(day);

  return (
    <div className="date-picker-wrapper" ref={containerRef}>
      <div
        className={`date-picker-input ${value ? 'has-value' : ''} ${error ? 'has-error' : ''}`}
        onClick={handleOpen}
      >
        <span className={value ? '' : 'placeholder'}>
          {value ? formatDate(value) : (placeholder || 'Selecciona tu fecha de nacimiento')}
        </span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2">
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      </div>

      {isOpen && (
        <>
          <div className="date-picker-overlay" onClick={() => setIsOpen(false)} />
          <div className="date-picker-popup">
            {/* Header: prev arrow · month-year select · next arrow */}
            <div className="date-picker-header">
              <button
                type="button"
                className="date-picker-nav-btn"
                onClick={handlePrevMonth}
                disabled={!canGoPrev}
                aria-label="Mes anterior"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 18L9 12L15 6" />
                </svg>
              </button>
              <select
                className="date-picker-month-year-select"
                value={currentSelectValue}
                onChange={handleMonthYearSelect}
                onClick={e => e.stopPropagation()}
              >
                {monthYearOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <button
                type="button"
                className="date-picker-nav-btn"
                onClick={handleNextMonth}
                disabled={!canGoNext}
                aria-label="Mes siguiente"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 18L15 12L9 6" />
                </svg>
              </button>
            </div>

            <div className="date-picker-weekdays">
              {dayNames.map(day => (
                <div key={day} className="date-picker-weekday">{day}</div>
              ))}
            </div>

            <div className="date-picker-days">
              {days.map((day, idx) => {
                if (day === null) {
                  return <div key={`empty-${idx}`} className="date-picker-day empty" />;
                }
                const dis = isDisabled(day);
                const sel = isSelected(day);
                const tod = isToday(day);
                return (
                  <button
                    key={day}
                    type="button"
                    className={`date-picker-day${sel ? ' selected' : ''}${dis ? ' disabled' : ''}${tod ? ' today' : ''}`}
                    onClick={() => !dis && handleDateClick(day)}
                    disabled={dis}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}

      {error && <div className="date-picker-error-text">{error}</div>}
    </div>
  );
};

export default DatePicker;
