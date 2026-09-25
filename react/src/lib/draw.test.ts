import {
    arcPoints3,
    cubicBezierPoints,
    draftPoints,
    snapToEndpoints,
} from './draw';

test('rectangle draft closes the box', () => {
    const pts = draftPoints('rectangle', { ax: 0, ay: 0, bx: 20, by: 10 });
    expect(pts).toHaveLength(5);
    expect(pts?.[0]).toEqual({ x: 0, y: 0 });
    expect(pts?.[2]).toEqual({ x: 20, y: 10 });
    expect(pts?.[4]).toEqual({ x: 0, y: 0 });
});

test('line draft returns both endpoints snapped', () => {
    const pts = draftPoints('line', { ax: 0.04, ay: 0, bx: 20, by: 0 });
    expect(pts).toEqual([
        { x: 0, y: 0 },
        { x: 20, y: 0 },
    ]);
});

test('circle draft is a 72-segment loop of the right radius', () => {
    const pts = draftPoints('circle', { ax: 0, ay: 0, bx: 20, by: 0 });
    expect(pts).toHaveLength(73);
    // click center (0,0) then edge (20,0): radius 20, angle-0 point (20,0)
    expect(pts?.[0]).toEqual({ x: 20, y: 0 });
});

test('polygon draft honors side count and closes', () => {
    const pts = draftPoints('polygon', { ax: 0, ay: 0, bx: 20, by: 0 }, 6);
    expect(pts).toHaveLength(7);
    expect(pts?.[0]).toEqual(pts?.[6]);
    // radius 20 hexagon from edge angle 0: first vertex at (20, 0)
    expect(pts?.[0]).toEqual({ x: 20, y: 0 });
});
test('circumscribed polygon expands by 1/cos(pi/n)', () => {
    const pts = draftPoints(
        'polygon',
        { ax: 0, ay: 0, bx: 20, by: 0 },
        6,
        null,
        'circumscribed',
    );
    expect(pts).toHaveLength(7);
    // vertex radius 20/cos(30°), first vertex offset half a step
    const expected = 20 / Math.cos(Math.PI / 6);
    expect(pts?.[0].x).toBeCloseTo(expected * Math.cos(Math.PI / 6), 4);
});

test('grid snap rounds draft points to spacing', () => {
    const pts = draftPoints(
        'rectangle',
        { ax: 0, ay: 0, bx: 21, by: 9 },
        6,
        10,
    );
    expect(pts?.[2]).toEqual({ x: 20, y: 10 });
});

test('degenerate drags and nulls return null', () => {
    expect(
        draftPoints('rectangle', { ax: 0, ay: 0, bx: 0.1, by: 0 }),
    ).toBeNull();
    expect(draftPoints(null, { ax: 0, ay: 0, bx: 5, by: 5 })).toBeNull();
    expect(draftPoints('line', null)).toBeNull();
});
test('arc through three points bulges the right way', () => {
    const pts = arcPoints3(
        { x: 0, y: 0 },
        { x: 10, y: 10 },
        { x: 20, y: 0 },
        16,
    );
    expect(pts).toHaveLength(17);
    expect(pts?.[0].x).toBeCloseTo(0, 9);
    expect(pts?.[0].y).toBeCloseTo(0, 9);
    expect(pts?.[16].x).toBeCloseTo(20, 9);
    expect(pts?.[16].y).toBeCloseTo(0, 9);
    // midpoint rides high through the bulge: circle center (10,0) r=10
    expect(pts?.[8].y).toBeGreaterThan(5);
    expect(pts?.[8].x).toBeCloseTo(10, 0);
    expect(pts?.[8].y).toBeCloseTo(10, 0);
});
test('collinear arc points return null', () => {
    expect(
        arcPoints3({ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 10, y: 0 }),
    ).toBeNull();
});
test('cubic bezier starts/ends on its anchors', () => {
    const pts = cubicBezierPoints(
        { x: 0, y: 0 },
        { x: 0, y: 10 },
        { x: 10, y: 10 },
        { x: 10, y: 0 },
        8,
    );
    expect(pts).toHaveLength(9);
    expect(pts[0]).toEqual({ x: 0, y: 0 });
    expect(pts[8]).toEqual({ x: 10, y: 0 });
    expect(pts[4].y).toBeGreaterThan(5);
});
test('endpoint snap grabs loop ends within tolerance', () => {
    const loops = [
        {
            points: [
                { x: 0, y: 0 },
                { x: 10, y: 0 },
            ],
        },
    ];
    expect(snapToEndpoints(loops, { x: 0.5, y: 0.5 }, 2)).toEqual({
        x: 0,
        y: 0,
    });
    expect(snapToEndpoints(loops, { x: 5, y: 5 }, 2)).toEqual({ x: 5, y: 5 });
});
