import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  page: string;
}

interface State {
  error?: Error;
}

export class PageErrorBoundary extends Component<Props, State> {
  state: State = {};

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`The ${this.props.page} page failed to render.`, error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <section className="panel">
          <p className="eyebrow">PAGE ERROR</p>
          <h1>{this.props.page} could not be rendered</h1>
          <p className="muted">{this.state.error.message}</p>
        </section>
      );
    }
    return this.props.children;
  }
}
