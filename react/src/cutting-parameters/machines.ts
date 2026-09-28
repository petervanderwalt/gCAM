/**
 * Purpose: Named machine and spindle presets consumed by the recommendation engine.
 * Feed limits are motion limits, not a promise that every material/tool combination can cut at them.
 */
import type { MachineProfile } from './types';

export const MACHINE_PROFILES: MachineProfile[] = [
    {
        id: 'longmill-router',
        displayName: 'LongMill with router',
        revision: '2026-09',
        maxXYFeedMmMin: 4000,
        maxZFeedMmMin: 3000,
        spindleMinRpm: 10000,
        spindleMaxRpm: 30000,
    },
    {
        id: 'altmill-spindle',
        displayName: 'AltMill with spindle',
        revision: '2026-09',
        maxXYFeedMmMin: 15000,
        maxZFeedMmMin: 6000,
        spindleMinRpm: 6000,
        spindleMaxRpm: 24000,
    },
];

export const DEFAULT_MACHINE_PROFILE = MACHINE_PROFILES[0];

export function machineProfileById(id: string | null | undefined) {
    return MACHINE_PROFILES.find((profile) => profile.id === id) ?? null;
}
