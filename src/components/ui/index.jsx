import React from 'react';

export const Card = ({ children, className = '', glass = false, ...props }) => {
  return (
    <div className={`${glass ? 'glass-card' : 'card'} ${className}`} {...props}>
      {children}
    </div>
  );
};

export const Button = ({ children, variant = 'primary', className = '', ...props }) => {
  const getVariantClass = () => {
    switch (variant) {
      case 'primary': return 'btn-primary';
      case 'secondary': return 'btn-secondary';
      case 'outline': return 'btn-outline';
      case 'danger': return 'btn-danger';
      default: return 'btn-primary';
    }
  };

  return (
    <button className={`btn ${getVariantClass()} ${className}`} {...props}>
      {children}
    </button>
  );
};

export const Input = ({ label, id, className = '', ...props }) => {
  return (
    <div className={`input-group ${className}`}>
      {label && <label htmlFor={id} className="input-label">{label}</label>}
      <input id={id} className="input-field" {...props} />
    </div>
  );
};
