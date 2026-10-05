/**
 * Purpose: Regression coverage for named machine capability presets.
 * Tests: Every preset has a valid spindle and axis envelope; lookup never guesses an unknown machine.
 */
import {
    DEFAULT_MACHINE_PROFILE,
    MACHINE_PROFILES,
    machineProfileById,
} from './machines';

test('machine presets have usable RPM and axis limits', () => {
    for (const machine of MACHINE_PROFILES) {
        expect(machine.maxXYFeedMmMin).toBeGreaterThan(0);
        expect(machine.maxZFeedMmMin).toBeGreaterThan(0);
        expect(machine.spindleMaxRpm).toBeGreaterThanOrEqual(
            machine.spindleMinRpm,
        );
    }
});

test('unknown machines are not silently mapped to a different profile', () => {
    expect(machineProfileById('unknown')).toBeNull();
});

test('AltMill MK2 4x4 is the first-use machine default', () => {
    expect(DEFAULT_MACHINE_PROFILE).toMatchObject({
        id: 'altmill-spindle',
        displayName: 'AltMill MK2 4x4',
        maxXTravelMm: 1260,
        maxYTravelMm: 1248,
    });
});

test('Sienci presets expose canonical names and grblHAL travel values', () => {
    expect(machineProfileById('longmill-mk3-48x30')).toMatchObject({
        displayName: 'LongMill MK3 48x30',
        maxXTravelMm: 1296,
        maxYTravelMm: 812,
        maxZTravelMm: 129,
    });
    expect(machineProfileById('longmill-mk3-30x30')).toMatchObject({
        displayName: 'LongMill MK3 30x30',
        maxXTravelMm: 810,
        maxYTravelMm: 855,
        maxZTravelMm: 120,
    });
    expect(machineProfileById('altmill-spindle')).toMatchObject({
        displayName: 'AltMill MK2 4x4',
        maxXTravelMm: 1260,
        maxYTravelMm: 1248,
        maxZTravelMm: 170,
    });
});
