/**
 * Purpose: Implementation module for OutputWorkspace in the react domain.
 */
import { Box } from 'lucide-react';
import {
    CutPreview3DView,
    type PreviewControls,
} from '../components/CutPreview3DView';
import { GcodePreview } from '../components/GcodePreview';
import { GcodeViewer3DView } from '../components/GcodeViewer3DView';

interface OutputWorkspaceProps {
    mode: 'preview' | 'gcode';
    toolpaths: Record<string, unknown>[];
    gcode: string;
    fileName: string;
    darkMode: boolean;
    onPreviewControlsChange(controls: PreviewControls | null): void;
}

/** Shared output workspace for simulated cut and parsed G-code views. */
export function OutputWorkspace({
    mode,
    toolpaths,
    gcode,
    fileName,
    darkMode,
    onPreviewControlsChange,
}: OutputWorkspaceProps) {
    const isPreview = mode === 'preview';
    const title = isPreview ? '3D Cut Preview' : 'G-code Viewer';
    const emptyText = isPreview
        ? 'Add a toolpath to preview the cut'
        : 'Add a toolpath to preview the G-code';
    return (
        <main className="relative flex-1 min-w-0 bg-slate-100 dark:bg-slate-800 p-3 flex flex-col gap-3 min-h-0">
            <div className="flex items-center gap-2 text-sm text-slate-300">
                <Box size={18} className="text-robin-400" />
                <span className="font-medium text-white">{title}</span>
                <span className="text-xs text-slate-500">
                    {toolpaths.length
                        ? `${toolpaths.length} toolpath${toolpaths.length === 1 ? '' : 's'}`
                        : emptyText}
                </span>
            </div>
            <div className="flex-1 min-h-0">
                {isPreview ? (
                    <CutPreview3DView
                        toolpaths={toolpaths}
                        darkMode={darkMode}
                        onControlsChange={onPreviewControlsChange}
                    />
                ) : (
                    <GcodeViewer3DView gcode={gcode} darkMode={darkMode} />
                )}
            </div>
            <div className="shrink-0 rounded border border-slate-200 bg-white p-3 dark:border-robin-900 dark:bg-dark">
                <GcodePreview gcode={gcode} fileName={fileName} />
            </div>
        </main>
    );
}
