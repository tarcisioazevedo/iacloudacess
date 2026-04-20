import React, { Component, ErrorInfo } from 'react';
import { AlertTriangle, RefreshCcw } from 'lucide-react';

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div
          className="animate-fade-in"
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 48,
            textAlign: 'center',
            minHeight: 300,
          }}
        >
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 'var(--radius-lg)',
              background: 'var(--color-danger-bg)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 16,
            }}
          >
            <AlertTriangle size={28} color="var(--color-danger)" />
          </div>
          <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 4px', color: 'var(--color-text)' }}>
            Algo deu errado
          </h3>
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: '0 0 16px', maxWidth: 400, lineHeight: 1.5 }}>
            Ocorreu um erro inesperado neste módulo. Tente recarregar ou entre em contato com o suporte.
          </p>
          {this.state.error && (
            <pre
              style={{
                fontSize: 11,
                fontFamily: 'var(--font-mono)',
                background: 'var(--color-bg)',
                padding: '8px 16px',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--color-danger)',
                maxWidth: 500,
                overflow: 'auto',
                marginBottom: 16,
              }}
            >
              {this.state.error.message}
            </pre>
          )}
          <button className="btn btn-secondary" onClick={this.handleReset}>
            <RefreshCcw size={14} />
            Tentar novamente
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
