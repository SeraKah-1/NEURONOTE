import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
    this.setState({ errorInfo });
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#0f172a] text-white flex flex-col items-center justify-center p-6 text-center">
          <div className="bg-red-900/20 border border-red-500/30 p-6 rounded-2xl max-w-md w-full shadow-2xl backdrop-blur-sm">
            <div className="w-16 h-16 bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-500/50">
              <AlertTriangle className="text-red-500" size={32} />
            </div>
            <h1 className="text-xl font-bold mb-2 text-white">System Malfunction</h1>
            <p className="text-sm text-gray-400 mb-6 leading-relaxed">
              The application encountered a critical error. This usually happens due to browser incompatibility or a network glitch.
            </p>
            
            <div className="bg-black/40 rounded-lg p-3 mb-6 text-left overflow-auto max-h-32 border border-gray-800">
              <p className="text-[10px] font-mono text-red-300">
                {this.state.error?.toString()}
              </p>
              <details className="mt-2">
                <summary className="text-[9px] text-gray-500 cursor-pointer hover:text-gray-300">Stack Trace</summary>
                <pre className="text-[8px] text-gray-600 mt-1 whitespace-pre-wrap">
                    {this.state.errorInfo?.componentStack}
                </pre>
              </details>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => window.location.reload()}
                className="flex-1 bg-blue-600 hover:bg-blue-500 text-white py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-colors"
              >
                <RefreshCw size={16} /> Reload App
              </button>
              <button
                onClick={() => {
                    localStorage.clear();
                    window.location.reload();
                }}
                className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-colors"
              >
                <Home size={16} /> Hard Reset
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;