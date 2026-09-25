import { nearestPointOnPolyline } from '../engine/cam-ops.js';
import {
    boundsOfPoints,
    pointAtDistance,
    polylineLength,
} from '../engine/paths.js';

export interface ContourTab {
    contourIndex: number;
    along: number;
}

const TAB_OPERATIONS = new Set([
    'profile-outside',
    'profile-inside',
    'laser-cut',
]);

/** Operations that support holding tabs (mirrors legacy operationUsesTabs). */
export function operationUsesTabs(operation: string): boolean {
    return TAB_OPERATIONS.has(operation);
}

/**
 * Automatic tab placement (camcanvas parity): a single contour gets four
 * cardinal tabs (top/right/bottom/left); multiple contours get two tabs
 * each at 25% and 75% of arc length.
 */
export function defaultTabsForContours(
    contours: { x: number; y: number }[][],
): ContourTab[] {
    const tabs: ContourTab[] = [];
    const usable = contours.filter((c) => c.length >= 2);
    if (usable.length === 1) {
        const contour = usable[0];
        const b = boundsOfPoints(contour);
        const targets = [
            { x: (b.minX + b.maxX) / 2, y: b.maxY },
            { x: b.maxX, y: (b.minY + b.maxY) / 2 },
            { x: (b.minX + b.maxX) / 2, y: b.minY },
            { x: b.minX, y: (b.minY + b.maxY) / 2 },
        ];
        for (const target of targets) {
            const nearest = nearestPointOnPolyline(contour, target);
            if (nearest) tabs.push({ contourIndex: 0, along: nearest.along });
        }
        return tabs;
    }
    usable.forEach((contour, contourIndex) => {
        const total = polylineLength(contour);
        if (!(total > 0)) return;
        for (const fraction of [0.25, 0.75]) {
            tabs.push({ contourIndex, along: total * fraction });
        }
    });
    return tabs;
}

/** Resolve a tab's world position for marker rendering. */
export function tabPoint(
    contours: { x: number; y: number }[][],
    tab: ContourTab,
): { x: number; y: number } | null {
    const contour = contours[tab.contourIndex];
    if (!contour || contour.length < 2) return null;
    return pointAtDistance(contour, tab.along);
}
