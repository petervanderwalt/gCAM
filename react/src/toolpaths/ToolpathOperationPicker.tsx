/**
 * Purpose: Implementation module for ToolpathOperationPicker in the react domain.
 */
import type { Operation } from '../lib/engine';
import { OPERATION_IMAGES } from './operationCatalog';

interface ToolpathOperationPickerProps {
    operation: Operation;
    operations: { value: Operation; label: string }[];
    onChange: (operation: Operation) => void;
}

/** Operation selector kept independent from the parameter form. */
export function ToolpathOperationPicker({
    operation,
    operations,
    onChange,
}: ToolpathOperationPickerProps) {
    return (
        <div className="space-y-1 rounded-lg border border-slate-300 bg-slate-50/70 p-1 dark:border-robin-900 dark:bg-slate-900/70">
            {operations.map((item) => (
                <button
                    key={item.value}
                    onClick={() => onChange(item.value)}
                    className={`flex w-full items-center gap-2 rounded-md border px-1.5 py-1 text-left text-xs font-medium transition-colors touch-manipulation ${
                        operation === item.value
                            ? 'border-robin-500 bg-robin-500/20 text-white ring-1 ring-robin-500/60'
                            : 'border-transparent text-slate-600 hover:border-robin-900/60 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-dark-lighter'
                    }`}
                >
                    <span className="grid h-8 w-10 shrink-0 place-items-center overflow-hidden rounded border border-slate-300 bg-white dark:border-robin-900 dark:bg-dark">
                        {OPERATION_IMAGES[item.value] ? (
                            <img
                                src={OPERATION_IMAGES[item.value]}
                                alt=""
                                className="h-full w-full object-contain dark:invert dark:hue-rotate-180"
                            />
                        ) : (
                            <span className="px-1 text-center text-[10px] leading-tight text-slate-400">
                                {item.label}
                            </span>
                        )}
                    </span>
                    <span>{item.label}</span>
                </button>
            ))}
        </div>
    );
}
