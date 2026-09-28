import type { Operation } from '../lib/engine';

interface ToolpathFormAlertsProps {
    operation: Operation;
    vbitMismatch: boolean;
    draftError: string | null;
}

const VBIT_NAMES: Partial<Record<Operation, string>> = {
    chamfer: 'Chamfer',
    vcarve: 'V-Carve',
    'texture-fill': 'Texture Fill',
    'wavy-raster': 'Wavy',
    halftone: 'Halftone',
};

/** Operation validation and draft-preview feedback shown above form fields. */
export function ToolpathFormAlerts({
    operation,
    vbitMismatch,
    draftError,
}: ToolpathFormAlertsProps) {
    return (
        <>
            {vbitMismatch && (
                <p
                    role="alert"
                    className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-xs text-amber-600 dark:text-amber-300"
                >
                    {VBIT_NAMES[operation] ?? 'This operation'} requires a V-Bit
                    — pick one from your tool rack.
                </p>
            )}
            {draftError && (
                <p
                    role="alert"
                    className="rounded-lg border border-red-500/40 bg-red-500/10 px-2 py-1.5 text-xs text-red-600 dark:text-red-300"
                >
                    Preview unavailable — {draftError}
                </p>
            )}
        </>
    );
}
