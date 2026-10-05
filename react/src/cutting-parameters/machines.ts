/**
 * Purpose: Named machine and spindle presets consumed by the recommendation engine.
 * Feed limits are motion limits, not a promise that every material/tool combination can cut at them.
 */
import type { MachineProfile } from './types';

export const MACHINE_PROFILES: MachineProfile[] = [
    {
        id: 'longmill-router',
        displayName: 'LongMill MK2 30x30',
        revision: '2026-09',
        maxXYFeedMmMin: 4000,
        maxZFeedMmMin: 3000,
        spindleMinRpm: 10000,
        spindleMaxRpm: 30000,
        maxXTravelMm: 810,
        maxYTravelMm: 855,
        maxZTravelMm: 120,
    },
    {
        id: 'longmill-mk2-48x30',
        displayName: 'LongMill MK2 48x30',
        revision: '2026-09',
        maxXYFeedMmMin: 4000,
        maxZFeedMmMin: 3000,
        spindleMinRpm: 10000,
        spindleMaxRpm: 30000,
        maxXTravelMm: 1260,
        maxYTravelMm: 855,
        maxZTravelMm: 120,
    },
    {
        id: 'longmill-mk3-30x30',
        displayName: 'LongMill MK3 30x30',
        revision: '2026-09',
        maxXYFeedMmMin: 4000,
        maxZFeedMmMin: 3000,
        spindleMinRpm: 10000,
        spindleMaxRpm: 30000,
        maxXTravelMm: 810,
        maxYTravelMm: 855,
        maxZTravelMm: 120,
    },
    {
        id: 'longmill-mk3-48x30',
        displayName: 'LongMill MK3 48x30',
        revision: '2026-09',
        maxXYFeedMmMin: 4000,
        maxZFeedMmMin: 3000,
        spindleMinRpm: 10000,
        spindleMaxRpm: 30000,
        maxXTravelMm: 1296,
        maxYTravelMm: 812,
        maxZTravelMm: 129,
    },
    {
        id: 'altmill-spindle',
        displayName: 'AltMill MK2 4x4',
        revision: '2026-09',
        maxXYFeedMmMin: 15000,
        maxZFeedMmMin: 6000,
        spindleMinRpm: 6000,
        spindleMaxRpm: 24000,
        maxXTravelMm: 1260,
        maxYTravelMm: 1248,
        maxZTravelMm: 170,
    },
];

export const CUSTOM_MACHINE_PROFILE_ID = 'custom';

export const DEFAULT_MACHINE_PROFILE = MACHINE_PROFILES.find(
    (profile) => profile.id === 'altmill-spindle',
) ?? MACHINE_PROFILES[0];

export function machineProfileById(id: string | null | undefined) {
    return MACHINE_PROFILES.find((profile) => profile.id === id) ?? null;
}
