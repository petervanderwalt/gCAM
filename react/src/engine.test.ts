import {
    buildProfileGcode,
    buildToolpathGcode,
    combineToolpaths,
} from './lib/engine';
import { createToolpathFromLoops } from './engine/cam-ops.js';

const SQUARE = [
    { x: 0, y: 0 },
    { x: 20, y: 0 },
    { x: 20, y: 20 },
    { x: 0, y: 20 },
    { x: 0, y: 0 },
];

test('real pipeline emits gCAM GRBL for a profiled square', async () => {
    const g = await buildProfileGcode({
        loops: [{ points: SQUARE }],
        toolDiameter: 6,
        cutDepth: 3,
        fileName: 'test',
    });
    expect(g).toContain('(gCAM GRBL output)');
    // offset square corner at -3,-3 with a 6mm tool
    expect(g).toContain('X-3');
    expect(g).toContain('M3');
    expect(g.trim().endsWith('M30')).toBe(true);
});

test('real pipeline rejects empty selection', async () => {
    await expect(
        buildProfileGcode({ loops: [], toolDiameter: 6, cutDepth: 3 }),
    ).rejects.toThrow(/No vectors/);
});

test('vcarve without a worker rejects instead of hanging', async () => {
    await expect(
        buildToolpathGcode({
            loops: [{ points: SQUARE }],
            operation: 'vcarve',
            toolDiameter: 6,
            cutDepth: 3,
        }),
    ).rejects.toThrow();
});

test('combineToolpaths merges two ops into one program', () => {
    const mk = (operation: 'profile-outside' | 'pocket') =>
        createToolpathFromLoops([{ points: SQUARE }], {
            operation,
            toolDiameter: 6,
            toolRadius: 3,
            cutterAngle: 90,
            overlapPercent: 40,
            cutDepth: 3,
            passDepth: 3,
            trochoidEnabled: false,
            trochoidRadius: 0,
            trochoidEngagementPercent: 10,
            tabWidth: 9,
            tabHeight: 0,
            safeZ: 5,
            feedRate: 1800,
            plungeRate: 600,
            spindle: 18000,
            toolNumber: 1,
        });
    const g = combineToolpaths([
        mk('profile-outside') as unknown as Record<string, unknown>,
        mk('pocket') as unknown as Record<string, unknown>,
    ]);
    expect(g).toContain('Profile Outside');
    expect(g).toContain('Pocket');
    expect(g.trim().endsWith('M30')).toBe(true);
});

test('per-toolpath overrides flow into the program', async () => {
    const r = await buildToolpathGcode({
        loops: [{ points: SQUARE }],
        operation: 'profile-outside',
        toolDiameter: 6,
        cutDepth: 3,
        toolNumber: 2,
        tabWidth: 12,
        overlapPercent: 55,
        wavyFeed: 1500,
        fileName: 'test',
    });
    expect(r.toolpath).toMatchObject({ toolNumber: 2, tabWidth: 12 });
    expect(r.gcode).toContain('T2');
});
