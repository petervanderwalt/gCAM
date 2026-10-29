import { FloatingPanel } from '../../components/floating/FloatingPanel';
import type { NestProgress } from '../../interactions/useNestOptimizer';

export function NestProgressDialog({
    progress,
    onStop,
    onCancel,
}: {
    progress: NestProgress;
    onStop: () => void;
    onCancel: () => void;
}) {
    return (
        <FloatingPanel
            title="Optimising nesting"
            label="Optimising nesting"
            closeLabel="Cancel nesting"
            onClose={onCancel}
            placement="right"
            className="w-80 max-w-[calc(100%-16px)]"
        >
            <div
                className="space-y-3 p-4"
                onKeyDown={(event) => event.stopPropagation()}
            >
                <p className="flex items-baseline gap-2" aria-live="polite">
                    <span className="text-3xl font-semibold tabular-nums text-robin-500">
                        {progress.hasBest
                            ? `${Math.abs(progress.improvement).toFixed(1)}%`
                            : '—'}
                    </span>
                    <span className="text-sm">
                        {progress.hasBest
                            ? progress.improvement < 0
                                ? 'More material used'
                                : 'Material saved'
                            : 'Finding a complete layout…'}
                    </span>
                </p>
                <div className="space-y-1 text-xs text-slate-600 dark:text-slate-300 tabular-nums">
                    <p className="flex items-center gap-2">
                        <span
                            aria-hidden="true"
                            className="h-0.5 w-4 bg-blue-600"
                        />
                        Best layout so far
                    </p>
                    <p className="flex items-center gap-2">
                        <span
                            aria-hidden="true"
                            className="h-0.5 w-4 bg-amber-500"
                        />
                        Test iteration {progress.attemptIteration ?? '—'}
                    </p>
                </div>
                <div className="flex justify-end gap-2">
                    <button
                        type="button"
                        onClick={onCancel}
                        className="rounded border px-3 py-2"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        disabled={!progress.hasBest}
                        onClick={onStop}
                        className="rounded bg-robin-500 px-3 py-2 text-white disabled:opacity-40"
                    >
                        Stop and keep best
                    </button>
                </div>
            </div>
        </FloatingPanel>
    );
}
