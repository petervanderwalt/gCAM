/**
 * Purpose: Implementation module for CanvasHud in the react domain.
 */
import type { RefObject } from 'react';
import { createPortal } from 'react-dom';
import { displayValue, lengthUnit, type UnitSystem } from '../lib/units';

type Point = { x: number; y: number };

interface CanvasHudProps {
    loopCount: number;
    darkMode: boolean;
    cursorRef: RefObject<Point | null>;
    guidePlacement: 'x' | 'y' | null;
    units: UnitSystem;
    draftProgress: { percent: number; label: string } | null | undefined;
    progressPosition: Point | null;
    draftDimension: { label: string; x: number; y: number } | null;
    jobExceedsStock: boolean;
    onAdjustStock?: () => void;
    onZoom(factor: number): void;
    onFit(): void;
}

/** DOM overlays for the canvas: status, coordinates, progress and viewport controls. */
export function CanvasHud({
    loopCount,
    darkMode,
    cursorRef,
    guidePlacement,
    units,
    draftProgress,
    progressPosition,
    draftDimension,
    jobExceedsStock,
    onAdjustStock,
    onZoom,
    onFit,
}: CanvasHudProps) {
    const chip = darkMode
        ? 'bg-dark/80 border-robin-900 text-slate-300'
        : 'bg-white/90 border-slate-300 text-slate-600';
    const progress = Number.isFinite(draftProgress?.percent)
        ? (draftProgress?.percent ?? 0)
        : 0;
    return (
        <>
            <div
                className={`absolute top-2 left-2 text-xs px-2 py-1 rounded border ${chip}`}
            >
                {loopCount
                    ? `${loopCount} vector${loopCount === 1 ? '' : 's'}`
                    : 'Drop DXF/SVG, STL/OBJ, or an image here — or use File > Import File'}
            </div>
            <CursorReadout
                cursorRef={cursorRef}
                darkMode={darkMode}
                guidePlacement={guidePlacement}
                units={units}
            />
            {jobExceedsStock && (
                <div role="alert" className="absolute top-11 left-2 flex items-center gap-2 rounded border border-amber-500/70 bg-amber-100/95 px-2 py-1 text-xs font-medium text-amber-950 shadow dark:bg-amber-950/90 dark:text-amber-100">
                    <span>Job geometry exceeds the configured stock.</span>
                    {onAdjustStock && (
                        <button
                            type="button"
                            onClick={onAdjustStock}
                            className="rounded border border-amber-700/50 bg-white/70 px-1.5 py-0.5 font-semibold underline underline-offset-2 hover:bg-white dark:border-amber-300/50 dark:bg-amber-900/50 dark:hover:bg-amber-900"
                        >
                            Edit job stock
                        </button>
                    )}
                </div>
            )}
            {draftProgress &&
                createPortal(
                    <div
                        role="status"
                        className={`pointer-events-none fixed z-[100] flex items-center gap-2 text-xs px-2.5 py-1.5 rounded-lg border shadow-lg ${chip}`}
                        style={
                            progressPosition
                                ? {
                                      left: progressPosition.x,
                                      top: progressPosition.y,
                                  }
                                : { left: '50%', top: 12 }
                        }
                    >
                        <span className="whitespace-nowrap">
                            {draftProgress.label}
                        </span>
                        <span className="tabular-nums font-medium">
                            {Math.round(progress)}%
                        </span>
                        <span
                            aria-hidden="true"
                            className="w-16 h-1.5 rounded-full bg-slate-500/30 overflow-hidden"
                        >
                            <span
                                className="block h-full rounded-full bg-robin-500"
                                style={{
                                    width: `${Math.min(100, Math.max(0, progress))}%`,
                                }}
                            />
                        </span>
                    </div>,
                    document.body,
                )}
            {draftDimension && (
                <div
                    role="status"
                    className={`pointer-events-none absolute z-10 rounded border px-2 py-1 text-[11px] tabular-nums shadow ${chip}`}
                    style={{
                        left: draftDimension.x,
                        top: draftDimension.y,
                    }}
                >
                    {draftDimension.label}
                </div>
            )}
            <div className="absolute bottom-2 right-2 flex gap-1">
                <ZoomButton
                    label="+"
                    onClick={() => onZoom(1.25)}
                    darkMode={darkMode}
                />
                <ZoomButton
                    label="-"
                    onClick={() => onZoom(0.8)}
                    darkMode={darkMode}
                />
                <ZoomButton label="Fit" onClick={onFit} darkMode={darkMode} />
            </div>
        </>
    );
}

function CursorReadout({
    cursorRef,
    darkMode,
    guidePlacement,
    units,
}: {
    cursorRef: RefObject<Point | null>;
    darkMode: boolean;
    guidePlacement: 'x' | 'y' | null;
    units: UnitSystem;
}) {
    const cursor = cursorRef.current;
    if (!cursor) return null;
    return (
        <div
            className={`absolute bottom-2 left-2 text-xs px-2 py-1 rounded border tabular-nums ${darkMode ? 'bg-dark/80 border-robin-900 text-slate-300' : 'bg-white/90 border-slate-300 text-slate-600'}`}
        >
            {guidePlacement
                ? `${guidePlacement === 'x' ? 'Vertical' : 'Horizontal'} guide: ${displayValue(guidePlacement === 'x' ? cursor.x : cursor.y, units, 2)} ${lengthUnit(units)}`
                : `X ${displayValue(cursor.x, units, 2)} · Y ${displayValue(cursor.y, units, 2)} ${lengthUnit(units)}`}
        </div>
    );
}

function ZoomButton({
    label,
    onClick,
    darkMode,
}: {
    label: string;
    onClick(): void;
    darkMode: boolean;
}) {
    return (
        <button
            onClick={onClick}
            className={`w-8 h-8 rounded border text-sm ${darkMode ? 'bg-dark/80 border-robin-900 text-slate-200 hover:bg-dark-lighter' : 'bg-white/90 border-slate-300 text-slate-600 hover:bg-slate-100'}`}
        >
            {label}
        </button>
    );
}
