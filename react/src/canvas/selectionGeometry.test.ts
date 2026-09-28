/**
 * Tests: selection frame ignores hidden geometry; snap priority is endpoints, then guides, then grid.
 */
import { selectionFrame, snapDrawPoint } from './selectionGeometry';

const loops = [
    {
        id: 'square',
        points: [
            { x: 1, y: 2 },
            { x: 5, y: 2 },
            { x: 5, y: 6 },
            { x: 1, y: 6 },
        ],
    },
];

test('selection frame ignores hidden geometry', () => {
    expect(selectionFrame(loops, ['square'], [])).toEqual({
        minX: 1,
        minY: 2,
        maxX: 5,
        maxY: 6,
    });
    expect(selectionFrame(loops, ['square'], ['square'])).toBeNull();
});

test('snap priority is endpoints, then guides, then grid', () => {
    expect(
        snapDrawPoint(loops, [], { x: 1.2, y: 2.1 }, 10, {
            snap: true,
            spacingMm: 5,
        }),
    ).toEqual({ x: 1, y: 2 });
    expect(
        snapDrawPoint([], [], { x: 10.2, y: 4.9 }, 10, null, [
            { axis: 'x', pos: 10 },
        ]),
    ).toEqual({ x: 10, y: 4.9 });
});
