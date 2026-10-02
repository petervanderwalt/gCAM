import { useState } from 'react';
import { machineUpToSetupAngles, setupAnglesToMachineUp } from '../engine/surface-model';

/**
 * Purpose: Document state, import, file, or persistence module for BitmapImportModal.
 */
interface BitmapChoice {
    fileName: string;
    isSurfaceModel?: boolean;
    surfaceMachinableTopDown?: boolean;
    surfacePreviewUrl?: string;
    machineUp?: [number, number, number];
}

export interface BitmapImportModalProps {
    choice: BitmapChoice;
    onUseBitmap(): void;
    onTrace(): void;
    onSetupOrientation?(machineUp: [number, number, number]): Promise<void>;
    onCancel(): void;
}

/** Explicitly chooses bitmap raster workflow versus destructive trace replace. */
export function BitmapImportModal({
    choice,
    onUseBitmap,
    onTrace,
    onSetupOrientation,
    onCancel,
}: BitmapImportModalProps) {
    const initialAngles = machineUpToSetupAngles(choice.machineUp ?? [0, 0, 1]);
    const [azimuth, setAzimuth] = useState(initialAngles.azimuthDeg);
    const [elevation, setElevation] = useState(initialAngles.elevationDeg);
    const [updating, setUpdating] = useState(false);
    const applyOrientation = async () => {
        if (!onSetupOrientation) return;
        setUpdating(true);
        try {
            await onSetupOrientation(setupAnglesToMachineUp(azimuth, elevation));
        } finally {
            setUpdating(false);
        }
    };
    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
            role="dialog"
            aria-modal="true"
            aria-labelledby="bitmap-import-title"
        >
            <div className="w-full max-w-lg rounded-lg border border-slate-300 bg-white p-5 shadow-xl dark:border-robin-900 dark:bg-dark">
                <h2
                    id="bitmap-import-title"
                    className="text-lg font-semibold text-slate-900 dark:text-white"
                >
                    {choice.isSurfaceModel ? 'Place this 3D model?' : 'How should this bitmap be used?'}
                </h2>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                    {choice.isSurfaceModel
                        ? 'The canvas shows a transformable 2D heightmap. The original 3D mesh remains attached for CAM.'
                        : 'Keep it as pixels for laser raster, wavy, halftone, or heightmap work; or trace it into editable cut vectors.'}
                </p>
                {choice.isSurfaceModel && choice.surfacePreviewUrl && (
                    <div className="mt-4 overflow-hidden rounded-md border border-slate-200 bg-slate-100 p-2 dark:border-robin-800 dark:bg-dark-lighter">
                        <img src={choice.surfacePreviewUrl} alt="Top-view heightmap preview" className="mx-auto max-h-44 max-w-full object-contain" />
                    </div>
                )}
                {choice.isSurfaceModel && onSetupOrientation && (
                    <section className="mt-4 rounded-md border border-slate-200 p-3 dark:border-robin-800" aria-label="Machining setup orientation">
                        <h3 className="text-sm font-semibold text-slate-800 dark:text-white">Machining setup direction</h3>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-300">Choose which direction of the model faces up (+Z). The preview and retained CAM mesh update together.</p>
                        <div className="mt-3 grid grid-cols-2 gap-3">
                            <label className="text-xs text-slate-600 dark:text-slate-300">
                                Azimuth ({azimuth}°)
                                <input aria-label="Setup azimuth" type="range" min="-180" max="180" step="1" value={azimuth} onChange={(event) => setAzimuth(Number(event.currentTarget.value))} className="mt-1 block w-full" />
                            </label>
                            <label className="text-xs text-slate-600 dark:text-slate-300">
                                Elevation ({elevation}°)
                                <input aria-label="Setup elevation" type="range" min="-90" max="90" step="1" value={elevation} onChange={(event) => setElevation(Number(event.currentTarget.value))} className="mt-1 block w-full" />
                            </label>
                        </div>
                        <button type="button" disabled={updating} onClick={() => void applyOrientation()} className="mt-3 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-robin-700 dark:text-white dark:hover:bg-dark-lighter">
                            {updating ? 'Updating heightmap…' : 'Apply setup direction'}
                        </button>
                    </section>
                )}
                {choice.isSurfaceModel && (
                    <p className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-2 text-xs text-slate-700">
                        {choice.surfaceMachinableTopDown === false
                            ? 'The current setup is edge-on or has no upward-facing surface. Choose another direction and apply it before placing this model.'
                            : '3-axis toolpaths use the uppermost surface at each XY position. Overhangs are treated as a draped envelope; hidden undersides are not machined.'}
                    </p>
                )}
                <div className={`mt-5 grid gap-3 ${choice.isSurfaceModel ? '' : 'sm:grid-cols-2'}`}>
                    <button
                        disabled={choice.isSurfaceModel && choice.surfaceMachinableTopDown === false}
                        onClick={onUseBitmap}
                        className="rounded-lg border border-robin-500 bg-robin-500 px-4 py-3 text-left text-sm font-medium text-white hover:bg-robin-600 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {choice.isSurfaceModel
                            ? choice.surfaceMachinableTopDown === false ? 'Choose setup direction first' : 'Place 3D model'
                            : 'Use as bitmap'}
                        <span className="mt-1 block text-xs font-normal text-white/80">
                            {choice.isSurfaceModel ? 'Keep 3D mesh for CAM' : 'Raster, halftone, wavy, heightmap'}
                        </span>
                    </button>
                    {!choice.isSurfaceModel && <button
                        onClick={onTrace}
                        className="rounded-lg border border-slate-300 px-4 py-3 text-left text-sm font-medium text-slate-800 hover:bg-slate-100 dark:border-robin-700 dark:text-white dark:hover:bg-dark-lighter"
                    >
                        Convert to vector
                        <span className="mt-1 block text-xs font-normal text-slate-500">
                            Trace and replace with editable paths
                        </span>
                    </button>}
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
