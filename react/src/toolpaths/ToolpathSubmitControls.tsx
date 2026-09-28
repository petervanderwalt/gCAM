interface ToolpathSubmitControlsProps {
    busy: boolean;
    hasActiveGeometry: boolean;
    editEntry: boolean;
    submitLabel: string;
    selectedCount: number;
    status: string;
    onGenerate(): void;
    onCancelEdit?: () => void;
}

/** Submit, edit-cancel and status footer for the active toolpath form. */
export function ToolpathSubmitControls({
    busy,
    hasActiveGeometry,
    editEntry,
    submitLabel,
    selectedCount,
    status,
    onGenerate,
    onCancelEdit,
}: ToolpathSubmitControlsProps) {
    return (
        <>
            <button
                onClick={onGenerate}
                disabled={!hasActiveGeometry || busy}
                className="w-full rounded-lg bg-green-500 hover:bg-green-600 disabled:opacity-40 text-white px-3 py-3 text-base font-medium touch-manipulation"
            >
                {busy ? 'Building…' : editEntry ? 'Save Toolpath' : submitLabel}
                {!editEntry && selectedCount > 0
                    ? ` (${selectedCount} selected)`
                    : ''}
            </button>
            {editEntry && onCancelEdit && (
                <button
                    onClick={onCancelEdit}
                    className="w-full rounded-lg border border-slate-300 dark:border-robin-900 px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-dark-lighter touch-manipulation"
                >
                    Cancel Edit
                </button>
            )}
            <p className="text-xs text-slate-500 dark:text-slate-400">
                {status}
            </p>
        </>
    );
}
