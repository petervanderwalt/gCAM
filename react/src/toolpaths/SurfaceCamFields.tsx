import { UnitInput } from '../components/UnitInput';
import type { UnitSystem } from '../lib/units';

export function SurfaceCamFields({
    operation, units, resolution, stepover, stepdown, allowance, boundary,
    onResolution, onStepover, onStepdown, onAllowance, onBoundary, hasModel, toolReady,
}: {
    operation: 'surface-clear' | 'surface-finish' | 'surface-waterline';
    units: UnitSystem;
    resolution: number;
    stepover: number;
    stepdown: number;
    allowance: number;
    boundary: number;
    onResolution(value: number): void;
    onStepover(value: number): void;
    onStepdown(value: number): void;
    onAllowance(value: number): void;
    onBoundary(value: number): void;
    hasModel: boolean;
    toolReady: boolean;
}) {
    const clearing = operation === 'surface-clear';
    const waterline = operation === 'surface-waterline';
    return (
        <section className="space-y-3 rounded-lg border border-slate-300 bg-slate-50 p-3 dark:border-robin-900 dark:bg-dark-lighter">
            <h3 className="font-medium text-slate-800 dark:text-white">{clearing ? '3D rough clearing' : waterline ? '3D waterline finishing' : '3D surface finishing'}</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
                {clearing
                    ? 'Requires a library flat-bottom endmill. WebGPU checks keep the cutter above the model, with an exact CPU fallback when WebGPU is unavailable.'
                    : waterline
                        ? 'Requires a library ball endmill. Generates constant-height contour bands that follow the compensated draped surface; CPU fallback is used when WebGPU is unavailable.'
                        : 'Requires a library ball endmill. Parallel passes follow the STL surface, then a compensated perimeter pass cleans exposed boundaries; CPU fallback is used when WebGPU is unavailable.'}
            </p>
            {!hasModel && <p className="text-xs text-red-600">Select a placed STL heightmap to machine its retained mesh.</p>}
            {hasModel && <p className="text-xs text-slate-500 dark:text-slate-400">Overhangs use the uppermost surface as a draped envelope; hidden undersides are intentionally skipped to keep the cutter out from underneath the model.</p>}
            {!toolReady && <p className="text-xs text-red-600">Choose a compatible configured tool from the tool library before generating paths.</p>}
            <label className="block space-y-1 text-xs text-slate-600 dark:text-slate-300">
                <span>Machining grid resolution ({units === 'imperial' ? 'in' : 'mm'})</span>
                <UnitInput units={units} minMm={0.05} maxMm={2} stepMm={0.05} valueMm={resolution} onChangeMm={onResolution} className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 dark:border-robin-900 dark:bg-dark" />
            </label>
            {!waterline && <label className="block space-y-1 text-xs text-slate-600 dark:text-slate-300">
                <span>Stepover ({units === 'imperial' ? 'in' : 'mm'})</span>
                <UnitInput units={units} minMm={0.05} stepMm={0.1} valueMm={stepover} onChangeMm={onStepover} className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 dark:border-robin-900 dark:bg-dark" />
            </label>}
            {!waterline && stepover < resolution && <p className="text-xs text-amber-700 dark:text-amber-300">Set grid resolution to at most the stepover to achieve the requested pass spacing.</p>}
            {(clearing || waterline) && <label className="block space-y-1 text-xs text-slate-600 dark:text-slate-300">
                <span>{waterline ? 'Z level spacing' : 'Stepdown'} ({units === 'imperial' ? 'in' : 'mm'})</span>
                <UnitInput units={units} minMm={0.05} stepMm={0.1} valueMm={stepdown} onChangeMm={onStepdown} className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 dark:border-robin-900 dark:bg-dark" />
            </label>}
            {clearing && <label className="block space-y-1 text-xs text-slate-600 dark:text-slate-300">
                <span>Stock to leave ({units === 'imperial' ? 'in' : 'mm'})</span>
                <UnitInput units={units} minMm={0} stepMm={0.05} valueMm={allowance} onChangeMm={onAllowance} className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 dark:border-robin-900 dark:bg-dark" />
            </label>}
            {!waterline && <label className="block space-y-1 text-xs text-slate-600 dark:text-slate-300">
                <span>Boundary overrun ({units === 'imperial' ? 'in' : 'mm'})</span>
                <UnitInput units={units} minMm={0} stepMm={0.1} valueMm={boundary} onChangeMm={onBoundary} className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 dark:border-robin-900 dark:bg-dark" />
                <span className="block text-[11px] text-slate-500 dark:text-slate-400">Extends the outer raster passes into surrounding stock. Must fit within job stock.</span>
            </label>}
        </section>
    );
}
