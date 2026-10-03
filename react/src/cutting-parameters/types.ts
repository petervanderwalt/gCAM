/**
 * Purpose: Typed inputs and outputs for deterministic cutting recommendations.
 */
import type { ToolType } from '../tools/library';

export type MaterialId =
    | 'softwood'
    | 'hardwood'
    | 'sheet-goods'
    | 'aluminium'
    | 'brass'
    | 'acrylic'
    | 'hdpe'
    | 'foam';

export type RotaryOperation =
    | 'profile-outside'
    | 'profile-inside'
    | 'pocket'
    | 'engrave'
    | 'vcarve'
    | 'texture-fill'
    | 'surfacing';

export interface CutterGeometry {
    toolType: ToolType;
    diameterMm: number;
    flutes: number;
    cuttingLengthMm?: number | null;
    cutterMaterial?: string;
    fluteAngleDeg?: number | null;
}

export interface MachineProfile {
    id: string;
    displayName: string;
    revision: string;
    maxXYFeedMmMin: number;
    maxZFeedMmMin: number;
    spindleMinRpm: number;
    spindleMaxRpm: number;
    /** grblHAL $130-$132 travel distances in mm (firmware stores machine bounds as negative coordinates). */
    maxXTravelMm: number;
    maxYTravelMm: number;
    maxZTravelMm: number;
    /** A router dial can expose discrete speeds instead of arbitrary RPM. */
    availableRpm?: number[];
}

/** Travel envelope used by CAM validation: XY extents from job zero and negative Z from stock top. */
export interface MachineTravelLimits {
    maxXTravelMm: number | null;
    maxYTravelMm: number | null;
    minZTravelMm: number | null;
    maxZTravelMm: number | null;
}

export const EMPTY_MACHINE_TRAVEL_LIMITS: MachineTravelLimits = {
    maxXTravelMm: null,
    maxYTravelMm: null,
    minZTravelMm: null,
    maxZTravelMm: null,
};

export function normalizeMachineTravelLimits(value: unknown): MachineTravelLimits {
    const raw = value && typeof value === 'object' ? value as Partial<MachineTravelLimits> : {};
    const limit = (candidate: unknown, direction: 'positive' | 'negative') => {
        if (typeof candidate !== 'number' || !Number.isFinite(candidate)) return null;
        if (direction === 'positive' && candidate > 0) return candidate;
        if (direction === 'negative' && candidate < 0) return candidate;
        return null;
    };
    return {
        maxXTravelMm: limit(raw.maxXTravelMm, 'positive'),
        maxYTravelMm: limit(raw.maxYTravelMm, 'positive'),
        minZTravelMm: limit(raw.minZTravelMm, 'negative'),
        maxZTravelMm: limit(raw.maxZTravelMm, 'positive'),
    };
}

export interface MaterialRecipe {
    id: MaterialId;
    label: string;
    primaryConstraint: 'thermal' | 'force-power' | 'finish-grain' | 'finish';
    surfaceSpeedMMin: { min: number; max: number };
    chipLoadMmTooth: { min: number; max: number };
    maxPassDepthDiameterRatio: number;
    maxStepoverPercent: number;
    plungeFeedPercent: number;
}

export interface RecommendationInput {
    material: MaterialId;
    machine: MachineProfile;
    cutter: CutterGeometry;
    operation: RotaryOperation;
    stockDepthMm?: number;
    preference?: 'conservative' | 'standard';
}

export interface CuttingRecommendation {
    rpm: number;
    feedMmMin: number;
    plungeMmMin: number;
    passDepthMm: number;
    stepoverPercent: number;
    recipe: MaterialRecipe;
    constraints: string[];
}
