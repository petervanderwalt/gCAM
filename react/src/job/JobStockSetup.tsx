import { Box } from 'lucide-react';
import { UnitInput } from '../components/UnitInput';
import { MATERIAL_RECIPES } from '../cutting-parameters/recipes';
import type { JobStock } from './stock';
import type { UnitSystem } from '../lib/units';

/** Shared physical workpiece, configured once per project. */
export function JobStockSetup({
    stock,
    units,
    onChange,
}: {
    stock: JobStock;
    units: UnitSystem;
    onChange: (stock: JobStock) => void;
}) {
    const update = (next: Partial<JobStock>) => onChange({ ...stock, ...next });
    return (
        <section className="border-b border-slate-200 p-3 space-y-2 dark:border-robin-900">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-900 dark:text-white">
                <Box size={16} className="text-robin-400" />
                Job stock
            </div>
            <div className="grid grid-cols-3 gap-2">
                {([
                    ['Width', 'widthMm'],
                    ['Height', 'heightMm'],
                    ['Thickness', 'thicknessMm'],
                ] as const).map(([label, field]) => (
                    <label key={field} className="text-xs text-slate-600 dark:text-slate-300">
                        {label}
                        <UnitInput
                            aria-label={`Stock ${label}`}
                            className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-robin-900 dark:bg-dark"
                            units={units}
                            valueMm={stock[field]}
                            minMm={0.1}
                            stepMm={1}
                            onChangeMm={(value) => update({ [field]: value })}
                        />
                    </label>
                ))}
            </div>
            <label className="block text-xs text-slate-600 dark:text-slate-300">
                Material
                <select
                    aria-label="Stock material"
                    className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 dark:border-robin-900 dark:bg-dark dark:text-white"
                    value={stock.material}
                    onChange={(event) => update({ material: event.target.value as JobStock['material'] })}
                >
                    {Object.values(MATERIAL_RECIPES).map((recipe) => (
                        <option key={recipe.id} value={recipe.id}>{recipe.label}</option>
                    ))}
                </select>
            </label>
            <p className="text-xs text-slate-500 dark:text-slate-400">
                Shared by all toolpaths and the stock-removal simulation.
            </p>
        </section>
    );
}
