import React from 'react';
import './Button.css';

const Button = ({
  title,
  onClick,
  disabled = false,
  loading = false,
  variant = 'primary',
  icon = null,
  active = false,
  ...props
}) => {
  const getButtonClassName = () => {
    if (active && !disabled) {
      return 'button button-active';
    }
    
    switch (variant) {
      case 'secondary':
        return `button button-secondary ${disabled ? 'button-disabled' : ''}`;
      case 'social':
        return `button button-social ${disabled ? 'button-disabled' : ''}`;
      case 'outline':
        return `button button-outline ${disabled ? 'button-disabled' : ''}`;
      default:
        return `button button-primary ${disabled ? 'button-disabled' : ''}`;
    }
  };

  const getTextClassName = () => {
    if (disabled) {
      return 'button-text button-text-disabled';
    }
    
    if (active && !disabled) {
      return 'button-text button-text-active';
    }
    
    switch (variant) {
      case 'secondary':
        return 'button-text button-text-secondary';
      case 'social':
        return 'button-text button-text-social';
      case 'outline':
        return 'button-text button-text-outline';
      default:
        return 'button-text button-text-primary';
    }
  };

  const renderContent = () => {
    if (loading) {
      return (
        <div className="button-loading">
          <div className="spinner"></div>
        </div>
      );
    }

    if (icon) {
      return (
        <div className="button-content">
          <img src={icon} alt="" className="button-icon" />
          <span className={getTextClassName()}>{title}</span>
        </div>
      );
    }

    return <span className={getTextClassName()}>{title}</span>;
  };

  return (
    <button
      className={getButtonClassName()}
      onClick={onClick}
      disabled={disabled || loading}
      {...props}
    >
      {renderContent()}
    </button>
  );
};

export default Button;

