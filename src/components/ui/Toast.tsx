import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
}

interface ToastContextType {
  toast: (type: ToastType, message: string, duration?: number) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  warning: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

const ICONS = {
  success: <CheckCircle size={18} />,
  error: <XCircle size={18} />,
  warning: <AlertTriangle size={18} />,
  info: <Info size={18} />,
};

function ToastMessage({ item, onRemove }: { item: ToastItem; onRemove: (id: string) => void }) {
  const [exiting, setExiting] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const dur = item.duration || 4000;
    timerRef.current = setTimeout(() => {
      setExiting(true);
      setTimeout(() => onRemove(item.id), 300);
    }, dur);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [item, onRemove]);

  const handleClose = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setExiting(true);
    setTimeout(() => onRemove(item.id), 300);
  };

  return (
    <div
      className={`toast toast-${item.type}`}
      style={{ animation: exiting ? 'toastOut 0.3s ease-in forwards' : undefined }}
      role="alert"
      aria-live="polite"
    >
      {ICONS[item.type]}
      <span style={{ flex: 1 }}>{item.message}</span>
      <button
        onClick={handleClose}
        style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 2, opacity: 0.7, flexShrink: 0 }}
        aria-label="Fechar"
      >
        <X size={14} />
      </button>
    </div>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const addToast = useCallback((type: ToastType, message: string, duration?: number) => {
    const id = `toast-${++idRef.current}`;
    setToasts(prev => [...prev.slice(-4), { id, type, message, duration }]);
  }, []);

  const ctx: ToastContextType = {
    toast: addToast,
    success: (msg) => addToast('success', msg),
    error: (msg) => addToast('error', msg),
    warning: (msg) => addToast('warning', msg),
    info: (msg) => addToast('info', msg),
  };

  return (
    <ToastContext.Provider value={ctx}>
      {children}
      <div className="toast-container" aria-label="Notificações">
        {toasts.map(t => (
          <ToastMessage key={t.id} item={t} onRemove={removeToast} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}
