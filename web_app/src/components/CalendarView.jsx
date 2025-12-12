import React, { useState } from 'react';
import './CalendarView.css';

const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

const DAYS_OF_WEEK = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

const CalendarView = ({ onDateSelect }) => {
  const today = new Date();
  const [currentDate, setCurrentDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(null);

  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth();

  // Get first day of month and number of days
  const firstDayOfMonth = new Date(currentYear, currentMonth, 1);
  const lastDayOfMonth = new Date(currentYear, currentMonth + 1, 0);
  const daysInMonth = lastDayOfMonth.getDate();
  // Convert Sunday (0) to 6, Monday (1) to 0, etc. so Monday is first
  const startingDayOfWeek = (firstDayOfMonth.getDay() + 6) % 7;

  // Generate calendar days
  const calendarDays = [];
  
  // Add empty cells for days before the first day of the month
  for (let i = 0; i < startingDayOfWeek; i++) {
    calendarDays.push(null);
  }
  
  // Add all days of the month
  for (let day = 1; day <= daysInMonth; day++) {
    calendarDays.push(day);
  }

  const handlePrevMonth = () => {
    setCurrentDate(new Date(currentYear, currentMonth - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(currentYear, currentMonth + 1, 1));
  };

  const handleMonthYearChange = (e) => {
    const [monthStr, yearStr] = e.target.value.split('-');
    const newMonth = parseInt(monthStr);
    const newYear = parseInt(yearStr);
    setCurrentDate(new Date(newYear, newMonth, 1));
  };

  const handleDateClick = (day) => {
    if (day === null) return;
    const date = new Date(currentYear, currentMonth, day);
    setSelectedDate(date);
    if (onDateSelect) {
      onDateSelect(date);
    }
  };

  const isToday = (day) => {
    if (day === null) return false;
    const today = new Date();
    return (
      day === today.getDate() &&
      currentMonth === today.getMonth() &&
      currentYear === today.getFullYear()
    );
  };

  const isSelected = (day) => {
    if (day === null || !selectedDate) return false;
    return (
      day === selectedDate.getDate() &&
      currentMonth === selectedDate.getMonth() &&
      currentYear === selectedDate.getFullYear()
    );
  };

  // Generate month-year options (current year ± 2 years)
  const currentYearValue = new Date().getFullYear();
  const monthYearOptions = [];
  for (let year = currentYearValue - 2; year <= currentYearValue + 2; year++) {
    for (let month = 0; month < 12; month++) {
      monthYearOptions.push({
        month,
        year,
        value: `${month}-${year}`,
        label: `${MONTHS[month]} ${year}`
      });
    }
  }
  
  const currentMonthYearValue = `${currentMonth}-${currentYear}`;

  return (
    <div className="calendar-view">
      {/* Month/Year Selector */}
      <div className="calendar-header-controls">
        <div className="calendar-month-year-selector">
          <select 
            className="calendar-month-year-select"
            value={currentMonthYearValue}
            onChange={handleMonthYearChange}
          >
            {monthYearOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className="calendar-nav-buttons">
          <button 
            className="calendar-nav-button"
            onClick={handlePrevMonth}
            aria-label="Mes anterior"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M15 18L9 12L15 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <button 
            className="calendar-nav-button"
            onClick={handleNextMonth}
            aria-label="Mes siguiente"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M9 18L15 12L9 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="calendar-grid-container">
        {/* Days of week header */}
        <div className="calendar-weekdays">
          {DAYS_OF_WEEK.map((day, index) => (
            <div key={index} className="calendar-weekday">
              {day}
            </div>
          ))}
        </div>

        {/* Calendar days */}
        <div className="calendar-days">
          {calendarDays.map((day, index) => (
            <button
              key={index}
              className={`calendar-day ${day === null ? 'calendar-day-empty' : ''} ${isToday(day) ? 'calendar-day-today' : ''} ${isSelected(day) ? 'calendar-day-selected' : ''}`}
              onClick={() => handleDateClick(day)}
              disabled={day === null}
            >
              {day}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default CalendarView;

