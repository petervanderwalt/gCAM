/**
 * Tests: findTabHover.
 */
import { findTabHover } from './tabInteraction';

describe('findTabHover', () => {
    const preview = [
        {
            entryId: 'profile',
            points: [
                { x: 0, y: 0 },
                { x: 20, y: 0 },
            ],
            tabEligible: true,
            tabWidth: 8,
            toolDiameter: 3,
        },
    ];

    it('returns a tab spine on the nearest eligible contour', () => {
        const result = findTabHover(preview, { x: 10, y: 1 }, 2);
        expect(result?.entryId).toBe('profile');
        expect(result?.spine.length).toBeGreaterThanOrEqual(2);
        expect(result?.along).toBeCloseTo(10);
    });

    it('ignores contours outside the tolerance', () => {
        expect(findTabHover(preview, { x: 10, y: 5 }, 2)).toBeNull();
    });
});
