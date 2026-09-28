/**
 * Purpose: Implementation module for RasterLaserFields in the react domain.
 */
import type { Operation } from '../lib/engine';
import { UnitInput } from '../components/UnitInput';
import { feedUnit, lengthUnit, type UnitSystem } from '../lib/units';

interface RasterLaserFieldsProps {
    operation: Operation;
    units: UnitSystem;
    laserFeed: number;
    onLaserFeedChange(value: number): void;
    laserPower: number;
    onLaserPowerChange(value: number): void;
    laserSpot: number;
    onLaserSpotChange(value: number): void;
    laserGamma: number;
    onLaserGammaChange(value: number): void;
    laserSMin: number;
    onLaserSMinChange(value: number): void;
    laserSMax: number;
    onLaserSMaxChange(value: number): void;
    laserOverscan: number;
    onLaserOverscanChange(value: number): void;
}

/** Laser-cut controls and raster-only power mapping controls. */
export function RasterLaserFields({
    operation,
    units,
    laserFeed,
    onLaserFeedChange,
    laserPower,
    onLaserPowerChange,
    laserSpot,
    onLaserSpotChange,
    laserGamma,
    onLaserGammaChange,
    laserSMin,
    onLaserSMinChange,
    laserSMax,
    onLaserSMaxChange,
    laserOverscan,
    onLaserOverscanChange,
}: RasterLaserFieldsProps) {
    const isLaser = operation === 'laser-cut' || operation === 'laser-raster';
    if (!isLaser) return null;
    return (
        <>
            {operation === 'laser-raster' && (
                <div className="grid grid-cols-2 gap-2">
                    <label className="space-y-1">
                        <span className="text-slate-500 dark:text-slate-400">
                            Spot ({lengthUnit(units)})
                        </span>
                        <UnitInput
                            units={units}
                            stepMm={0.05}
                            minMm={0.05}
                            valueMm={laserSpot}
                            onChangeMm={onLaserSpotChange}
                            className="w-full rounded bg-slate-100 dark:bg-dark-lighter border border-slate-300 dark:border-robin-900 px-2 py-1 text-slate-900 dark:text-white"
                        />
                    </label>
                    <NumberField
                        label="Gamma"
                        value={laserGamma}
                        min={0.1}
                        step={0.1}
                        onChange={onLaserGammaChange}
                    />
                    <NumberField
                        label="Min Power S"
                        value={laserSMin}
                        min={0}
                        max={1000}
                        onChange={onLaserSMinChange}
                    />
                    <label className="space-y-1">
                        <span className="text-slate-500 dark:text-slate-400">
                            Overscan ({lengthUnit(units)})
                        </span>
                        <UnitInput
                            units={units}
                            stepMm={0.1}
                            minMm={0}
                            valueMm={laserOverscan}
                            onChangeMm={onLaserOverscanChange}
                            className="w-full rounded bg-slate-100 dark:bg-dark-lighter border border-slate-300 dark:border-robin-900 px-2 py-1 text-slate-900 dark:text-white"
                        />
                    </label>
                    <NumberField
                        label="Max Power S"
                        value={laserSMax}
                        min={0}
                        max={1000}
                        onChange={onLaserSMaxChange}
                    />
                </div>
            )}
            <div className="grid grid-cols-2 gap-2">
                <label className="space-y-1">
                    <span className="text-slate-500 dark:text-slate-400">
                        Feed ({feedUnit(units)})
                    </span>
                    <UnitInput
                        units={units}
                        kind="feed"
                        valueMm={laserFeed}
                        onChangeMm={onLaserFeedChange}
                        className="w-full rounded bg-slate-100 dark:bg-dark-lighter border border-slate-300 dark:border-robin-900 px-2 py-1 text-slate-900 dark:text-white"
                    />
                </label>
                <NumberField
                    label="Power S"
                    value={laserPower}
                    min={0}
                    max={1000}
                    onChange={onLaserPowerChange}
                />
            </div>
        </>
    );
}

function NumberField({
    label,
    value,
    min,
    max,
    step,
    onChange,
}: {
    label: string;
    value: number;
    min?: number;
    max?: number;
    step?: number;
    onChange(value: number): void;
}) {
    return (
        <label className="space-y-1">
            <span className="text-slate-500 dark:text-slate-400">{label}</span>
            <input
                type="number"
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={(event) => onChange(Number(event.target.value))}
                className="w-full rounded bg-slate-100 dark:bg-dark-lighter border border-slate-300 dark:border-robin-900 px-2 py-1 text-slate-900 dark:text-white"
            />
        </label>
    );
}
