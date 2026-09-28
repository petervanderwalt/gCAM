/**
 * Purpose: Implementation module for primitives in the geometry domain.
 */
import { LOOP_TOLERANCE } from '../engine/constants.js';

/** Small, dependency-free point and numeric helpers shared by geometry domains. */
export function normalizeAngleDeg(angle) {
    let value = angle % 360;
    if (value < 0) value += 360;
    return value;
}

export function clonePoint(point) {
    return { x: point.x, y: point.y };
}

export function dist(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
}

export function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

export function pointKey(point) {
    return `${Math.round(point.x / LOOP_TOLERANCE)}:${Math.round(point.y / LOOP_TOLERANCE)}`;
}

export function closePoints(points) {
    if (!points.length) return points;
    return dist(points[0], points[points.length - 1]) <= LOOP_TOLERANCE
        ? points
        : [...points, clonePoint(points[0])];
}

export function almostEqual(a, b, epsilon = 1e-9) {
    return Math.abs(a - b) <= epsilon;
}

export function pointAtDistance(points, distanceValue) {
    let remaining = distanceValue;
    for (let i = 1; i < points.length; i += 1) {
        const a = points[i - 1];
        const b = points[i];
        const segmentLength = dist(a, b);
        if (remaining <= segmentLength || i === points.length - 1) {
            const t = segmentLength === 0 ? 0 : remaining / segmentLength;
            return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
        }
        remaining -= segmentLength;
    }
    return clonePoint(points[points.length - 1]);
}

export function polylineLength(points) {
    let length = 0;
    for (let i = 1; i < points.length; i += 1)
        length += dist(points[i - 1], points[i]);
    return length;
}
