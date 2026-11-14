import React from 'react';
import { useFamily } from '../../context/FamilyContext';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';

export default function Toast() {
  const { toasts, removeToast } = useFamily();

  if (!toasts || toasts.length === 0) return null;

  const renderIcon = (type) => {
    switch (type) {
      case 'success':
        return <CheckCircle2 size={18} className="toast-icon text-success" />;
      case 'error':
        return <AlertCircle size={18} className="toast-icon text-danger" />;
      case 'warning':
        return <AlertTriangle size={18} className="toast-icon text-warning" />;
      case 'info':
      default:
        return <Info size={18} className="toast-icon text-info" />;
    }
  };

  return (
    <div className="toast-container">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast-${toast.type || 'info'}`}>
          {renderIcon(toast.type)}
          <div className="toast-content">
            <div className="toast-title">{toast.title}</div>
            {toast.message && <div className="toast-message">{toast.message}</div>}
          </div>
          <button
            className="toast-close"
            onClick={() => removeToast(toast.id)}
            aria-label="Close notification"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

