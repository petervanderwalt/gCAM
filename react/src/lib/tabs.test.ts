import { defaultTabsForContours, operationUsesTabs, tabPoint } from './tabs';

describe('operationUsesTabs', () => {
    it('allows tabs on profiles and laser-cut only', () => {
        expect(operationUsesTabs('profile-outside')).toBe(true);
        expect(operationUsesTabs('profile-inside')).toBe(true);
        expect(operationUsesTabs('laser-cut')).toBe(true);
        expect(operationUsesTabs('pocket')).toBe(false);
        expect(operationUsesTabs('vcarve')).toBe(false);
    });
});

describe('defaultTabsForContours', () => {
    const square = [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
        { x: 0, y: 0 },
    ];

    it('places four cardinal tabs on a single contour', () => {
        const tabs = defaultTabsForContours([square]);
        expect(tabs).toHaveLength(4);
        expect(tabs.every((t) => t.contourIndex === 0)).toBe(true);
        for (const tab of tabs) {
            expect(tabPoint([square], tab)).not.toBeNull();
        }
    });

    it('places two tabs per contour for multiple contours', () => {
        const tabs = defaultTabsForContours([square, square]);
        expect(tabs).toHaveLength(4);
        expect(tabs.filter((t) => t.contourIndex === 1)).toHaveLength(2);
    });

    it('skips degenerate contours', () => {
        expect(defaultTabsForContours([[], [{ x: 0, y: 0 }]])).toEqual([]);
    });
});
