/**
 * Purpose: Implementation module for transforms in the geometry domain.
 */
import { applyMatrixToPoint } from './matrix.js';
import { normalizeAngleDeg } from './primitives.js';

export function translateEntity(entity, dx, dy) {
    if (entity.type === 'BITMAP') {
        const bounds = entity.bounds && {
            minX: entity.bounds.minX + dx,
            minY: entity.bounds.minY + dy,
            maxX: entity.bounds.maxX + dx,
            maxY: entity.bounds.maxY + dy,
        };
        return {
            ...entity,
            x: (entity.x || 0) + dx,
            y: (entity.y || 0) + dy,
            bounds,
        };
    }
    if (entity.type === 'CAD_TEXT')
        return {
            ...entity,
            strokes: entity.strokes.map((stroke) =>
                stroke.map((point) => ({ x: point.x + dx, y: point.y + dy })),
            ),
        };
    if (entity.type === 'LINE')
        return {
            ...entity,
            x1: entity.x1 + dx,
            y1: entity.y1 + dy,
            x2: entity.x2 + dx,
            y2: entity.y2 + dy,
        };
    if (entity.type === 'ARC' || entity.type === 'CIRCLE')
        return { ...entity, cx: entity.cx + dx, cy: entity.cy + dy };
    if (entity.type === 'SPLINE')
        return {
            ...entity,
            controlPoints: entity.controlPoints.map((point) => ({
                ...point,
                x: point.x + dx,
                y: point.y + dy,
            })),
        };
    if (entity.type === 'LWPOLYLINE' || entity.type === 'POLYLINE')
        return {
            ...entity,
            vertices: entity.vertices.map((vertex) => ({
                ...vertex,
                x: vertex.x + dx,
                y: vertex.y + dy,
            })),
        };
    return entity;
}

export function transformEntity(entity, matrix) {
    if (entity.type === 'BITMAP') {
        const b = entity.bounds;
        const p1 = applyMatrixToPoint(
            { x: b ? b.minX : entity.x || 0, y: b ? b.minY : entity.y || 0 },
            matrix,
        );
        const p2 = applyMatrixToPoint(
            {
                x: b ? b.maxX : (entity.x || 0) + (entity.w || 10),
                y: b ? b.maxY : (entity.y || 0) + (entity.h || 10),
            },
            matrix,
        );
        const minX = Math.min(p1.x, p2.x),
            maxX = Math.max(p1.x, p2.x),
            minY = Math.min(p1.y, p2.y),
            maxY = Math.max(p1.y, p2.y);
        return {
            ...entity,
            x: minX,
            y: minY,
            w: maxX - minX,
            h: maxY - minY,
            bounds: { minX, minY, maxX, maxY },
        };
    }
    if (entity.type === 'CAD_TEXT')
        return {
            ...entity,
            strokes: entity.strokes.map((stroke) =>
                stroke.map((point) => applyMatrixToPoint(point, matrix)),
            ),
        };
    if (entity.type === 'LINE') {
        const start = applyMatrixToPoint(
                { x: entity.x1, y: entity.y1 },
                matrix,
            ),
            end = applyMatrixToPoint({ x: entity.x2, y: entity.y2 }, matrix);
        return { ...entity, x1: start.x, y1: start.y, x2: end.x, y2: end.y };
    }
    if (entity.type === 'ARC') {
        const center = applyMatrixToPoint(
            { x: entity.cx, y: entity.cy },
            matrix,
        );
        const startAngle =
            (normalizeAngleDeg(entity.startAngleDeg) * Math.PI) / 180;
        let endAngle = (normalizeAngleDeg(entity.endAngleDeg) * Math.PI) / 180;
        if (endAngle <= startAngle) endAngle += Math.PI * 2;
        const start = applyMatrixToPoint(
            {
                x: entity.cx + Math.cos(startAngle) * entity.radius,
                y: entity.cy + Math.sin(startAngle) * entity.radius,
            },
            matrix,
        );
        const end = applyMatrixToPoint(
            {
                x: entity.cx + Math.cos(endAngle) * entity.radius,
                y: entity.cy + Math.sin(endAngle) * entity.radius,
            },
            matrix,
        );
        const startVector = { x: start.x - center.x, y: start.y - center.y },
            endVector = { x: end.x - center.x, y: end.y - center.y };
        return {
            ...entity,
            cx: center.x,
            cy: center.y,
            radius:
                (Math.hypot(startVector.x, startVector.y) +
                    Math.hypot(endVector.x, endVector.y)) /
                2,
            startAngleDeg: normalizeAngleDeg(
                (Math.atan2(startVector.y, startVector.x) * 180) / Math.PI,
            ),
            endAngleDeg: normalizeAngleDeg(
                (Math.atan2(endVector.y, endVector.x) * 180) / Math.PI,
            ),
        };
    }
    if (entity.type === 'CIRCLE') {
        const center = applyMatrixToPoint(
                { x: entity.cx, y: entity.cy },
                matrix,
            ),
            edge = applyMatrixToPoint(
                { x: entity.cx + entity.radius, y: entity.cy },
                matrix,
            );
        return {
            ...entity,
            cx: center.x,
            cy: center.y,
            radius: Math.hypot(edge.x - center.x, edge.y - center.y),
        };
    }
    if (entity.type === 'SPLINE')
        return {
            ...entity,
            controlPoints: entity.controlPoints.map((point) => ({
                ...point,
                ...applyMatrixToPoint(point, matrix),
            })),
        };
    if (entity.type === 'LWPOLYLINE' || entity.type === 'POLYLINE')
        return {
            ...entity,
            vertices: entity.vertices.map((vertex) => ({
                ...vertex,
                ...applyMatrixToPoint(vertex, matrix),
            })),
        };
    return entity;
}

export function mirrorEntityY(entity, maxY) {
    if (entity.type === 'BITMAP') {
        const b = entity.bounds;
        if (!b) return entity;
        const minY = maxY - b.maxY,
            maxY2 = maxY - b.minY;
        return {
            ...entity,
            y: minY,
            bounds: { minX: b.minX, minY, maxX: b.maxX, maxY: maxY2 },
        };
    }
    if (entity.type === 'CAD_TEXT')
        return {
            ...entity,
            strokes: entity.strokes.map((stroke) =>
                stroke.map((point) => ({ x: point.x, y: maxY - point.y })),
            ),
        };
    if (entity.type === 'LINE')
        return { ...entity, y1: maxY - entity.y1, y2: maxY - entity.y2 };
    if (entity.type === 'ARC')
        return {
            ...entity,
            cy: maxY - entity.cy,
            startAngleDeg: -entity.endAngleDeg,
            endAngleDeg: -entity.startAngleDeg,
        };
    if (entity.type === 'CIRCLE') return { ...entity, cy: maxY - entity.cy };
    if (entity.type === 'SPLINE')
        return {
            ...entity,
            controlPoints: entity.controlPoints.map((point) => ({
                ...point,
                y: maxY - point.y,
            })),
        };
    if (entity.type === 'LWPOLYLINE' || entity.type === 'POLYLINE')
        return {
            ...entity,
            vertices: entity.vertices.map((vertex) => ({
                ...vertex,
                y: maxY - vertex.y,
            })),
        };
    return entity;
}
