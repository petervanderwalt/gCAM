import { Component, type ErrorInfo, type ReactNode } from 'react';

/** Prevent a failed workspace panel from taking down the entire editor shell. */
export class ErrorBoundary extends Component<
    { children: ReactNode; fallback?: ReactNode },
    { hasError: boolean; error: Error | null }
> {
    constructor(props: { children: ReactNode; fallback?: ReactNode }) {
        super(props);
        this.state = { hasError: false, error: null };
    }
    static getDerivedStateFromError(error: Error) {
        return { hasError: true, error };
    }
    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('Error caught by boundary:', error, errorInfo);
    }
    render() {
        if (!this.state.hasError) return this.props.children;
        if (this.props.fallback) return this.props.fallback;
        return (
            <div className="flex h-full items-center justify-center p-4">
                <div className="rounded-lg bg-red-50 p-6 text-center dark:bg-red-900/20">
                    <h2 className="text-lg font-medium text-red-700 dark:text-red-300">
                        Something went wrong
                    </h2>
                    <pre className="mt-4 text-xs text-left overflow-auto max-h-64 text-red-600 dark:text-red-400">
                        {this.state.error?.message}
                        {this.state.error?.stack}
                    </pre>
                    <button
                        onClick={() =>
                            this.setState({ hasError: false, error: null })
                        }
                        className="mt-4 rounded-lg bg-robin-500 px-4 py-2 text-white"
                    >
                        Try again
                    </button>
                </div>
            </div>
        );
    }
}
