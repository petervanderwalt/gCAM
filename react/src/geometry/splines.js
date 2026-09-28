/**
 * Purpose: Implementation module for splines in the geometry domain.
 */
import { clonePoint, dist } from './primitives.js';

export function evaluateBezier(cps, t) {
    const mt = 1 - t;
    return {
        x:
            mt ** 3 * cps[0].x +
            3 * mt ** 2 * t * cps[1].x +
            3 * mt * t ** 2 * cps[2].x +
            t ** 3 * cps[3].x,
        y:
            mt ** 3 * cps[0].y +
            3 * mt ** 2 * t * cps[1].y +
            3 * mt * t ** 2 * cps[2].y +
            t ** 3 * cps[3].y,
    };
}

export function estimateBezierLength(cps) {
    let length = 0,
        previous = cps[0];
    for (let i = 1; i <= 16; i += 1) {
        const point = evaluateBezier(cps, i / 16);
        length += dist(previous, point);
        previous = point;
    }
    return length;
}

export function estimateControlPolygonLength(cps) {
    let length = 0;
    for (let i = 1; i < cps.length; i += 1) length += dist(cps[i - 1], cps[i]);
    return length;
}

export function evaluateBSplinePoint(degree, knots, controlPoints, t) {
    const n = controlPoints.length - 1,
        work = [];
    let span = degree;
    while (span < knots.length - degree - 1 && t >= knots[span + 1]) span += 1;
    for (let j = 0; j <= degree; j += 1) {
        const point =
            controlPoints[Math.min(n, Math.max(0, span - degree + j))];
        work[j] = { x: point.x, y: point.y, w: point.w || 1 };
    }
    for (let level = 1; level <= degree; level += 1)
        for (let j = degree; j >= level; j -= 1) {
            const index = span - degree + j,
                denominator = knots[index + degree + 1 - level] - knots[index],
                alpha =
                    denominator === 0 ? 0 : (t - knots[index]) / denominator;
            work[j] = {
                x: (1 - alpha) * work[j - 1].x + alpha * work[j].x,
                y: (1 - alpha) * work[j - 1].y + alpha * work[j].y,
                w: (1 - alpha) * work[j - 1].w + alpha * work[j].w,
            };
        }
    return { x: work[degree].x, y: work[degree].y };
}

function cloneSplineControlPoint(point) {
    return { x: point.x, y: point.y, z: point.z || 0, w: point.w || 1 };
}
function splineDomain(entity) {
    const degree = Number(entity?.degree),
        knots = entity?.knots || [];
    return Number.isInteger(degree) &&
        degree >= 1 &&
        knots.length >= degree * 2 + 2
        ? { min: knots[degree], max: knots[knots.length - degree - 1] }
        : null;
}
function homogeneousSplinePoint(point) {
    const w = point.w || 1;
    return { x: point.x * w, y: point.y * w, z: (point.z || 0) * w, w };
}
function dehomogenizeSplinePoint(point) {
    const w = Math.abs(point.w) > 1e-12 ? point.w : 1;
    return { x: point.x / w, y: point.y / w, z: point.z / w, w };
}
function evaluateRationalBSplinePoint(degree, knots, controlPoints, t) {
    const n = controlPoints.length - 1,
        min = knots[degree],
        max = knots[knots.length - degree - 1],
        clamped = Math.max(min, Math.min(max, t)),
        work = [];
    let span = degree;
    while (span < n && clamped >= knots[span + 1] - 1e-12) span += 1;
    for (let j = 0; j <= degree; j += 1)
        work.push(
            homogeneousSplinePoint(
                controlPoints[Math.min(n, Math.max(0, span - degree + j))],
            ),
        );
    for (let level = 1; level <= degree; level += 1)
        for (let j = degree; j >= level; j -= 1) {
            const index = span - degree + j,
                denominator = knots[index + degree + 1 - level] - knots[index],
                alpha =
                    Math.abs(denominator) <= 1e-12
                        ? 0
                        : (clamped - knots[index]) / denominator;
            work[j] = {
                x: (1 - alpha) * work[j - 1].x + alpha * work[j].x,
                y: (1 - alpha) * work[j - 1].y + alpha * work[j].y,
                z: (1 - alpha) * work[j - 1].z + alpha * work[j].z,
                w: (1 - alpha) * work[j - 1].w + alpha * work[j].w,
            };
        }
    return dehomogenizeSplinePoint(work[degree]);
}

export function evaluateSplinePoint(entity, t) {
    const domain = splineDomain(entity);
    return !domain || !entity?.controlPoints?.length
        ? null
        : evaluateRationalBSplinePoint(
              entity.degree,
              entity.knots,
              entity.controlPoints,
              t,
          );
}
export function splineEndpointTangent(entity, end) {
    const domain = splineDomain(entity);
    if (!domain) return null;
    const delta = Math.max((domain.max - domain.min) * 1e-6, 1e-8),
        start = end === 'start',
        first = evaluateSplinePoint(
            entity,
            start ? domain.min : domain.max - delta,
        ),
        second = evaluateSplinePoint(
            entity,
            start ? domain.min + delta : domain.max,
        );
    if (!first || !second) return null;
    const dx = start ? second.x - first.x : first.x - second.x,
        dy = start ? second.y - first.y : first.y - second.y,
        length = Math.hypot(dx, dy);
    return length > 1e-10 ? { x: dx / length, y: dy / length } : null;
}
export function splineTangentAt(entity, t, direction = 1) {
    const domain = splineDomain(entity);
    if (!domain) return null;
    const delta = Math.max((domain.max - domain.min) * 1e-6, 1e-8),
        first = evaluateSplinePoint(entity, Math.max(domain.min, t - delta)),
        second = evaluateSplinePoint(entity, Math.min(domain.max, t + delta));
    if (!first || !second) return null;
    const multiplier = direction < 0 ? -1 : 1,
        dx = (second.x - first.x) * multiplier,
        dy = (second.y - first.y) * multiplier,
        length = Math.hypot(dx, dy);
    return length > 1e-10 ? { x: dx / length, y: dy / length } : null;
}
function splineArcLength(entity, startT, endT, steps = 48) {
    let length = 0,
        previous = evaluateSplinePoint(entity, startT);
    for (let i = 1; i <= steps; i += 1) {
        const point = evaluateSplinePoint(
            entity,
            startT + (endT - startT) * (i / steps),
        );
        length += Math.hypot(point.x - previous.x, point.y - previous.y);
        previous = point;
    }
    return length;
}
export function splineParameterAtDistance(entity, end, distance) {
    const domain = splineDomain(entity);
    if (!domain) return null;
    const target = Math.max(
        0,
        Math.min(splineArcLength(entity, domain.min, domain.max, 96), distance),
    );
    let low = domain.min,
        high = domain.max;
    for (let i = 0; i < 24; i += 1) {
        const middle = (low + high) / 2,
            measured =
                end === 'start'
                    ? splineArcLength(entity, domain.min, middle)
                    : splineArcLength(entity, middle, domain.max);
        if (measured < target) {
            if (end === 'start') low = middle;
            else high = middle;
        } else if (end === 'start') high = middle;
        else low = middle;
    }
    return (low + high) / 2;
}
function findSplineSpan(degree, knots, pointCount, t) {
    const n = pointCount - 1;
    if (t >= knots[n + 1] - 1e-12) return n;
    let low = degree,
        high = n + 1,
        middle = Math.floor((low + high) / 2);
    while (t < knots[middle] || t >= knots[middle + 1]) {
        if (t < knots[middle]) high = middle;
        else low = middle;
        middle = Math.floor((low + high) / 2);
    }
    return middle;
}
function knotMultiplicity(knots, t) {
    return knots.reduce(
        (count, knot) => count + (Math.abs(knot - t) <= 1e-10 ? 1 : 0),
        0,
    );
}
function insertSplineKnotOnce(degree, knots, controlPoints, t) {
    const n = controlPoints.length - 1,
        span = findSplineSpan(degree, knots, controlPoints.length, t),
        multiplicity = knotMultiplicity(knots, t),
        insertedKnots = [
            ...knots.slice(0, span + 1),
            t,
            ...knots.slice(span + 1),
        ],
        insertedPoints = new Array(controlPoints.length + 1);
    for (let i = 0; i <= span - degree; i += 1)
        insertedPoints[i] = cloneSplineControlPoint(controlPoints[i]);
    for (let i = span - multiplicity; i <= n; i += 1)
        insertedPoints[i + 1] = cloneSplineControlPoint(controlPoints[i]);
    for (let i = span - degree + 1; i <= span - multiplicity; i += 1) {
        const denominator = knots[i + degree] - knots[i],
            alpha =
                Math.abs(denominator) <= 1e-12
                    ? 0
                    : (t - knots[i]) / denominator,
            left = homogeneousSplinePoint(controlPoints[i - 1]),
            right = homogeneousSplinePoint(controlPoints[i]);
        insertedPoints[i] = dehomogenizeSplinePoint({
            x: (1 - alpha) * left.x + alpha * right.x,
            y: (1 - alpha) * left.y + alpha * right.y,
            z: (1 - alpha) * left.z + alpha * right.z,
            w: (1 - alpha) * left.w + alpha * right.w,
        });
    }
    return { knots: insertedKnots, controlPoints: insertedPoints };
}
export function trimSplineEndpoint(entity, end, t) {
    const domain = splineDomain(entity);
    if (
        !domain ||
        entity.closed ||
        t <= domain.min + 1e-9 ||
        t >= domain.max - 1e-9
    )
        return null;
    const degree = entity.degree;
    let knots = entity.knots.slice(),
        controlPoints = entity.controlPoints.map(cloneSplineControlPoint);
    while (knotMultiplicity(knots, t) < degree)
        ({ knots, controlPoints } = insertSplineKnotOnce(
            degree,
            knots,
            controlPoints,
            t,
        ));
    const split = knots.findIndex((knot) => Math.abs(knot - t) <= 1e-10) - 1;
    if (split < degree || split >= controlPoints.length - degree) return null;
    const left = {
            ...entity,
            knots: [...knots.slice(0, split + degree + 1), t],
            controlPoints: controlPoints
                .slice(0, split + 1)
                .map(cloneSplineControlPoint),
        },
        right = {
            ...entity,
            knots: [t, ...knots.slice(split + 1)],
            controlPoints: controlPoints
                .slice(split)
                .map(cloneSplineControlPoint),
        };
    return end === 'start' ? right : left;
}
