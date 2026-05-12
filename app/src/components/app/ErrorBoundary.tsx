import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary] Uncaught render error:', error, errorInfo);
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '100vh',
            fontFamily: 'Inter, system-ui, sans-serif',
            padding: '2rem',
            textAlign: 'center',
            background: '#f8fafc',
            color: '#0f172a',
          }}
        >
          <div style={{ maxWidth: '420px' }}>
            <div
              style={{
                width: '56px',
                height: '56px',
                margin: '0 auto 1.25rem',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #fee2e2, #fecaca)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.5rem',
              }}
            >
              ⚠️
            </div>
            <h1 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.5rem' }}>
              Something went wrong
            </h1>
            <p style={{ color: '#64748b', fontSize: '0.875rem', lineHeight: 1.6, marginBottom: '1.5rem' }}>
              An unexpected error occurred. This has been logged and our team will look into it.
            </p>
            <button
              onClick={this.handleReload}
              style={{
                padding: '0.625rem 1.5rem',
                fontSize: '0.875rem',
                fontWeight: 600,
                color: '#fff',
                background: 'linear-gradient(135deg, #1e3a5f, #1e40af)',
                border: 'none',
                borderRadius: '0.75rem',
                cursor: 'pointer',
                transition: 'opacity 0.2s',
              }}
              onMouseOver={(e) => ((e.target as HTMLButtonElement).style.opacity = '0.9')}
              onMouseOut={(e) => ((e.target as HTMLButtonElement).style.opacity = '1')}
            >
              Reload Page
            </button>
            {import.meta.env.MODE !== 'production' && this.state.error && (
              <pre
                style={{
                  marginTop: '1.5rem',
                  padding: '1rem',
                  background: '#1e293b',
                  color: '#f87171',
                  borderRadius: '0.5rem',
                  fontSize: '0.75rem',
                  textAlign: 'left',
                  overflow: 'auto',
                  maxHeight: '200px',
                }}
              >
                {this.state.error.message}
                {'\n'}
                {this.state.error.stack}
              </pre>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
