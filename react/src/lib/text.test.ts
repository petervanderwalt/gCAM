import { textLoops } from './text';

test('stroke text produces one loop per glyph stroke', () => {
    const loops = textLoops('HI', { x: 0, y: 0 }, 12);
    // H = 3 strokes, I = 3 strokes
    expect(loops).toHaveLength(6);
    for (const loop of loops) expect(loop.points.length).toBeGreaterThan(1);
});

test('text height scales the cap height to 6 units', () => {
    const loops = textLoops('I', { x: 5, y: 5 }, 12);
    const ys = loops.flatMap((l) => l.points.map((p) => p.y));
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(12, 0);
});

test('unknown glyphs fall back instead of vanishing', () => {
    expect(textLoops('😀', { x: 0, y: 0 }, 12).length).toBeGreaterThan(0);
});

test('empty text yields no loops', () => {
    expect(textLoops('', { x: 0, y: 0 }, 12)).toHaveLength(0);
});
