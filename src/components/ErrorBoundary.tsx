import { Component, type ReactNode } from "react";

export class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null; errorInfo: React.ErrorInfo | null }
> {
  state = { error: null as Error | null, errorInfo: null as React.ErrorInfo | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("ErrorBoundary caught:", error, errorInfo);
    this.setState({ errorInfo });
  }

  render() {
    if (this.state.error) {
      const error = this.state.error;
      return (
        <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900 p-4">
          <div className="text-left max-w-2xl w-full">
            <h1 className="text-xl font-bold mb-2 text-red-600 dark:text-red-400">
              应用出错了 <span className="text-[10px] opacity-50 font-normal align-top">[v2]</span>
            </h1>
            <p className="text-gray-700 dark:text-gray-300 mb-2 font-mono text-sm break-all">
              {error.message}
            </p>
            {error.stack && (
              <details className="mb-3" open>
                <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-700">完整调用栈 (点击折叠)</summary>
                <pre className="text-left text-xs text-red-500 bg-gray-100 dark:bg-gray-800 p-3 rounded mt-1 overflow-auto max-h-60 whitespace-pre-wrap">
                  {error.stack}
                </pre>
              </details>
            )}
            {this.state.errorInfo?.componentStack && (
              <details className="mb-3" open>
                <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-700">React 组件栈</summary>
                <pre className="text-left text-xs text-orange-500 bg-gray-100 dark:bg-gray-800 p-3 rounded mt-1 overflow-auto max-h-60">
                  {this.state.errorInfo.componentStack}
                </pre>
              </details>
            )}
            <button
              type="button"
              onClick={() => location.reload()}
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
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
