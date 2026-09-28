/**
 * Tests: rejects unsafe machine values before G-code emission; keeps V-bit and tab constraints together with emission validation.
 */
import { validateToolpaths } from './gcode-validation.js';

const valid = {
    operation: 'profile-outside',
    label: 'Profile',
    safeZ: 5,
    feedRate: 1000,
    plungeRate: 300,
    spindle: 18000,
    toolDiameter: 6,
    cutDepth: 3,
    passDepth: 3,
    tabHeight: 0,
    tabs: [],
};

test('rejects unsafe machine values before G-code emission', () => {
    expect(() => validateToolpaths([{ ...valid, safeZ: 0 }])).toThrow(
        'Z Safe must be greater than zero',
    );
    expect(() => validateToolpaths([{ ...valid, passDepth: 4 }])).toThrow(
        'Pass depth must be greater than zero',
    );
});

test('keeps V-bit and tab constraints together with emission validation', () => {
    expect(() =>
        validateToolpaths([
            { ...valid, operation: 'texture-fill', cutterAngle: 180 },
        ]),
    ).toThrow('V-bit angle must be between 1 and 179 degrees');
    expect(() =>
        validateToolpaths([
            { ...valid, tabs: [{ contourIndex: 0, along: 5 }], tabWidth: 2 },
        ]),
    ).toThrow('Tab width must be between 3 and 50 mm');
});
