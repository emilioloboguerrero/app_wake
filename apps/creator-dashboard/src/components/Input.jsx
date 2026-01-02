import React from 'react';
import './Input.css';

const Input = ({
  placeholder,
  value,
  onChange,
  type = 'text',
  error = null,
  light = false,
  ...props
}) => {
  return (
    <div className="input-container">
      <input
        className={`input ${error ? 'input-error' : ''} ${light ? 'input-light' : ''}`}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        type={type}
        {...props}
      />
      {error && (
        <span className="input-error-text">{error}</span>
      )}
    </div>
  );
};

export default Input;

