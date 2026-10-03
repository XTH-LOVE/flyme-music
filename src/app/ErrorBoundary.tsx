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
          <div style={{ fontSize: 13, opacity: 0.6, textAlign: 'center' }}>
            可以重试，或者重新加载整个应用。
          </div>
          {/*
            The message was printed straight out. It is the most useful thing for
            a bug report and the least useful thing for a person, so it is kept
            but folded away - and the user is given the two actions that
            actually have a chance of helping.

            Retry alone was not one of them: this boundary catches a render
            error, and re-rendering the same tree usually throws again
            immediately.
          */}
          <details style={{ fontSize: 12, opacity: 0.55, maxWidth: 480 }}>
            <summary style={{ cursor: 'pointer' }}>技术细节</summary>
            <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', marginTop: 6 }}>
              {error.message}
            </pre>
          </details>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => this.setState({ error: null })}
              style={{
                padding: '8px 20px',
                borderRadius: 999,
                border: '1px solid var(--am-divider, rgba(0,0,0,0.12))',
                background: 'transparent',
                color: 'inherit',
                cursor: 'pointer',
              }}
            >
              重试
            </button>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: '8px 20px',
                borderRadius: 999,
                border: 'none',
                background: 'var(--am-accent, #3d7bff)',
                color: '#fff',
                cursor: 'pointer',
              }}
            >
              重新加载
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
