/**
 * Tests: grouped contours share one nesting unit; two parts share one row on a wide sheet; tallest-first ordering packs rows tightly; oversize part reports its index; and related cases.
 */
import { buildNestUnits, nestPlacements, placedNestPoint } from './nest';

test('grouped contours share one nesting unit', () => {
    const units = buildNestUnits([
        {
            groupId: 'letter-o',
            points: [
                { x: 0, y: 0 },
                { x: 40, y: 40 },
            ],
        },
        {
            groupId: 'letter-o',
            points: [
                { x: 10, y: 10 },
                { x: 30, y: 30 },
            ],
        },
        {
            points: [
                { x: 100, y: 0 },
                { x: 120, y: 20 },
            ],
        },
    ]);

    expect(units).toHaveLength(2);
    expect(units[0]).toMatchObject({
        groupId: 'letter-o',
        width: 40,
        height: 40,
    });
    expect(units[0].loops).toHaveLength(2);
});

test('two parts share one row on a wide sheet', () => {
    const r = nestPlacements(
        [
            { width: 20, height: 10 },
            { width: 20, height: 10 },
        ],
        100,
        100,
        5,
        2,
    );
    expect(r.failedIndex).toBeNull();
    expect(r.placements[0]).toMatchObject({ dx: 5, dy: 5 });
    expect(r.placements[1]).toMatchObject({ dx: 27, dy: 5 });
});

test('rotation packs the former two-row layout into one short row', () => {
    const result = nestPlacements(
        [
            { width: 60, height: 10 },
            { width: 20, height: 40 },
        ],
        70,
        40,
        0,
        0,
    );
    expect(result.failedIndex).toBeNull();
    expect(result.placements.some((p) => p.turns !== 0)).toBe(true);
});

test('rotation fits a part that cannot fit in its original orientation', () => {
    expect(
        nestPlacements([{ width: 40, height: 15 }], 20, 45, 0, 0, 0)
            .failedIndex,
    ).toBe(0);
    expect(
        nestPlacements([{ width: 40, height: 15 }], 20, 45, 0, 0, 90)
            .failedIndex,
    ).toBeNull();
});

test('15-degree search finds a diagonal fit unavailable at quarter turns', () => {
    expect(
        nestPlacements([{ width: 30, height: 5 }], 26, 26, 0, 0, 90)
            .failedIndex,
    ).toBe(0);
    const result = nestPlacements([{ width: 30, height: 5 }], 26, 26, 0, 0, 15);
    expect(result.failedIndex).toBeNull();
    expect(result.placements[0].turns % 1).not.toBe(0);
});

test('concave outlines can share overlapping bounding boxes without overlap', () => {
    const points = [
        { x: 0, y: 0 },
        { x: 30, y: 0 },
        { x: 30, y: 10 },
        { x: 10, y: 10 },
        { x: 10, y: 30 },
        { x: 0, y: 30 },
        { x: 0, y: 0 },
    ];
    const units = buildNestUnits([{ points }, { points }]);
    const result = nestPlacements(units, 42, 42, 0, 0, 90);
    expect(result.failedIndex).toBeNull();
    const boxes = units.map((unit, i) =>
        unit.loops[0].points.map((p) =>
            placedNestPoint(p, unit, result.placements[i]),
        ),
    );
    for (const points of boxes)
        for (const p of points) {
            expect(p.x).toBeGreaterThanOrEqual(0);
            expect(p.y).toBeGreaterThanOrEqual(0);
            expect(p.x).toBeLessThanOrEqual(42);
            expect(p.y).toBeLessThanOrEqual(42);
        }
});

test('a rotated grouped letter keeps its inner contour and distances', () => {
    const units = buildNestUnits([
        {
            groupId: 'd',
            points: [
                { x: 10, y: 20 },
                { x: 50, y: 20 },
                { x: 50, y: 35 },
                { x: 10, y: 35 },
            ],
        },
        {
            groupId: 'd',
            points: [
                { x: 20, y: 24 },
                { x: 30, y: 24 },
                { x: 30, y: 30 },
                { x: 20, y: 30 },
            ],
        },
    ]);
    const result = nestPlacements(units, 20, 45, 0, 0);
    expect(result.failedIndex).toBeNull();
    const a = placedNestPoint(
        units[0].loops[0].points[0],
        units[0],
        result.placements[0],
    );
    const b = placedNestPoint(
        units[0].loops[1].points[0],
        units[0],
        result.placements[0],
    );
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeCloseTo(Math.hypot(10, 4));
});

test('oversize part reports its index', () => {
    const r = nestPlacements([{ width: 200, height: 10 }], 100, 100, 5, 2);
    expect(r.failedIndex).toBe(0);
});

test('cutter envelope reserves clearance', () => {
    const r = nestPlacements(
        [{ width: 20, height: 20, envelope: 3 }],
        100,
        100,
        5,
        2,
    );
    expect(r.placements[0]).toMatchObject({ dx: 8, dy: 8 });
});

test('rectangle clearances survive word-boundary shifts and rotation', () => {
    const items = Array.from({ length: 8 }, (_, i) => ({
        width: 17 + i * 2,
        height: 10 + (i % 3) * 4,
        envelope: 1,
    }));
    const result = nestPlacements(items, 160, 100, 3, 3, 90);
    expect(result.failedIndex).toBeNull();
    const boxes = items.map((item, i) => {
        const p = result.placements[i],
            swap = p.turns % 2 === 1;
        return {
            x: p.dx,
            y: p.dy,
            w: swap ? item.height : item.width,
            h: swap ? item.width : item.height,
        };
    });
    for (const a of boxes) {
        expect(a.x).toBeGreaterThanOrEqual(4);
        expect(a.y).toBeGreaterThanOrEqual(4);
        expect(a.x + a.w).toBeLessThanOrEqual(156);
        expect(a.y + a.h).toBeLessThanOrEqual(96);
    }
    for (let i = 0; i < boxes.length; i++)
        for (let j = i + 1; j < boxes.length; j++) {
            const a = boxes[i],
                b = boxes[j];
            const dx = Math.max(0, a.x - b.x - b.w, b.x - a.x - a.w),
                dy = Math.max(0, a.y - b.y - b.h, b.y - a.y - a.h);
            expect(Math.hypot(dx, dy)).toBeGreaterThanOrEqual(5 - 1e-8);
        }
});

test.each([NaN, Infinity, -1])(
    'invalid sheet dimensions fail without partial placements: %s',
    (width) => {
        expect(
            nestPlacements([{ width: 10, height: 10 }], width, 100, 0, 0),
        ).toEqual({ placements: [], failedIndex: 0 });
    },
);

test('letter holes remain reserved instead of receiving loose parts', () => {
    const square = (size: number) => [
        { x: 0, y: 0 },
        { x: size, y: 0 },
        { x: size, y: size },
        { x: 0, y: size },
        { x: 0, y: 0 },
    ];
    const units = buildNestUnits([
        { groupId: 'letter', points: square(40) },
        {
            groupId: 'letter',
            points: square(30).map((p) => ({ x: p.x + 5, y: p.y + 5 })),
        },
        { points: square(5) },
    ]);
    expect(nestPlacements(units, 40, 40, 0, 0).failedIndex).not.toBeNull();
});

test('a border larger than the sheet and excessive gaps fail safely', () => {
    expect(
        nestPlacements([{ width: 10, height: 10 }], 10, 10, 10, 100).placements,
    ).toEqual([]);
    expect(
        nestPlacements(
            [
                { width: 10, height: 10 },
                { width: 10, height: 10 },
            ],
            100,
            100,
            0,
            1e10,
        ).placements,
    ).toEqual([]);
});
