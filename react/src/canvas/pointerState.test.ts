/**
 * Tests: canvas pointer state.
 */
import { hasPointerMoved, startsPan, toWorldPoint } from './pointerState';

describe('canvas pointer state', () => {
    const camera = { scale: 2, tx: 100, ty: 80 };
    const rect = { left: 10, top: 20 } as DOMRect;

    it('converts browser coordinates into world coordinates', () => {
        expect(toWorldPoint({ x: 130, y: 60 }, rect, camera)).toEqual({
            x: 10,
            y: 20,
        });
    });

    it('keeps click slop and pan-button decisions deterministic', () => {
        expect(hasPointerMoved({ x: 1, y: 1 }, { x: 4, y: 5 }, 5)).toBe(true);
        expect(startsPan(0, false)).toBe(false);
        expect(startsPan(2, false)).toBe(true);
    });
});
