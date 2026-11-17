import { Component, type ReactNode } from 'react';
import { browserClient } from '../client/browser-client';

type BoundaryState = { failed: boolean };

export class AppErrorBoundary extends Component<{ children: ReactNode }, BoundaryState> {
  state: BoundaryState = { failed: false };

  static getDerivedStateFromError(): BoundaryState {
    return { failed: true };
  }

  componentDidCatch() {
    void browserClient.command('browser.setLayout', { contentVisible: false }).catch(() => undefined);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main role="alert" className="browser-loading">
        <h1>浏览器界面暂时无法显示</h1>
        <p>重新载入管理界面可恢复连接，已提交的数据会保留。</p>
        <button type="button" onClick={() => window.location.reload()}>重新载入界面</button>
      </main>
    );
  }
}
