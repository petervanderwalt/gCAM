/**
 * Purpose: Material selection and readable automatic cutting recommendation.
 */
import type {
    CuttingRecommendation,
} from '../cutting-parameters/types';
import {
    displayFeed,
    displayValue,
    feedUnit,
    lengthUnit,
    type UnitSystem,
} from '../lib/units';

export function CuttingRecipeFields({
    recommendation,
    units,
}: {
    recommendation: CuttingRecommendation | null;
    units: UnitSystem;
}) {
    return (
        <section className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2 dark:border-robin-900 dark:bg-dark-lighter/40">
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
