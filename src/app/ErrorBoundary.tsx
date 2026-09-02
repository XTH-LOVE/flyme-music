import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/** Catches render-time crashes so one broken view never whites out the app. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Unhandled render error:', error, info.componentStack);
  }

  render(): ReactNode {
    const { error } = this.state;
    if (error) {
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            minHeight: '60vh',
            padding: 24,
          }}
        >
          <div style={{ fontSize: 18, fontWeight: 600 }}>页面出错了</div>
          <div style={{ fontSize: 13, opacity: 0.6 }}>{error.message}</div>
          <button
            onClick={() => this.setState({ error: null })}
            style={{
              padding: '8px 20px',
              borderRadius: 999,
              border: 'none',
              background: 'var(--am-accent, #3d7bff)',
              color: '#fff',
              cursor: 'pointer',
            }}
          >
            重试
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
