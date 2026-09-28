import {
    clonePoint,
    dist,
    pointAtDistance,
    polylineLength,
} from '../geometry/primitives.js';

export function findNearestPolylinePoint(points, target) {
    let best = null;
    let accumulated = 0;
    for (let i = 1; i < points.length; i += 1) {
        const a = points[i - 1];
        const b = points[i];
        const abx = b.x - a.x;
        const aby = b.y - a.y;
        const lengthSq = abx * abx + aby * aby;
        if (lengthSq === 0) continue;
        const t = Math.max(
            0,
            Math.min(
                1,
                ((target.x - a.x) * abx + (target.y - a.y) * aby) / lengthSq,
            ),
        );
        const point = { x: a.x + abx * t, y: a.y + aby * t };
        const distance = dist(point, target);
        const segmentLength = Math.sqrt(lengthSq);
        if (!best || distance < best.distance) {
            best = { point, distance, along: accumulated + segmentLength * t };
        }
        accumulated += segmentLength;
    }
    return best;
}

function slicePolyline(points, fromDistance, toDistance) {
    const sliced = [pointAtDistance(points, fromDistance)];
    let walked = 0;
    for (let i = 1; i < points.length; i += 1) {
        const segmentLength = dist(points[i - 1], points[i]);
        const nextWalk = walked + segmentLength;
        if (nextWalk > fromDistance && nextWalk < toDistance)
            sliced.push(clonePoint(points[i]));
        walked = nextWalk;
    }
    sliced.push(pointAtDistance(points, toDistance));
    return sliced;
}

export function buildTabMarkerGeometry(
    contour,
    alongDistance,
    width,
    transform,
) {
    const half = width / 2;
    const total = polylineLength(contour);
    const startDistance = Math.max(0, alongDistance - half);
    const endDistance = Math.min(total, alongDistance + half);
    const aPoint = pointAtDistance(contour, startDistance);
    const bPoint = pointAtDistance(contour, endDistance);
    const centerPoint = pointAtDistance(contour, alongDistance);
    const spine = slicePolyline(contour, startDistance, endDistance);
    return {
        a: transform(aPoint),
        b: transform(bPoint),
        center: transform(centerPoint),
        spine: spine.map(transform),
        worldA: aPoint,
        worldB: bPoint,
        worldCenter: centerPoint,
        worldSpine: spine,
    };
}

export const getMinimumTabWidth = (toolDiameter) => toolDiameter * 1.5;
export const getTabCenterlineSpan = (tabWidth, toolDiameter) =>
    tabWidth + toolDiameter;
export const operationUsesTabs = (toolpath) =>
    toolpath.operation === 'profile-outside' ||
    toolpath.operation === 'profile-inside' ||
    toolpath.operation === 'laser-cut';
export const tabTopDepth = (toolpath) =>
    -Math.max(0, toolpath.cutDepth - toolpath.tabHeight);
