/**
 * Purpose: Implementation module for VBitRasterFields in the react domain.
 */
import type { Operation } from '../lib/engine';
import { UnitInput } from '../components/UnitInput';
import { feedUnit, lengthUnit, type UnitSystem } from '../lib/units';

interface VBitRasterFieldsProps {
    operation: Operation;
    units: UnitSystem;
    halftoneResolution: number;
    onHalftoneResolutionChange(value: number): void;
    halftoneInvert: boolean;
    onHalftoneInvertChange(value: boolean): void;
    wavySpacing: number;
    onWavySpacingChange(value: number): void;
    wavyFeed: number;
    onWavyFeedChange(value: number): void;
    wavyShallow: number;
    onWavyShallowChange(value: number): void;
    wavyDeep: number;
    onWavyDeepChange(value: number): void;
}

/** Bitmap-driven V-bit controls: dots for halftone, depth waves for wavy raster. */
export function VBitRasterFields({
    operation,
    units,
    halftoneResolution,
    onHalftoneResolutionChange,
    halftoneInvert,
    onHalftoneInvertChange,
    wavySpacing,
    onWavySpacingChange,
    wavyFeed,
    onWavyFeedChange,
    wavyShallow,
    onWavyShallowChange,
    wavyDeep,
    onWavyDeepChange,
}: VBitRasterFieldsProps) {
    if (operation === 'halftone')
        return (
            <div className="grid grid-cols-2 gap-2">
                <label className="space-y-1">
                    <span className="text-slate-500 dark:text-slate-400">
                        Holes across
                    </span>
                    <input
                        type="number"
                        min={2}
                        max={100}
                        value={halftoneResolution}
                        onChange={(event) =>
                            onHalftoneResolutionChange(
                                Number(event.target.value),
                            )
                        }
                        className="w-full rounded bg-slate-100 dark:bg-dark-lighter border border-slate-300 dark:border-robin-900 px-2 py-1 text-slate-900 dark:text-white"
                    />
                </label>
                <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 mt-5">
                    <input
                        type="checkbox"
                        checked={halftoneInvert}
                        onChange={(event) =>
                            onHalftoneInvertChange(event.target.checked)
                        }
                        className="accent-robin-500"
                    />
                    Light = large
                </label>
            </div>
        );
    if (operation !== 'wavy-raster') return null;
    return (
        <div className="grid grid-cols-3 gap-2">
            <Field
                label={`Spacing (${lengthUnit(units)})`}
                units={units}
                value={wavySpacing}
                min={0.2}
                step={0.1}
                onChange={onWavySpacingChange}
            />
            <Field
                label={`Feed (${feedUnit(units)})`}
                units={units}
                kind="feed"
                value={wavyFeed}
                min={100}
                step={10}
                onChange={onWavyFeedChange}
            />
            <Field
                label={`Shallow (${lengthUnit(units)})`}
                units={units}
                value={wavyShallow}
                min={0}
                step={0.1}
                onChange={onWavyShallowChange}
            />
            <Field
                label={`Deep (${lengthUnit(units)})`}
                units={units}
                value={wavyDeep}
                min={0.1}
                step={0.1}
                onChange={onWavyDeepChange}
            />
        </div>
    );
}

function Field({
    label,
    units,
    kind,
    value,
    min,
    step,
    onChange,
}: {
    label: string;
    units: UnitSystem;
    kind?: 'feed';
    value: number;
    min: number;
    step: number;
    onChange(value: number): void;
}) {
    return (
        <label className="space-y-1">
            <span className="text-slate-500 dark:text-slate-400">{label}</span>
            <UnitInput
                units={units}
                kind={kind}
                stepMm={step}
                minMm={min}
                valueMm={value}
                onChangeMm={onChange}
                className="w-full rounded bg-slate-100 dark:bg-dark-lighter border border-slate-300 dark:border-robin-900 px-2 py-1 text-slate-900 dark:text-white"
            />
        </label>
    );
}
