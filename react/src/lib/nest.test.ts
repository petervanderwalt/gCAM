import { buildNestUnits, nestPlacements } from './nest';

test('grouped contours share one nesting unit', () => {
    const units = buildNestUnits([
        { groupId: 'letter-o', points: [{ x: 0, y: 0 }, { x: 40, y: 40 }] },
        { groupId: 'letter-o', points: [{ x: 10, y: 10 }, { x: 30, y: 30 }] },
        { points: [{ x: 100, y: 0 }, { x: 120, y: 20 }] },
    ]);

    expect(units).toHaveLength(2);
    expect(units[0]).toMatchObject({ groupId: 'letter-o', width: 40, height: 40 });
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
    expect(r.placements[0]).toEqual({ dx: 5, dy: 5 });
    expect(r.placements[1]).toEqual({ dx: 27, dy: 5 });
});

test('tallest-first ordering packs rows tightly', () => {
    const r = nestPlacements(
        [
            { width: 60, height: 10 },
            { width: 20, height: 40 },
        ],
        70,
        100,
        0,
        0,
    );
    expect(r.failedIndex).toBeNull();
    // tall part first at origin, wide part wraps to the next row
    expect(r.placements[1]).toEqual({ dx: 0, dy: 0 });
    expect(r.placements[0]).toEqual({ dx: 0, dy: 40 });
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
    expect(r.placements[0]).toEqual({ dx: 8, dy: 8 });
});
