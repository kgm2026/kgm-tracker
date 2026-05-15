import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      const isDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches
        || document.documentElement.getAttribute('data-theme') === 'dark';
      const bg = isDark ? '#141414' : '#ffffff';
      const textColor = isDark ? '#bdbdbd' : '#555555';
      const btnBg = isDark ? '#ffffff' : '#1a1a2e';
      const btnColor = isDark ? '#000000' : '#ffffff';
      return (
        <div style={{
          padding: '40px 20px',
          textAlign: 'center',
          color: '#fc8181',
          background: bg,
          borderRadius: 12,
          border: '1px solid #fc818133'
        }}>
          <span className="material-symbols-outlined" style={{ fontSize: 48, marginBottom: 16, display: 'block', color: '#fc8181' }}>warning</span>
          <h2 style={{ margin: '0 0 12px', color: '#fc8181' }}>Something went wrong</h2>
          <p style={{ margin: '0 0 20px', color: textColor }}>
            {this.state.error?.message || 'An unexpected error occurred'}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{
              background: btnBg,
              color: btnColor,
              border: 'none',
              padding: '10px 24px',
              borderRadius: 6,
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            Try Again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
