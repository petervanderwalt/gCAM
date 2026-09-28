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
