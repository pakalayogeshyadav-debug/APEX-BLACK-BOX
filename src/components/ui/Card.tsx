import React from 'react';

export const Card: React.FC<{ children: React.ReactNode; className?: string; title?: string }> = ({ children, className = '', title }) => (
  <div className={`bg-panel border border-border rounded shadow-sm ${className}`}>
    {title && (
      <div className="px-4 py-3 border-b border-border text-sm font-semibold text-secondary">
        {title}
      </div>
    )}
    <div className="p-4">
      {children}
    </div>
  </div>
);

export const Button: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = ({ children, className = '', ...props }) => (
  <button 
    className={`px-4 py-2 bg-border hover:bg-opacity-80 text-primary font-medium rounded transition-colors focus:outline-none focus:ring-2 focus:ring-telemetry ${className}`}
    {...props}
  >
    {children}
  </button>
);
