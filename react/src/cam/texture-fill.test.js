/**
 * Tests: Voronoi texture is deterministic and clipped to the selected vector; large selections are sampled across the whole area without stretched cells; crosshatch texture returns clipped two-point engraving strokes; crosshatch angle rotates both perpendicular passes; and related cases.
 */
import {
    crosshatchTextureContours,
    voronoiTextureContours,
} from './texture-fill.js';

const square = [
    { x: 0, y: 0 },
    { x: 20, y: 0 },
    { x: 20, y: 20 },
    { x: 0, y: 20 },
    { x: 0, y: 0 },
];

test('Voronoi texture is deterministic and clipped to the selected vector', () => {
    const first = voronoiTextureContours([square], 5);
    expect(first).toEqual(voronoiTextureContours([square], 5));
    expect(first.length).toBeGreaterThan(4);
    for (const contour of first) {
        for (const point of contour) {
            expect(point.x).toBeGreaterThanOrEqual(-0.01);
            expect(point.x).toBeLessThanOrEqual(20.01);
            expect(point.y).toBeGreaterThanOrEqual(-0.01);
            expect(point.y).toBeLessThanOrEqual(20.01);
        }
    }
});

test('large selections are sampled across the whole area without stretched cells', () => {
    const large = [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 50 },
        { x: 0, y: 50 },
        { x: 0, y: 0 },
    ];
    const contours = voronoiTextureContours([large], 5);
    expect(contours.length).toBeGreaterThan(100);
    const maxCellHeight = Math.max(
        ...contours.map((contour) => {
            const ys = contour.map((point) => point.y);
            return Math.max(...ys) - Math.min(...ys);
        }),
    );
    expect(maxCellHeight).toBeLessThan(15);
});

test('crosshatch texture returns clipped two-point engraving strokes', () => {
    const contours = crosshatchTextureContours([square], 5);
    expect(contours.length).toBeGreaterThan(4);
    expect(contours.every((contour) => contour.length === 2)).toBe(true);
});

test('crosshatch angle rotates both perpendicular passes', () => {
    const diagonal = crosshatchTextureContours([square], 5, 45);
    const axisAligned = crosshatchTextureContours([square], 5, 0);
    expect(axisAligned).not.toEqual(diagonal);
    expect(axisAligned.some(([a, b]) => Math.abs(a.y - b.y) < 0.001)).toBe(
        true,
    );
});

test('crosshatch keeps both passes when the selection is away from origin', () => {
    const translated = square.map((point) => ({
        x: point.x + 260,
        y: point.y + 870,
    }));
    const contours = crosshatchTextureContours([translated], 5, 45);
    const directions = new Set(
        contours.map(([a, b]) => Math.sign((b.y - a.y) * (b.x - a.x))),
    );
    expect(directions).toEqual(new Set([-1, 1]));
});
