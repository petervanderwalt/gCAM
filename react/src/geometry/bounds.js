/**
 * Purpose: Implementation module for bounds in the geometry domain.
 */
import { clonePoint, closePoints, dist } from './primitives.js';

export function createLoopPath2D(
    segments,
    transform,
    scale = 1,
    closed = true,
) {
    const path = new Path2D();
    let first = true;
    for (const segment of segments) {
        if (first) {
            const start = transform(
                segment.kind === 'circle'
                    ? { x: segment.cx + segment.radius, y: segment.cy }
                    : segment.start,
            );
            path.moveTo(start.x, start.y);
            first = false;
        }
        if (segment.kind === 'circle') {
            const center = transform({ x: segment.cx, y: segment.cy });
            path.arc(
                center.x,
                center.y,
                segment.radius * scale,
                0,
                Math.PI * 2,
            );
        } else segment.draw(path, transform, scale, false);
    }
    if (closed) path.closePath();
    return path;
}

export function boundsOfPoints(points) {
    const bounds = {
        minX: Number.POSITIVE_INFINITY,
        minY: Number.POSITIVE_INFINITY,
        maxX: Number.NEGATIVE_INFINITY,
        maxY: Number.NEGATIVE_INFINITY,
    };
    for (const point of points) {
        bounds.minX = Math.min(bounds.minX, point.x);
        bounds.minY = Math.min(bounds.minY, point.y);
        bounds.maxX = Math.max(bounds.maxX, point.x);
        bounds.maxY = Math.max(bounds.maxY, point.y);
    }
    return bounds;
}
export function mergeBounds(list) {
    return list.length
        ? list.reduce((acc, bounds) => ({
              minX: Math.min(acc.minX, bounds.minX),
              minY: Math.min(acc.minY, bounds.minY),
              maxX: Math.max(acc.maxX, bounds.maxX),
              maxY: Math.max(acc.maxY, bounds.maxY),
          }))
        : null;
}
export function boundsOfEntities(entities) {
    const candidateBounds = [];
    for (const entity of entities) {
        if (entity.type === 'BITMAP') {
            const b = entity.bounds;
            if (b && Number.isFinite(b.minX))
                candidateBounds.push({
                    minX: b.minX,
                    minY: b.minY,
                    maxX: b.maxX,
                    maxY: b.maxY,
                });
            else
                candidateBounds.push(
                    boundsOfPoints([
                        { x: entity.x || 0, y: entity.y || 0 },
                        {
                            x: (entity.x || 0) + (entity.w || 10),
                            y: (entity.y || 0) + (entity.h || 10),
                        },
                    ]),
                );
        } else if (entity.type === 'CAD_TEXT')
            candidateBounds.push(boundsOfPoints(entity.strokes.flat()));
        else if (entity.type === 'LINE')
            candidateBounds.push(
                boundsOfPoints([
                    { x: entity.x1, y: entity.y1 },
                    { x: entity.x2, y: entity.y2 },
                ]),
            );
        else if (entity.type === 'ARC' || entity.type === 'CIRCLE')
            candidateBounds.push({
                minX: entity.cx - entity.radius,
                minY: entity.cy - entity.radius,
                maxX: entity.cx + entity.radius,
                maxY: entity.cy + entity.radius,
            });
        else if (
            (entity.type === 'LWPOLYLINE' || entity.type === 'POLYLINE') &&
            entity.vertices.length
        )
            candidateBounds.push(
                boundsOfPoints(
                    entity.vertices.map((vertex) => ({
                        x: vertex.x,
                        y: vertex.y,
                    })),
                ),
            );
        else if (entity.type === 'SPLINE' && entity.controlPoints.length)
            candidateBounds.push(boundsOfPoints(entity.controlPoints));
    }
    return mergeBounds(candidateBounds);
}
export function polygonArea(points) {
    let area = 0;
    for (let i = 0; i < points.length - 1; i += 1)
        area += points[i].x * points[i + 1].y - points[i + 1].x * points[i].y;
    return area / 2;
}

// Deliberately re-exported here for callers that treat bounds as loop geometry.
export { clonePoint, closePoints, dist };
