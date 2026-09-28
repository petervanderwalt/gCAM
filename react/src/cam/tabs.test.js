/**
 * Tests: tab geometry reports the closest centerline point and display marker; tab operation policy is kept alongside tab geometry.
 */
import {
    buildTabMarkerGeometry,
    findNearestPolylinePoint,
    getMinimumTabWidth,
    getTabCenterlineSpan,
    operationUsesTabs,
    tabTopDepth,
} from './tabs.js';

const contour = [
    { x: 0, y: 0 },
    { x: 20, y: 0 },
    { x: 20, y: 20 },
];

test('tab geometry reports the closest centerline point and display marker', () => {
    expect(findNearestPolylinePoint(contour, { x: 12, y: 3 })).toMatchObject({
        point: { x: 12, y: 0 },
        along: 12,
    });
    const marker = buildTabMarkerGeometry(contour, 12, 6, (point) => point);
    expect(marker.worldA).toEqual({ x: 9, y: 0 });
    expect(marker.worldB).toEqual({ x: 15, y: 0 });
    expect(marker.worldSpine.length).toBeGreaterThanOrEqual(2);
});

test('tab operation policy is kept alongside tab geometry', () => {
    expect(getMinimumTabWidth(6)).toBe(9);
    expect(getTabCenterlineSpan(9, 6)).toBe(15);
    expect(operationUsesTabs({ operation: 'profile-inside' })).toBe(true);
    expect(operationUsesTabs({ operation: 'pocket' })).toBe(false);
    expect(tabTopDepth({ cutDepth: 6, tabHeight: 2 })).toBe(-4);
});
