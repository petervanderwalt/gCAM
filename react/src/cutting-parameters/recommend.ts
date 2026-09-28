/**
 * Purpose: Pure, explainable material, cutter, machine, and operation recommendation math.
 */
import { MATERIAL_RECIPES } from './recipes';
import type { CuttingRecommendation, RecommendationInput } from './types';

const midpoint = (range: { min: number; max: number }) =>
    (range.min + range.max) / 2;

function clamp(value: number, min: number, max: number) {
    return Math.max(min, Math.min(max, value));
}

function chooseRpm(target: number, input: RecommendationInput) {
    const { machine } = input;
    const candidates = machine.availableRpm?.filter(
        (rpm) => rpm >= machine.spindleMinRpm && rpm <= machine.spindleMaxRpm,
    );
    if (!candidates?.length) {
        return clamp(target, machine.spindleMinRpm, machine.spindleMaxRpm);
    }
    return candidates.reduce((best, rpm) =>
        Math.abs(rpm - target) < Math.abs(best - target) ? rpm : best,
    );
}

/** Returns a conservative starting recommendation; callers must save the result as a snapshot. */
export function recommendCuttingParameters(
    input: RecommendationInput,
): CuttingRecommendation {
    const { cutter, machine, operation, preference = 'standard' } = input;
    if (!(cutter.diameterMm > 0))
        throw new Error('Cutter diameter is required.');
    if (!(cutter.flutes > 0))
        throw new Error('Cutter flute count is required.');
    if (!(machine.spindleMaxRpm >= machine.spindleMinRpm)) {
        throw new Error('Machine spindle RPM range is invalid.');
    }
    const recipe = MATERIAL_RECIPES[input.material];
    const constraints: string[] = [];
    const safety = preference === 'conservative' ? 0.8 : 1;
    const targetSurfaceSpeed = midpoint(recipe.surfaceSpeedMMin) * safety;
    const unconstrainedRpm =
        (1000 * targetSurfaceSpeed) / (Math.PI * cutter.diameterMm);
    const rpm = Math.round(chooseRpm(unconstrainedRpm, input));
    if (rpm !== Math.round(unconstrainedRpm))
        constraints.push('Spindle RPM limit applied.');

    const targetChipLoad = midpoint(recipe.chipLoadMmTooth) * safety;
    const requestedFeed = targetChipLoad * cutter.flutes * rpm;
    const feedMmMin = Math.round(
        Math.min(requestedFeed, machine.maxXYFeedMmMin),
    );
    if (feedMmMin < requestedFeed)
        constraints.push('Machine XY feed limit applied.');

    const operationFactor =
        operation === 'pocket' ? 1 : operation === 'surfacing' ? 0.35 : 0.6;
    const recipeDepth =
        cutter.diameterMm *
        recipe.maxPassDepthDiameterRatio *
        operationFactor *
        safety;
    const cuttingLengthLimit = cutter.cuttingLengthMm
        ? cutter.cuttingLengthMm * 0.8
        : Number.POSITIVE_INFINITY;
    const stockLimit = input.stockDepthMm ?? Number.POSITIVE_INFINITY;
    const passDepthMm = Number(
        Math.min(recipeDepth, cuttingLengthLimit, stockLimit).toFixed(2),
    );
    if (passDepthMm < recipeDepth)
        constraints.push('Cutter or stock depth limit applied.');

    const plungeMmMin = Math.round(
        Math.min(
            feedMmMin * (recipe.plungeFeedPercent / 100),
            machine.maxZFeedMmMin,
        ),
    );
    const stepoverPercent = Number(
        (
            recipe.maxStepoverPercent *
            (operation === 'pocket' ? 1 : 0.6) *
            safety
        ).toFixed(1),
    );
    return {
        rpm,
        feedMmMin,
        plungeMmMin,
        passDepthMm,
        stepoverPercent,
        recipe,
        constraints,
    };
}
