/**
 * Tests: inspector geometry translates and scales a vector selection; inspector geometry derives regular polygon points from side count.
 */
import { inspectorGeometry } from './inspectorGeometry';

const square = {
    id: 'square',
    points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
        { x: 0, y: 0 },
    ],
};

test('inspector geometry translates and scales a vector selection', () => {
    const result = inspectorGeometry(
        square,
        { x: 20, y: 30, w: 20, h: 10, angle: 0 },
        0,
    );

    expect(result?.points).toEqual([
        { x: 20, y: 30 },
        { x: 40, y: 30 },
        { x: 40, y: 40 },
        { x: 20, y: 40 },
        { x: 20, y: 30 },
    ]);
});

test('inspector geometry derives regular polygon points from side count', () => {
    const result = inspectorGeometry(
        { ...square, sourceType: 'polygon' },
        {
            x: 0,
            y: 0,
            w: 10,
            h: 10,
            angle: 0,
            sides: 6,
            polygonMode: 'inscribed',
        },
        0,
    );

    expect(result?.points).toHaveLength(7);
    expect(result?.isPolygon).toBe(true);
});

test('editing a circumscribed polygon keeps all vertices on one circle', () => {
    const result = inspectorGeometry(
        { ...square, sourceType: 'polygon' },
        {
            x: 0,
            y: 0,
            w: 10,
            h: 10,
            angle: 0,
            radius: 10,
            sides: 6,
            polygonMode: 'circumscribed',
        },
        0,
    );

    expect(result?.points).toHaveLength(7);
    const points = result?.points.slice(0, -1) ?? [];
    const center = {
        x:
            (Math.min(...points.map((point) => point.x)) +
                Math.max(...points.map((point) => point.x))) /
            2,
        y:
            (Math.min(...points.map((point) => point.y)) +
                Math.max(...points.map((point) => point.y))) /
            2,
    };
    const radii = points.map((point) =>
        Math.hypot(point.x - center.x, point.y - center.y),
    );

    expect(Math.max(...radii) - Math.min(...radii)).toBeLessThan(1e-9);
    expect(radii[0]).toBeCloseTo(10 / Math.cos(Math.PI / 6), 8);
});
