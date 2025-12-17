import React, { useState, useRef, useEffect } from 'react';
import './DatePicker.css';

const DatePicker = ({ value, onChange, error, max, placeholder, disabled }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(value ? new Date(value) : null);
  const [currentMonth, setCurrentMonth] = useState(() => {
    if (value) {
      return new Date(value);
    }
    if (max) {
      return new Date(max);
    }
    const today = new Date();
    return new Date(today.getFullYear() - 13, today.getMonth(), 1);
  });
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [showYearPicker, setShowYearPicker] = useState(false);
  const containerRef = useRef(null);
  const monthButtonRef = useRef(null);
  const yearButtonRef = useRef(null);
  const monthDropdownRef = useRef(null);
  const yearDropdownRef = useRef(null);

  // Calculate dates - memoize to prevent unnecessary recalculations
  const today = useRef(new Date());
  today.current.setHours(0, 0, 0, 0);
  const maxDate = useRef(max ? new Date(max) : new Date(today.current.getFullYear() - 13, today.current.getMonth(), today.current.getDate()));
  maxDate.current.setHours(23, 59, 59, 999);
  const minDate = useRef(new Date(1900, 0, 1));

  // Only update currentMonth when value prop actually changes from outside
  // Don't reset when user is interacting with the picker
  const prevValueRef = useRef(value);
  useEffect(() => {
    // Only update if value prop changed from outside (not from user interaction)
    if (prevValueRef.current !== value) {
      prevValueRef.current = value;
    if (value) {
        // Parse YYYY-MM-DD string and create date at noon to avoid timezone issues
        const dateParts = value.split('-');
        const dateValue = new Date(parseInt(dateParts[0]), parseInt(dateParts[1]) - 1, parseInt(dateParts[2]), 12, 0, 0);
        setSelectedDate(dateValue);
        setCurrentMonth(new Date(dateValue.getFullYear(), dateValue.getMonth(), 1));
      } else {
        setSelectedDate(null);
        const maxDateValue = maxDate.current;
        setCurrentMonth(new Date(maxDateValue.getFullYear(), maxDateValue.getMonth(), 1));
      }
    }
  }, [value]);

  // Handle clicks outside
  useEffect(() => {
    if (!isOpen) return;

    const handleDocumentClick = (e) => {
      // Check if click is on month button or dropdown
      if (monthButtonRef.current?.contains(e.target) || monthDropdownRef.current?.contains(e.target)) {
        return;
      }
      // Check if click is on year button or dropdown
      if (yearButtonRef.current?.contains(e.target) || yearDropdownRef.current?.contains(e.target)) {
        return;
      }
      // Check if click is inside the popup (but not on buttons/dropdowns)
      const popup = containerRef.current?.querySelector('.date-picker-popup');
      if (popup && popup.contains(e.target)) {
        // Close dropdowns but keep popup open
        setShowMonthPicker(false);
        setShowYearPicker(false);
        return;
      }
      // Click outside - close everything
      setIsOpen(false);
      setShowMonthPicker(false);
      setShowYearPicker(false);
    };

    // Use setTimeout to ensure this runs after React's event handlers
    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleDocumentClick);
    }, 0);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', handleDocumentClick);
    };
  }, [isOpen, showMonthPicker, showYearPicker]);

  const formatDate = (dateString) => {
    if (!dateString) return '';
    // Parse YYYY-MM-DD string directly to avoid timezone issues
    if (typeof dateString === 'string' && dateString.includes('-')) {
      const [year, month, day] = dateString.split('-');
      return `${day}/${month}/${year}`;
    }
    // Fallback for Date objects
    if (dateString instanceof Date) {
      const year = dateString.getFullYear();
      const month = String(dateString.getMonth() + 1).padStart(2, '0');
      const day = String(dateString.getDate()).padStart(2, '0');
      return `${day}/${month}/${year}`;
    }
    return '';
  };

  const handleOpen = () => {
    if (!disabled) {
      setIsOpen(true);
      if (!selectedDate) {
        setSelectedDate(new Date(maxDate.current));
      }
    }
  };

  const handleDateClick = (day) => {
    const newDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
    // Set to noon to avoid timezone issues when converting to ISO string
    newDate.setHours(12, 0, 0, 0);
    setSelectedDate(newDate);
    
    // Format date as YYYY-MM-DD without timezone conversion issues
    const year = newDate.getFullYear();
    const month = String(newDate.getMonth() + 1).padStart(2, '0');
    const dayStr = String(newDate.getDate()).padStart(2, '0');
    const dateString = `${year}-${month}-${dayStr}`;
    
      onChange({ target: { value: dateString } });
      setIsOpen(false);
  };

  const handleMonthSelect = (monthIndex) => {
    // Create a new date object with the selected month
    const newYear = currentMonth.getFullYear();
    let newMonthDate = new Date(newYear, monthIndex, 1);
    
    // Clamp to valid range
    if (newMonthDate.getTime() > maxDate.current.getTime()) {
      newMonthDate = new Date(maxDate.current.getFullYear(), maxDate.current.getMonth(), 1);
    } else if (newMonthDate.getTime() < minDate.current.getTime()) {
      newMonthDate = new Date(minDate.current.getFullYear(), minDate.current.getMonth(), 1);
    }
    
    // Force a new object reference to ensure React detects the change
    setCurrentMonth(new Date(newMonthDate.getTime()));
    setShowMonthPicker(false);
  };

  const handleYearSelect = (year) => {
    // Create a new date object with the selected year
    const currentMonthIndex = currentMonth.getMonth();
    let newMonthDate = new Date(year, currentMonthIndex, 1);
    
    // Clamp to valid range
    if (newMonthDate.getTime() > maxDate.current.getTime()) {
      newMonthDate = new Date(maxDate.current.getFullYear(), maxDate.current.getMonth(), 1);
    } else if (newMonthDate.getTime() < minDate.current.getTime()) {
      newMonthDate = new Date(minDate.current.getFullYear(), minDate.current.getMonth(), 1);
    }
    
    // Force a new object reference to ensure React detects the change
    setCurrentMonth(new Date(newMonthDate.getTime()));
    setShowYearPicker(false);
  };

  const getAvailableYears = () => {
    const years = [];
    for (let year = maxDate.current.getFullYear(); year >= minDate.current.getFullYear(); year--) {
      years.push(year);
    }
    return years;
  };

  const getDaysInMonth = () => {
    return new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate();
  };

  const getFirstDayOfMonth = () => {
    return new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1).getDay();
  };

  const isDisabled = (day) => {
    const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
    date.setHours(0, 0, 0, 0);
    return date > maxDate.current || date < minDate.current || date > today.current;
  };

  const isSelected = (day) => {
    if (!selectedDate) return false;
    return (
      day === selectedDate.getDate() &&
      currentMonth.getMonth() === selectedDate.getMonth() &&
      currentMonth.getFullYear() === selectedDate.getFullYear()
    );
  };

  const monthNames = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];

  const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

  const days = [];
  const firstDay = getFirstDayOfMonth();
  const daysInMonth = getDaysInMonth();

  for (let i = 0; i < firstDay; i++) {
    days.push(null);
  }
  for (let day = 1; day <= daysInMonth; day++) {
    days.push(day);
  }

  return (
    <div className="date-picker-wrapper" ref={containerRef}>
      <div
        className={`date-picker-input ${value ? 'has-value' : ''} ${error ? 'has-error' : ''}`}
        onClick={handleOpen}
      >
        <span className={value ? '' : 'placeholder'}>
          {value ? formatDate(value) : (placeholder || 'Selecciona tu fecha de nacimiento')}
        </span>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="2">
          <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>

      {isOpen && (
        <>
          <div 
            className="date-picker-overlay" 
            onClick={() => {
              setIsOpen(false);
              setShowMonthPicker(false);
              setShowYearPicker(false);
            }} 
          />
          <div className="date-picker-popup">
            <div className="date-picker-header">
              <div className="date-picker-month-year">
                <div className="date-picker-select-wrapper">
                  <button 
                    ref={monthButtonRef}
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowMonthPicker(!showMonthPicker);
                      setShowYearPicker(false);
                    }}
                    type="button" 
                    className={`date-picker-month-btn ${showMonthPicker ? 'active' : ''}`}
                  >
                    {monthNames[currentMonth.getMonth()]}
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                  {showMonthPicker && (
                    <div 
                      ref={monthDropdownRef}
                      className="date-picker-dropdown"
                    >
                      {monthNames.map((month, idx) => {
                        const monthDate = new Date(currentMonth.getFullYear(), idx, 1);
                        const maxMonthDate = new Date(maxDate.current.getFullYear(), maxDate.current.getMonth(), 1);
                        const minMonthDate = new Date(minDate.current.getFullYear(), minDate.current.getMonth(), 1);
                        const disabled = monthDate > maxMonthDate || monthDate < minMonthDate;
                        const isCurrentMonth = idx === currentMonth.getMonth();
                        
                        return (
                          <button
                            key={idx}
                            className={`date-picker-dropdown-item ${isCurrentMonth ? 'selected' : ''} ${disabled ? 'disabled' : ''}`}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              if (!disabled) {
                                handleMonthSelect(idx);
                              }
                            }}
                            disabled={disabled}
                            type="button"
                          >
                            {month}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
                <div className="date-picker-select-wrapper">
                  <button 
                    ref={yearButtonRef}
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowYearPicker(!showYearPicker);
                      setShowMonthPicker(false);
                    }}
                    type="button" 
                    className={`date-picker-year-btn ${showYearPicker ? 'active' : ''}`}
                  >
                    {currentMonth.getFullYear()}
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                  {showYearPicker && (
                    <div 
                      ref={yearDropdownRef}
                      className="date-picker-dropdown year-dropdown"
                    >
                      {getAvailableYears().map((year) => {
                        const yearDate = new Date(year, currentMonth.getMonth(), 1);
                        const maxYearDate = new Date(maxDate.current.getFullYear(), maxDate.current.getMonth(), 1);
                        const minYearDate = new Date(minDate.current.getFullYear(), minDate.current.getMonth(), 1);
                        const disabled = yearDate > maxYearDate || yearDate < minYearDate;
                        const isCurrentYear = year === currentMonth.getFullYear();
                        
                        return (
                          <button
                            key={year}
                            className={`date-picker-dropdown-item ${isCurrentYear ? 'selected' : ''} ${disabled ? 'disabled' : ''}`}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              if (!disabled) {
                                handleYearSelect(year);
                              }
                            }}
                            disabled={disabled}
                            type="button"
                          >
                            {year}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
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
                const disabled = isDisabled(day);
                const selected = isSelected(day);
                return (
                  <button
                    key={day}
                    className={`date-picker-day ${selected ? 'selected' : ''} ${disabled ? 'disabled' : ''}`}
                    onClick={() => !disabled && handleDateClick(day)}
                    disabled={disabled}
                    type="button"
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
