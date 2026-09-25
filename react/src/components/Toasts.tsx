import { useCallback, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import cx from 'classnames';

export type ToastVariant = 'success' | 'info' | 'warning' | 'danger';

export interface Toast {
    id: number;
    message: string;
    variant: ToastVariant;
}

let nextToastId = 1;

const icons = {
    success: CheckCircle2,
    info: Info,
    warning: AlertTriangle,
    danger: AlertTriangle,
};

/**
 * Toast stack (camcanvas toastContainer parity): transient messages with
 * per-toast dismissal, rendered bottom-right above the status line.
 */
export function useToasts() {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const dismiss = useCallback((id: number) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    }, []);

    const showToast = useCallback(
        (message: string, variant: ToastVariant = 'info', duration = 2600) => {
            const id = nextToastId++;
            setToasts((prev) => [...prev.slice(-3), { id, message, variant }]);
            window.setTimeout(() => dismiss(id), duration);
        },
        [dismiss],
    );

    return { toasts, showToast, dismiss };
}

export function ToastStack({
    toasts,
    onDismiss,
}: {
    toasts: Toast[];
    onDismiss: (id: number) => void;
}) {
    if (!toasts.length) return null;
    return (
        <div
            aria-live="polite"
            className="fixed bottom-10 right-4 z-[60] flex flex-col gap-2 w-72"
        >
            {toasts.map((t) => {
                const Icon = icons[t.variant];
                return (
                    <div
                        key={t.id}
                        role="status"
                        className={cx(
                            'flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm shadow-xl',
                            'bg-white dark:bg-dark',
                            t.variant === 'success' &&
                                'border-green-500/50 text-green-700 dark:text-green-300',
                            t.variant === 'info' &&
                                'border-robin-500/50 text-slate-700 dark:text-slate-200',
                            t.variant === 'warning' &&
                                'border-amber-500/50 text-amber-700 dark:text-amber-300',
                            t.variant === 'danger' &&
                                'border-red-500/50 text-red-600 dark:text-red-300',
                        )}
                    >
                        <Icon size={16} className="mt-0.5 shrink-0" />
                        <span className="flex-1">{t.message}</span>
                        <button
                            onClick={() => onDismiss(t.id)}
                            aria-label="Dismiss notification"
                            className="text-slate-400 hover:text-slate-900 dark:hover:text-white"
                        >
                            <X size={14} />
                        </button>
                    </div>
                );
            })}
        </div>
    );
}
