/**
 * Purpose: Implementation module for loops in the geometry domain.
 */
import {
    LOOP_TOLERANCE,
    RENDER_SAMPLE_STEP,
    TOOLPATH_SAMPLE_STEP,
} from '../engine/constants.js';
import { boundsOfPoints, polygonArea } from './bounds.js';
import {
    buildSegmentsFromPolylineEntity,
    entityToSegment,
    polylineSegmentFromPoints,
} from './segments.js';
import { clonePoint, closePoints, dist, pointKey } from './primitives.js';

export function buildLoops(entities) {
    const openSegments = [],
        loops = [],
        circles = [];
    for (let entityIndex = 0; entityIndex < entities.length; entityIndex += 1) {
        const entity = entities[entityIndex];
        if (entity.type === 'BITMAP') {
            loops.push(buildBitmapLoop(entity, entityIndex));
            continue;
        }
        if (entity.type === 'CAD_TEXT') {
            for (const stroke of entity.strokes || [])
                if (stroke.length >= 2) {
                    const segment = polylineSegmentFromPoints(
                        stroke,
                        entity,
                        entityIndex,
                    );
                    loops.push(
                        entity.__cadTextMode === 'outline'
                            ? buildLoopFromChain([segment])
                            : buildOpenChain([segment]),
                    );
                }
            continue;
        }
        if (entity.type === 'LWPOLYLINE' || entity.type === 'POLYLINE') {
            const segments = buildSegmentsFromPolylineEntity(
                entity,
                entityIndex,
            );
            if (!segments.length) continue;
            if (entity.closed) {
                const points = flattenChain(segments);
                const closed = closePoints(points);
                loops.push({
                    id: crypto.randomUUID(),
                    closed: true,
                    sourceType: entity.type.toLowerCase(),
                    sourceEntityIndexes: [entityIndex],
                    segments,
                    points: closed,
                    bounds: boundsOfPoints(closed),
                    area: polygonArea(closed),
                    path2d: null,
                    exportGeometry: { type: 'segments', segments },
                });
            } else openSegments.push(...segments);
            continue;
        }
        entity.__sourceEntityIndex = entityIndex;
        const segment = entityToSegment(entity, entityIndex);
        if (!segment) continue;
        if (segment.kind === 'circle') circles.push(buildCircleLoop(segment));
        else openSegments.push(segment);
    }
    const deduped = dedupeOpenSegments(openSegments);
    loops.push(...circles);
    const adjacency = new Map();
    deduped.forEach((segment, index) => {
        addAdjacency(adjacency, pointKey(segment.start), {
            index,
            atStart: true,
        });
        addAdjacency(adjacency, pointKey(segment.end), {
            index,
            atStart: false,
        });
    });
    const used = new Set();
    for (let i = 0; i < deduped.length; i += 1) {
        if (used.has(i)) continue;
        const seed = deduped[i];
        used.add(i);
        const chain = [seed];
        let currentStart = clonePoint(seed.start),
            currentEnd = clonePoint(seed.end),
            changed = true;
        while (changed) {
            changed = false;
            const endMatch = findConnectedSegment(
                deduped,
                adjacency,
                used,
                currentEnd,
                'end',
                chain[chain.length - 1],
            );
            if (endMatch) {
                chain.push(endMatch.segment);
                currentEnd = clonePoint(endMatch.segment.end);
                used.add(endMatch.index);
                changed = true;
                continue;
            }
            const startMatch = findConnectedSegment(
                deduped,
                adjacency,
                used,
                currentStart,
                'start',
                chain[0],
            );
            if (startMatch) {
                chain.unshift(startMatch.segment);
                currentStart = clonePoint(startMatch.segment.start);
                used.add(startMatch.index);
                changed = true;
            }
        }
        if (dist(currentStart, currentEnd) <= LOOP_TOLERANCE)
            loops.push(buildLoopFromChain(chain));
        else if (chain.length) loops.push(buildOpenChain(chain));
    }
    const filtered = loops.filter(
            (loop) => loop.closed === false || Math.abs(loop.area) > 1e-3,
        ),
        represented = new Set(
            filtered
                .flatMap((loop) => loop.sourceEntityIndexes || [])
                .filter((value) => value >= 0),
        );
    for (const segment of deduped)
        if (
            segment.sourceEntityIndex >= 0 &&
            !represented.has(segment.sourceEntityIndex)
        ) {
            filtered.push(buildOpenChain([segment]));
            represented.add(segment.sourceEntityIndex);
        }
    return filtered;
}
function buildBitmapLoop(entity, entityIndex) {
    const b = entity.bounds || {
            minX: entity.x || 0,
            minY: entity.y || 0,
            maxX: (entity.x || 0) + (entity.w || 10),
            maxY: (entity.y || 0) + (entity.h || 10),
        },
        points = closePoints([
            { x: b.minX, y: b.minY },
            { x: b.maxX, y: b.minY },
            { x: b.maxX, y: b.maxY },
            { x: b.minX, y: b.maxY },
        ]);
    return {
        id: entity.__loopId || crypto.randomUUID(),
        closed: true,
        sourceType: 'bitmap',
        sourceEntityIndexes: [entityIndex],
        segments: [],
        points,
        bounds: { minX: b.minX, minY: b.minY, maxX: b.maxX, maxY: b.maxY },
        area: (b.maxX - b.minX) * (b.maxY - b.minY),
        path2d: null,
        exportGeometry: { type: 'bitmap', entityIndex },
        isBitmap: true,
    };
}
function dedupeOpenSegments(segments) {
    const unique = [],
        seen = new Set();
    for (const segment of segments) {
        const signature = segmentGeometrySignature(segment);
        if (!seen.has(signature)) {
            seen.add(signature);
            unique.push(segment);
        }
    }
    return unique;
}
function segmentGeometrySignature(segment) {
    const points = segment.flatten(Math.max(0.25, RENDER_SAMPLE_STEP / 2));
    if (!points?.length) return `${segment.kind}:empty`;
    const start = points[0],
        end = points[points.length - 1],
        midpoint = points[Math.floor((points.length - 1) / 2)] || start,
        forward = [start, midpoint, end].map(signaturePoint).join('|'),
        reverse = [end, midpoint, start].map(signaturePoint).join('|');
    return `${segment.kind}:${forward < reverse ? forward : reverse}`;
}
function signaturePoint(point) {
    return `${Math.round(point.x / LOOP_TOLERANCE)}:${Math.round(point.y / LOOP_TOLERANCE)}`;
}
function addAdjacency(map, key, item) {
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
}
function findConnectedSegment(
    openSegments,
    adjacency,
    used,
    anchorPoint,
    side,
    currentSegment = null,
) {
    const candidates = adjacency.get(pointKey(anchorPoint)) || [];
    let bestMatch = null,
        bestScore = Number.NEGATIVE_INFINITY;
    for (const candidate of candidates) {
        if (used.has(candidate.index)) continue;
        const next = openSegments[candidate.index],
            oriented =
                side === 'end'
                    ? dist(next.start, anchorPoint) <= LOOP_TOLERANCE
                        ? next
                        : next.reverse()
                    : dist(next.end, anchorPoint) <= LOOP_TOLERANCE
                      ? next
                      : next.reverse();
        const connected =
            side === 'end'
                ? dist(oriented.start, anchorPoint)
                : dist(oriented.end, anchorPoint);
        if (connected <= LOOP_TOLERANCE) {
            const score = scoreSegmentContinuation(
                currentSegment,
                oriented,
                side,
            );
            if (score > bestScore) {
                bestScore = score;
                bestMatch = { index: candidate.index, segment: oriented };
            }
        }
    }
    return bestMatch;
}
function scoreSegmentContinuation(current, candidate, side) {
    if (!current) return 0;
    const first =
            side === 'end'
                ? getSegmentTangent(current, true)
                : scaleVector(getSegmentTangent(current, false), -1),
        second =
            side === 'end'
                ? getSegmentTangent(candidate, false)
                : scaleVector(getSegmentTangent(candidate, true), -1),
        a = normalizeVector(first),
        b = normalizeVector(second);
    return !a || !b ? 0 : a.x * b.x + a.y * b.y;
}
function getSegmentTangent(segment, atEnd) {
    const points = segment.flatten(Math.max(0.25, RENDER_SAMPLE_STEP / 2));
    if (!points?.length || points.length < 2) return { x: 0, y: 0 };
    const a = atEnd ? points[points.length - 2] : points[0],
        b = atEnd ? points[points.length - 1] : points[1];
    return { x: b.x - a.x, y: b.y - a.y };
}
function normalizeVector(vector) {
    const length = Math.hypot(vector.x, vector.y);
    return length <= 1e-9
        ? null
        : { x: vector.x / length, y: vector.y / length };
}
function scaleVector(vector, scalar) {
    return { x: vector.x * scalar, y: vector.y * scalar };
}
function buildCircleLoop(segment) {
    const points = segment.flatten(TOOLPATH_SAMPLE_STEP);
    return {
        id: crypto.randomUUID(),
        closed: true,
        sourceType: 'circle',
        sourceEntityIndexes: [segment.sourceEntityIndex],
        segments: [segment],
        points,
        bounds: {
            minX: segment.cx - segment.radius,
            minY: segment.cy - segment.radius,
            maxX: segment.cx + segment.radius,
            maxY: segment.cy + segment.radius,
        },
        area: Math.PI * segment.radius * segment.radius,
        path2d: null,
        exportGeometry: {
            type: 'circle',
            cx: segment.cx,
            cy: segment.cy,
            radius: segment.radius,
        },
    };
}
function flattenChain(chain) {
    const points = [];
    for (const segment of chain) {
        const flattened = segment.flatten(TOOLPATH_SAMPLE_STEP);
        if (points.length) flattened.shift();
        points.push(...flattened);
    }
    return points;
}
function sourceIndexes(chain) {
    return Array.from(
        new Set(
            chain
                .map((segment) => segment.sourceEntityIndex)
                .filter((value) => value >= 0),
        ),
    ).sort((a, b) => a - b);
}
function buildLoopFromChain(chain) {
    const points = closePoints(flattenChain(chain));
    return {
        id: crypto.randomUUID(),
        closed: true,
        sourceType: 'chain',
        sourceEntityIndexes: sourceIndexes(chain),
        segments: chain,
        points,
        bounds: boundsOfPoints(points),
        area: polygonArea(points),
        path2d: null,
        exportGeometry: { type: 'segments', segments: chain },
    };
}
function buildOpenChain(chain) {
    const points = flattenChain(chain);
    return {
        id: crypto.randomUUID(),
        closed: false,
        sourceType: 'open-chain',
        sourceEntityIndexes: sourceIndexes(chain),
        segments: chain,
        points,
        bounds: boundsOfPoints(points),
        area: 0,
        path2d: null,
        exportGeometry: { type: 'segments', segments: chain },
    };
}
