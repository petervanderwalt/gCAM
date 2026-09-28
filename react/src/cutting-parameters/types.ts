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
    /** A router dial can expose discrete speeds instead of arbitrary RPM. */
    availableRpm?: number[];
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
