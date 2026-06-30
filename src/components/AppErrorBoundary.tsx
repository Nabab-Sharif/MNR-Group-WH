import React from 'react';

type State = { hasError: boolean };

class AppErrorBoundary extends React.Component<React.PropsWithChildren, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error('App render failed', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4 text-foreground">
          <div className="w-full max-w-sm rounded-lg border border-destructive/40 bg-card p-5 text-center shadow-lg">
            <h1 className="text-lg font-bold">Page load failed</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Please refresh the page. If it still does not load, clear browser cache and open again.
            </p>
            <button
              className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
              onClick={() => window.location.reload()}
            >
              Refresh
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default AppErrorBoundary;