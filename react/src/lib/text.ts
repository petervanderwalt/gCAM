import {
    createOutlineText,
    createStrokeText,
    FONT_OPTIONS,
    loadOutlineFont,
} from '../engine/cad-font.js';

export interface TextPoint {
    x: number;
    y: number;
}

/** Single-line stroke text as placeable loops. */
export function textLoops(
    text: string,
    origin: TextPoint,
    height: number,
): { points: TextPoint[] }[] {
    const h = Number.isFinite(height) && height > 0 ? height : 20;
    const strokes: TextPoint[][] = createStrokeText(text, origin, h);
    return strokes.filter((s) => s.length >= 2).map((points) => ({ points }));
}

export { FONT_OPTIONS };

export async function outlineTextLoops(
    text: string,
    origin: TextPoint,
    height: number,
    fontId: string,
): Promise<{ points: TextPoint[] }[]> {
    const font = await loadOutlineFont(fontId);
    return createOutlineText(font, text, origin, height)
        .filter((points) => points.length >= 2)
        .map((points) => ({ points }));
}
