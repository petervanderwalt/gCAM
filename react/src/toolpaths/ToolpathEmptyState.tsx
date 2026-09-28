/** Explains why the form is unavailable before a vector selection exists. */
export function ToolpathEmptyState() {
    return (
        <div className="p-6 text-center space-y-2">
            <div className="font-medium text-slate-900 dark:text-white">
                No vectors selected
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400">
                Click or box-select vectors on the canvas to create a toolpath.
            </p>
        </div>
    );
}
