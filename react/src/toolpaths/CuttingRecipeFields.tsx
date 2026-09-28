/**
 * Purpose: Material selection and readable automatic cutting recommendation.
 */
import { MATERIAL_RECIPES } from '../cutting-parameters/recipes';
import type {
    CuttingRecommendation,
    MaterialId,
} from '../cutting-parameters/types';
import {
    displayFeed,
    displayValue,
    feedUnit,
    lengthUnit,
    type UnitSystem,
} from '../lib/units';

export function CuttingRecipeFields({
    material,
    onMaterialChange,
    recommendation,
    units,
}: {
    material: MaterialId;
    onMaterialChange: (material: MaterialId) => void;
    recommendation: CuttingRecommendation | null;
    units: UnitSystem;
}) {
    return (
        <section className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2 dark:border-robin-900 dark:bg-dark-lighter/40">
            <label
                className="block text-xs font-medium text-slate-600 dark:text-slate-300"
                htmlFor="cutting-material"
            >
                Material
            </label>
            <select
                id="cutting-material"
                value={material}
                onChange={(event) =>
                    onMaterialChange(event.target.value as MaterialId)
                }
                className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-900 dark:border-robin-900 dark:bg-dark dark:text-white"
            >
                {Object.values(MATERIAL_RECIPES).map((recipe) => (
                    <option key={recipe.id} value={recipe.id}>
                        {recipe.label}
                    </option>
                ))}
            </select>
            {recommendation ? (
                <div className="pt-1 text-xs text-slate-600 dark:text-slate-300">
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1 tabular-nums">
                        <span>Feed</span>
                        <span className="text-right">
                            {displayFeed(recommendation.feedMmMin, units)}{' '}
                            {feedUnit(units)}
                        </span>
                        <span>Plunge</span>
                        <span className="text-right">
                            {displayFeed(recommendation.plungeMmMin, units)}{' '}
                            {feedUnit(units)}
                        </span>
                        <span>Spindle</span>
                        <span className="text-right">
                            {recommendation.rpm.toLocaleString()} RPM
                        </span>
                        <span>Max DOC</span>
                        <span className="text-right">
                            {displayValue(recommendation.passDepthMm, units)}{' '}
                            {lengthUnit(units)}
                        </span>
                    </div>
                </div>
            ) : (
                <p className="text-xs text-amber-700 dark:text-amber-300">
                    Choose a catalog tool with diameter and flute count to
                    calculate a recommendation.
                </p>
            )}
        </section>
    );
}
