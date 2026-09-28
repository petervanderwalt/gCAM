interface BitmapChoice {
    fileName: string;
}

export interface BitmapImportModalProps {
    choice: BitmapChoice;
    onUseBitmap(): void;
    onTrace(): void;
    onCancel(): void;
}

/** Explicitly chooses bitmap raster workflow versus destructive trace replace. */
export function BitmapImportModal({
    choice,
    onUseBitmap,
    onTrace,
    onCancel,
}: BitmapImportModalProps) {
    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
            role="dialog"
            aria-modal="true"
            aria-labelledby="bitmap-import-title"
        >
            <div className="w-full max-w-md rounded-lg border border-slate-300 bg-white p-5 shadow-xl dark:border-robin-900 dark:bg-dark">
                <h2
                    id="bitmap-import-title"
                    className="text-lg font-semibold text-slate-900 dark:text-white"
                >
                    How should this bitmap be used?
                </h2>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                    Keep it as pixels for laser raster, wavy, halftone, or
                    heightmap work; or trace it into editable cut vectors.
                </p>
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    <button
                        onClick={onUseBitmap}
                        className="rounded-lg border border-robin-500 bg-robin-500 px-4 py-3 text-left text-sm font-medium text-white hover:bg-robin-600"
                    >
                        Use as bitmap
                        <span className="mt-1 block text-xs font-normal text-white/80">
                            Raster, halftone, wavy, heightmap
                        </span>
                    </button>
                    <button
                        onClick={onTrace}
                        className="rounded-lg border border-slate-300 px-4 py-3 text-left text-sm font-medium text-slate-800 hover:bg-slate-100 dark:border-robin-700 dark:text-white dark:hover:bg-dark-lighter"
                    >
                        Convert to vector
                        <span className="mt-1 block text-xs font-normal text-slate-500">
                            Trace and replace with editable paths
                        </span>
                    </button>
                </div>
                <button
                    onClick={onCancel}
                    className="mt-4 text-sm text-slate-500 hover:text-slate-900 dark:hover:text-white"
                >
                    Cancel
                </button>
                <span className="sr-only">{choice.fileName}</span>
            </div>
        </div>
    );
}
