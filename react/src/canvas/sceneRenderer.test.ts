/**
 * Tests: polylineSlice.
 */
import { polylineSlice } from './sceneRenderer';

describe('polylineSlice', () => {
    const line = [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
    ];

    it('returns interpolated endpoints and vertices between distances', () => {
        expect(polylineSlice(line, 5, 15)).toEqual([
            { x: 5, y: 0 },
            { x: 10, y: 0 },
            { x: 10, y: 5 },
        ]);
    });

    it('clamps requested distances to the contour', () => {
        expect(polylineSlice(line, -10, 50)).toEqual(line);
    });

    it('does not produce a tab spine for a one-point contour', () => {
        expect(polylineSlice([{ x: 0, y: 0 }], 0, 1)).toEqual([]);
    });
});
