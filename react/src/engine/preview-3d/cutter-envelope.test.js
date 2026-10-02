import { ballTipCutterSurfaceZ } from './cutter-envelope.js';

test('simulated ball cutter envelope matches programmed tip height at groove center', () => {
    expect(ballTipCutterSurfaceZ(-2, 0, 3)).toBe(-2);
    expect(ballTipCutterSurfaceZ(-2, 3, 3)).toBe(Infinity);
    expect(ballTipCutterSurfaceZ(-2, 1.5, 3)).toBeCloseTo(-1.598);
});

test('rejects invalid ball cutter contact input', () => {
    expect(() => ballTipCutterSurfaceZ(-1, 0, 0)).toThrow(/positive radius/);
});
