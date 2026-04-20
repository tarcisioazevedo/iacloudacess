import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'default';
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  variant = 'danger',
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null;

  const btnClass = variant === 'danger' ? 'btn btn-danger' : variant === 'warning' ? 'btn btn-primary' : 'btn btn-primary';

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-content modal-sm" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            {variant !== 'default' && (
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 'var(--radius-sm)',
                  background: variant === 'danger' ? 'var(--color-danger-bg)' : 'var(--color-warning-bg)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <AlertTriangle
                  size={16}
                  color={variant === 'danger' ? 'var(--color-danger)' : 'var(--color-warning)'}
                />
              </div>
            )}
            {title}
          </h3>
          <button className="btn btn-ghost btn-icon" onClick={onCancel} aria-label="Fechar">
            <X size={16} />
          </button>
        </div>
        <div className="modal-body">
          <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: 0, lineHeight: 1.6 }}>
            {message}
          </p>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </button>
          <button className={btnClass} onClick={onConfirm} disabled={loading}>
            {loading && <span className="animate-spin" style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block' }} />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
