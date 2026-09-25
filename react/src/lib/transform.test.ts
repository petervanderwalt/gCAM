import {
    rotatePoints,
    scalePoints,
    scalePointsXY,
    translatePoints,
} from './transform';

const SQUARE = [
    { x: 0, y: 0 },
    { x: 20, y: 0 },
    { x: 20, y: 20 },
    { x: 0, y: 20 },
    { x: 0, y: 0 },
];

test('translate shifts every point', () => {
    const out = translatePoints(SQUARE, 5, -5);
    expect(out[0]).toEqual({ x: 5, y: -5 });
    expect(out[2]).toEqual({ x: 25, y: 15 });
});

test('non-uniform scale stretches about the given origin', () => {
    const out = scalePointsXY(SQUARE, 2, 0.5, { x: 0, y: 0 });
    expect(out[2]).toEqual({ x: 40, y: 10 });
});

test('non-uniform scale rejects non-positive factors', () => {
    expect(() => scalePointsXY(SQUARE, 0, 1)).toThrow();
    expect(() => scalePointsXY(SQUARE, 1, -1)).toThrow();
});

test('rotate 90 about centroid swaps extents', () => {
    const out = rotatePoints(SQUARE, 90);
    // square centered (10,10) is invariant as a set; check a corner maps
    expect(out[0].x).toBeCloseTo(20, 9);
    expect(out[0].y).toBeCloseTo(0, 9);
});

test('rotate 180 returns mirrored corners', () => {
    const out = rotatePoints(SQUARE, 180);
    expect(out[0].x).toBeCloseTo(20, 9);
    expect(out[0].y).toBeCloseTo(20, 9);
});

test('scale doubles about centroid', () => {
    const out = scalePoints(SQUARE, 2);
    expect(out[0]).toEqual({ x: -10, y: -10 });
    expect(out[2]).toEqual({ x: 30, y: 30 });
});

test('scale rejects non-positive factors', () => {
    expect(() => scalePoints(SQUARE, 0)).toThrow(/positive/);
    expect(() => scalePoints(SQUARE, -2)).toThrow(/positive/);
});
