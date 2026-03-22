import React from 'react';
import './DurationPicker.css';

const OPTIONS = [
  { value: 15, label: '15m' },
  { value: 30, label: '30m' },
  { value: 45, label: '45m' },
  { value: 60, label: '60m' },
];

export default function DurationPicker({ value, onChange, label }) {
  return (
    <div className="dur-wrap">
      {label && <span className="dur-label">{label}</span>}
      <div className="dur-options">
        {OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className={`dur-option ${value === opt.value ? 'dur-option--active' : ''}`}
            onClick={() => onChange(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
