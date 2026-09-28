/**
 * Purpose: Regression coverage for named machine capability presets.
 * Tests: Every preset has a valid spindle and axis envelope; lookup never guesses an unknown machine.
 */
import { MACHINE_PROFILES, machineProfileById } from './machines';

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
