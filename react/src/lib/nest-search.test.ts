import { buildNestUnits, placedNestPoint } from './nest';
import { NestSearch } from './nest-search';
import {
    polygonVariant,
    noFitPolygons,
    nestIntersects,
    translateNest,
    NEST_SCALE as S,
} from './nest-polygons';
const rectangle = (x: number, y: number, w: number, h: number) => ({
    points: [
        { x, y },
        { x: x + w, y },
        { x: x + w, y: y + h },
        { x, y: y + h },
        { x, y },
    ],
});

test('no-fit geometry reserves the full part gap', () => {
    const unit = buildNestUnits([rectangle(0, 0, 20, 10)])[0];
    const a = polygonVariant(unit, 0, 0, 6),
        b = polygonVariant(unit, 1, 0, 6);
    const nfp = noFitPolygons(a, b).flat();
    expect(Math.max(...nfp.map((p) => p.X)) / S).toBeGreaterThanOrEqual(26);
    expect(nestIntersects(a.paths, translateNest(b.paths, 25 * S, 0))).toBe(
        true,
    );
    expect(nestIntersects(a.paths, translateNest(b.paths, 27 * S, 0))).toBe(
        false,
    );
});

test('evolution keeps the best complete layout, margins, clearance and grouped interiors', () => {
    const units = buildNestUnits([
        { ...rectangle(10, 10, 40, 15), groupId: 'letter' },
        { ...rectangle(20, 14, 10, 6), groupId: 'letter' },
        rectangle(0, 0, 22, 14),
        rectangle(0, 0, 17, 11),
        rectangle(0, 0, 10, 30),
    ]);
    const search = new NestSearch({
        units,
        width: 100,
        height: 80,
        border: 4,
        gap: 5,
        rotationStep: 90,
    });
    const initial = search.bestArea;
    for (let i = 0; i < 20; i++) search.step();
    expect(search.best.failedIndex).toBeNull();
    expect(search.bestArea).toBeLessThanOrEqual(initial);
    const polygons = units.map((u, i) =>
        u.loops.map((loop) =>
            loop.points.map((p) =>
                placedNestPoint(p, u, search.best.placements[i]),
            ),
        ),
    );
    for (const loops of polygons)
        for (const p of loops.flat()) {
            expect(p.x).toBeGreaterThanOrEqual(4 - 1e-6);
            expect(p.y).toBeGreaterThanOrEqual(4 - 1e-6);
            expect(p.x).toBeLessThanOrEqual(96 + 1e-6);
            expect(p.y).toBeLessThanOrEqual(76 + 1e-6);
        }
    for (let i = 0; i < units.length; i++)
        for (let j = i + 1; j < units.length; j++) {
            const a = polygonVariant(
                    units[i],
                    i,
                    search.best.placements[i].turns,
                    4.9,
                ),
                b = polygonVariant(
                    units[j],
                    j,
                    search.best.placements[j].turns,
                    4.9,
                );
            const pa = search.best.placements[i],
                pb = search.best.placements[j];
            expect(
                nestIntersects(
                    translateNest(
                        a.paths,
                        (pa.dx + a.offsetX) * S,
                        (pa.dy + a.offsetY) * S,
                    ),
                    translateNest(
                        b.paths,
                        (pb.dx + b.offsetX) * S,
                        (pb.dy + b.offsetY) * S,
                    ),
                ),
            ).toBe(false);
        }
    const a = polygons[0][0][0],
        b = polygons[0][1][0];
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeCloseTo(Math.hypot(10, 4));
});

test('a sheet edge margin is independent of the between-part gap', () => {
    const units = buildNestUnits([rectangle(0, 0, 20, 10)]);
    const search = new NestSearch({
        units,
        width: 28,
        height: 18,
        border: 4,
        gap: 20,
        rotationStep: 0,
    });
    search.step();
    expect(search.best.failedIndex).toBeNull();
    expect(search.best.placements[0]).toMatchObject({ dx: 4, dy: 4 });
});

test('open shapes are rejected before searching', () => {
    const units = buildNestUnits([
        {
            points: [
                { x: 0, y: 0 },
                { x: 10, y: 0 },
                { x: 10, y: 10 },
            ],
        },
    ]);
    expect(
        () =>
            new NestSearch({
                units,
                width: 100,
                height: 100,
                border: 0,
                gap: 5,
                rotationStep: 90,
            }),
    ).toThrow('closed shapes');
});

test('polygon contacts improve a layout limited by the fast grid resolution', () => {
    const units = buildNestUnits([
        rectangle(0, 0, 20.1, 10.1),
        rectangle(0, 0, 20.1, 10.1),
        rectangle(0, 0, 20.1, 10.1),
    ]);
    const search = new NestSearch({
        units,
        width: 100,
        height: 30,
        border: 1,
        gap: 1,
        rotationStep: 0,
    });
    const initial = search.bestArea;
    search.step();
    expect(search.bestArea).toBeLessThan(initial);
});

test('rerunning a nest never replaces an already tighter valid layout with a worse seed', () => {
    const units = buildNestUnits([
        rectangle(2, 2, 10.1, 5.1),
        rectangle(13.2, 2, 10.1, 5.1),
    ]);
    const search = new NestSearch({
        units,
        width: 50,
        height: 20,
        border: 2,
        gap: 1,
        rotationStep: 0,
    });
    const initial = search.bestArea;
    for (let i = 0; i < 5; i++) search.step();
    expect(search.bestArea).toBeLessThanOrEqual(initial);
    expect(search.best.placements).toEqual([
        { dx: 2, dy: 2, turns: 0 },
        { dx: 13.2, dy: 2, turns: 0 },
    ]);
});

test('fills the sheet width instead of preserving a narrow tall arrangement', () => {
    const units = buildNestUnits(
        Array.from({ length: 4 }, (_, i) => rectangle(0, i * 25, 20, 20)),
    );
    const search = new NestSearch({
        units,
        width: 100,
        height: 120,
        border: 2,
        gap: 2,
        rotationStep: 0,
    });
    for (let i = 0; i < 8; i++) search.step();
    expect(search.best.failedIndex).toBeNull();
    const points = units.flatMap((u, i) =>
        u.loops.flatMap((l) =>
            l.points.map((p) =>
                placedNestPoint(p, u, search.best.placements[i]),
            ),
        ),
    );
    expect(Math.max(...points.map((p) => p.y))).toBeLessThan(25);
    expect(Math.max(...points.map((p) => p.x))).toBeGreaterThan(85);
});
