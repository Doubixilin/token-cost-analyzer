import { Component, type ReactNode } from "react";

export class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex items-center justify-center h-screen bg-gray-50 dark:bg-gray-900">
          <div className="text-center p-8">
            <h1 className="text-xl font-bold mb-2 text-gray-800 dark:text-gray-200">
              应用出错了
            </h1>
            <p className="text-gray-500 dark:text-gray-400 mb-4">
              {this.state.error.message}
            </p>
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
