import { cxfTextStrokes, parseCxf } from './cxf.js';

const FONT = [
    '# Name: CourierCad',
    '# LetterSpacing: 3',
    '# WordSpacing: 6.75',
    '# LineSpacingFactor: 1',
    '[0041] A',
    'L 0,0,0,9',
    '[0061] a',
    'L 0,0,0,6',
    '[004f] O',
    'A 4.5,4.5,4.5,180,0',
    'A 4.5,4.5,4.5,0,180',
    '[0070] p',
    'L 0,6,0,-3',
].join('\n');

test('parses QCAD CXF metadata and preserves distinct upper/lowercase glyphs', () => {
    const font = parseCxf(FONT);
    expect(font.name).toBe('CourierCad');
    expect(font.letterSpacing).toBe(3);
    expect(font.wordSpacing).toBe(6.75);
    expect(font.glyphs.get('A'.codePointAt(0)!).strokes[0]).not.toEqual(
        font.glyphs.get('a'.codePointAt(0)!).strokes[0],
    );
});

test('samples CXF arcs and lays out mixed-case, multi-line text with line spacing', () => {
    const font = parseCxf(FONT);
    const strokes = cxfTextStrokes('O\np', font, {
        x: 10,
        y: 30,
        height: 9,
        lineSpacingFactor: 1,
    });
    expect(strokes.length).toBe(3);
    const arcPoints = [...strokes[0], ...strokes[1]];
    expect(
        Math.min(
            ...arcPoints.map((point: { x: number; y: number }) => point.y),
        ),
    ).toBeCloseTo(21, 0);
    expect(
        Math.max(
            ...arcPoints.map((point: { x: number; y: number }) => point.y),
        ),
    ).toBeCloseTo(30, 0);
    const descender = strokes[2];
    expect(
        Math.min(
            ...descender.map((point: { x: number; y: number }) => point.y),
        ),
    ).toBeCloseTo(7.2, 0);
    expect(
        Math.max(
            ...descender.map((point: { x: number; y: number }) => point.y),
        ),
    ).toBeCloseTo(16.2, 0);
});
