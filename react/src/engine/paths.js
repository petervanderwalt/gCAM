import {
    LOOP_TOLERANCE,
    RENDER_SAMPLE_STEP,
    TOOLPATH_SAMPLE_STEP,
} from './constants.js';

export function createMatrix(a = 1, b = 0, c = 0, d = 1, e = 0, f = 0) {
    return { a, b, c, d, e, f };
}

export function multiplyMatrices(left, right) {
    return {
        a: left.a * right.a + left.c * right.b,
        b: left.b * right.a + left.d * right.b,
        c: left.a * right.c + left.c * right.d,
        d: left.b * right.c + left.d * right.d,
        e: left.a * right.e + left.c * right.f + left.e,
        f: left.b * right.e + left.d * right.f + left.f,
    };
}

export function applyMatrixToPoint(point, matrix) {
    return {
        x: point.x * matrix.a + point.y * matrix.c + matrix.e,
        y: point.x * matrix.b + point.y * matrix.d + matrix.f,
    };
}

export function parseSvgTransform(transformText) {
    if (!transformText?.trim()) {
        return createMatrix();
    }
    const commandPattern = /([a-zA-Z]+)\(([^)]*)\)/g;
    let matrix = createMatrix();
    let match = commandPattern.exec(transformText);
    while (match) {
        const command = match[1].toLowerCase();
        const values = match[2]
            .split(/[\s,]+/)
            .map((value) => Number.parseFloat(value))
            .filter((value) => Number.isFinite(value));
        let next = createMatrix();
        if (command === 'matrix' && values.length >= 6) {
            next = createMatrix(
                values[0],
                values[1],
                values[2],
                values[3],
                values[4],
                values[5],
            );
        } else if (command === 'translate') {
            next = createMatrix(1, 0, 0, 1, values[0] || 0, values[1] || 0);
        } else if (command === 'scale') {
            next = createMatrix(
                values[0] ?? 1,
                0,
                0,
                values[1] ?? values[0] ?? 1,
                0,
                0,
            );
        } else if (command === 'rotate') {
            const angle = ((values[0] || 0) * Math.PI) / 180;
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);
            const rotation = createMatrix(cos, sin, -sin, cos, 0, 0);
            if (values.length >= 3) {
                const [_, cx, cy] = values;
                next = multiplyMatrices(
                    multiplyMatrices(
                        createMatrix(1, 0, 0, 1, cx, cy),
                        rotation,
                    ),
                    createMatrix(1, 0, 0, 1, -cx, -cy),
                );
            } else {
                next = rotation;
            }
        } else if (command === 'skewx') {
            next = createMatrix(
                1,
                0,
                Math.tan(((values[0] || 0) * Math.PI) / 180),
                1,
                0,
                0,
            );
        } else if (command === 'skewy') {
            next = createMatrix(
                1,
                Math.tan(((values[0] || 0) * Math.PI) / 180),
                0,
                1,
                0,
                0,
            );
        }
        matrix = multiplyMatrices(matrix, next);
        match = commandPattern.exec(transformText);
    }
    return matrix;
}

export function parseSvgCoordinateList(text) {
    return (text || '')
        .trim()
        .split(/[\s,]+/)
        .map((value) => Number.parseFloat(value))
        .filter((value) => Number.isFinite(value));
}

export function parseSvgPoints(text, matrix) {
    const values = parseSvgCoordinateList(text);
    const points = [];
    for (let i = 0; i < values.length - 1; i += 2) {
        points.push(
            applyMatrixToPoint({ x: values[i], y: values[i + 1] }, matrix),
        );
    }
    return points;
}

export function sampleEllipsePoints(cx, cy, rx, ry, matrix, steps = 72) {
    const points = [];
    for (let i = 0; i < steps; i += 1) {
        const angle = (i / steps) * Math.PI * 2;
        points.push(
            applyMatrixToPoint(
                {
                    x: cx + Math.cos(angle) * rx,
                    y: cy + Math.sin(angle) * ry,
                },
                matrix,
            ),
        );
    }
    return closePoints(points);
}

export function translateEntity(entity, dx, dy) {
    if (entity.type === 'BITMAP') {
        const b = entity.bounds;
        const nb = b
            ? {
                  minX: b.minX + dx,
                  minY: b.minY + dy,
                  maxX: b.maxX + dx,
                  maxY: b.maxY + dy,
              }
            : null;
        return {
            ...entity,
            x: (entity.x || 0) + dx,
            y: (entity.y || 0) + dy,
            bounds: nb,
        };
    }
    if (entity.type === 'CAD_TEXT') {
        return {
            ...entity,
            strokes: entity.strokes.map((stroke) =>
                stroke.map((point) => ({ x: point.x + dx, y: point.y + dy })),
            ),
        };
    }
    if (entity.type === 'LINE') {
        return {
            ...entity,
            x1: entity.x1 + dx,
            y1: entity.y1 + dy,
            x2: entity.x2 + dx,
            y2: entity.y2 + dy,
        };
    }

    if (entity.type === 'ARC' || entity.type === 'CIRCLE') {
        return {
            ...entity,
            cx: entity.cx + dx,
            cy: entity.cy + dy,
        };
    }

    if (entity.type === 'SPLINE') {
        return {
            ...entity,
            controlPoints: entity.controlPoints.map((point) => ({
                ...point,
                x: point.x + dx,
                y: point.y + dy,
            })),
        };
    }

    if (entity.type === 'LWPOLYLINE' || entity.type === 'POLYLINE') {
        return {
            ...entity,
            vertices: entity.vertices.map((vertex) => ({
                ...vertex,
                x: vertex.x + dx,
                y: vertex.y + dy,
            })),
        };
    }

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
    if (entity.type === 'CAD_TEXT') {
        return {
            ...entity,
            strokes: entity.strokes.map((stroke) =>
                stroke.map((point) => applyMatrixToPoint(point, matrix)),
            ),
        };
    }
    if (entity.type === 'LINE') {
        const start = applyMatrixToPoint(
            { x: entity.x1, y: entity.y1 },
            matrix,
        );
        const end = applyMatrixToPoint({ x: entity.x2, y: entity.y2 }, matrix);
        return {
            ...entity,
            x1: start.x,
            y1: start.y,
            x2: end.x,
            y2: end.y,
        };
    }

    if (entity.type === 'ARC') {
        const center = applyMatrixToPoint(
            { x: entity.cx, y: entity.cy },
            matrix,
        );
        const startAngle =
            (normalizeAngleDeg(entity.startAngleDeg) * Math.PI) / 180;
        let endAngle = (normalizeAngleDeg(entity.endAngleDeg) * Math.PI) / 180;
        if (endAngle <= startAngle) {
            endAngle += Math.PI * 2;
        }
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
        const startVector = { x: start.x - center.x, y: start.y - center.y };
        const endVector = { x: end.x - center.x, y: end.y - center.y };
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
        );
        const edge = applyMatrixToPoint(
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

    if (entity.type === 'SPLINE') {
        return {
            ...entity,
            controlPoints: entity.controlPoints.map((point) => ({
                ...point,
                ...applyMatrixToPoint(point, matrix),
            })),
        };
    }

    if (entity.type === 'LWPOLYLINE' || entity.type === 'POLYLINE') {
        return {
            ...entity,
            vertices: entity.vertices.map((vertex) => ({
                ...vertex,
                ...applyMatrixToPoint(vertex, matrix),
            })),
        };
    }

    return entity;
}

export function mirrorEntityY(entity, maxY) {
    if (entity.type === 'BITMAP') {
        const b = entity.bounds;
        if (!b) return entity;
        const newMinY = maxY - b.maxY,
            newMaxY = maxY - b.minY;
        return {
            ...entity,
            y: newMinY,
            bounds: {
                minX: b.minX,
                minY: newMinY,
                maxX: b.maxX,
                maxY: newMaxY,
            },
        };
    }
    if (entity.type === 'CAD_TEXT') {
        return {
            ...entity,
            strokes: entity.strokes.map((stroke) =>
                stroke.map((point) => ({ x: point.x, y: maxY - point.y })),
            ),
        };
    }
    if (entity.type === 'LINE') {
        return {
            ...entity,
            y1: maxY - entity.y1,
            y2: maxY - entity.y2,
        };
    }
    if (entity.type === 'ARC') {
        return {
            ...entity,
            cy: maxY - entity.cy,
            startAngleDeg: -entity.endAngleDeg,
            endAngleDeg: -entity.startAngleDeg,
        };
    }
    if (entity.type === 'CIRCLE') {
        return {
            ...entity,
            cy: maxY - entity.cy,
        };
    }
    if (entity.type === 'SPLINE') {
        return {
            ...entity,
            controlPoints: entity.controlPoints.map((point) => ({
                ...point,
                y: maxY - point.y,
            })),
        };
    }
    if (entity.type === 'LWPOLYLINE' || entity.type === 'POLYLINE') {
        return {
            ...entity,
            vertices: entity.vertices.map((vertex) => ({
                ...vertex,
                y: maxY - vertex.y,
            })),
        };
    }
    return entity;
}

export function normalizeAngleDeg(angle) {
    let value = angle % 360;
    if (value < 0) {
        value += 360;
    }
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

export function entityToSegment(entity, sourceEntityIndex = -1) {
    if (entity.type === 'LINE') {
        return {
            kind: 'line',
            source: entity,
            sourceEntityIndex,
            start: { x: entity.x1, y: entity.y1 },
            end: { x: entity.x2, y: entity.y2 },
            reverse() {
                return {
                    ...this,
                    start: clonePoint(this.end),
                    end: clonePoint(this.start),
                    reverse: this.reverse,
                    draw: this.draw,
                    flatten: this.flatten,
                };
            },
            draw(path, transform, scale = 1, startNewSubpath = true) {
                const p = transform(this.start);
                const q = transform(this.end);
                if (startNewSubpath) {
                    path.moveTo(p.x, p.y);
                }
                path.lineTo(q.x, q.y);
            },
            flatten() {
                return [clonePoint(this.start), clonePoint(this.end)];
            },
        };
    }

    if (entity.type === 'ARC') {
        const startAngle =
            (normalizeAngleDeg(entity.startAngleDeg) * Math.PI) / 180;
        let endAngle = (normalizeAngleDeg(entity.endAngleDeg) * Math.PI) / 180;
        if (endAngle <= startAngle) {
            endAngle += Math.PI * 2;
        }
        const start = {
            x: entity.cx + Math.cos(startAngle) * entity.radius,
            y: entity.cy + Math.sin(startAngle) * entity.radius,
        };
        const end = {
            x: entity.cx + Math.cos(endAngle) * entity.radius,
            y: entity.cy + Math.sin(endAngle) * entity.radius,
        };
        return {
            kind: 'arc',
            source: entity,
            sourceEntityIndex,
            start,
            end,
            cx: entity.cx,
            cy: entity.cy,
            radius: entity.radius,
            startAngle,
            endAngle,
            clockwise: false,
            reverse() {
                return {
                    ...this,
                    start: clonePoint(this.end),
                    end: clonePoint(this.start),
                    startAngle: this.endAngle,
                    endAngle: this.startAngle,
                    clockwise: !this.clockwise,
                    reverse: this.reverse,
                    draw: this.draw,
                    flatten: this.flatten,
                };
            },
            draw(path, transform, scale = 1, startNewSubpath = true) {
                const c = transform({ x: this.cx, y: this.cy });
                if (startNewSubpath) {
                    const start = transform(this.start);
                    path.moveTo(start.x, start.y);
                }
                path.arc(
                    c.x,
                    c.y,
                    this.radius * scale,
                    -this.startAngle,
                    -this.endAngle,
                    !this.clockwise,
                );
            },
            flatten(step = RENDER_SAMPLE_STEP) {
                const sweep = this.clockwise
                    ? this.startAngle - this.endAngle
                    : this.endAngle - this.startAngle;
                const total = Math.abs(sweep);
                const steps = Math.max(
                    12,
                    Math.ceil((this.radius * total) / step),
                );
                const points = [];
                for (let i = 0; i <= steps; i += 1) {
                    const t = i / steps;
                    const angle = this.clockwise
                        ? this.startAngle - total * t
                        : this.startAngle + total * t;
                    points.push({
                        x: this.cx + Math.cos(angle) * this.radius,
                        y: this.cy + Math.sin(angle) * this.radius,
                    });
                }
                return points;
            },
        };
    }

    if (entity.type === 'CIRCLE') {
        return {
            kind: 'circle',
            source: entity,
            sourceEntityIndex,
            closed: true,
            cx: entity.cx,
            cy: entity.cy,
            radius: entity.radius,
            flatten(step = RENDER_SAMPLE_STEP) {
                const circumference = Math.PI * 2 * this.radius;
                const steps = Math.max(36, Math.ceil(circumference / step));
                const points = [];
                for (let i = 0; i < steps; i += 1) {
                    const angle = (i / steps) * Math.PI * 2;
                    points.push({
                        x: this.cx + Math.cos(angle) * this.radius,
                        y: this.cy + Math.sin(angle) * this.radius,
                    });
                }
                return closePoints(points);
            },
        };
    }

    if (entity.type === 'SPLINE') {
        return createSplineSegment(entity);
    }

    return null;
}

function createBulgeArcSegment(
    start,
    end,
    bulge,
    entity,
    sourceEntityIndex = -1,
) {
    const chord = dist(start, end);
    if (!Number.isFinite(bulge) || Math.abs(bulge) < 1e-9 || chord <= 1e-9) {
        return {
            kind: 'line',
            source: entity,
            sourceEntityIndex,
            start: clonePoint(start),
            end: clonePoint(end),
            reverse() {
                return {
                    ...this,
                    start: clonePoint(this.end),
                    end: clonePoint(this.start),
                    reverse: this.reverse,
                    draw: this.draw,
                    flatten: this.flatten,
                };
            },
            draw(path, transform, scale = 1, startNewSubpath = true) {
                const p = transform(this.start);
                const q = transform(this.end);
                if (startNewSubpath) {
                    path.moveTo(p.x, p.y);
                }
                path.lineTo(q.x, q.y);
            },
            flatten() {
                return [clonePoint(this.start), clonePoint(this.end)];
            },
        };
    }

    const midpoint = {
        x: (start.x + end.x) / 2,
        y: (start.y + end.y) / 2,
    };
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy) || 1;
    const leftNormal = {
        x: -dy / length,
        y: dx / length,
    };
    const centerOffset = (chord * (1 - bulge * bulge)) / (4 * bulge);
    const center = {
        x: midpoint.x + leftNormal.x * centerOffset,
        y: midpoint.y + leftNormal.y * centerOffset,
    };
    const radius = dist(center, start);
    const startAngle = Math.atan2(start.y - center.y, start.x - center.x);
    let endAngle = Math.atan2(end.y - center.y, end.x - center.x);
    const clockwise = bulge < 0;

    if (!clockwise && endAngle <= startAngle) {
        endAngle += Math.PI * 2;
    } else if (clockwise && endAngle >= startAngle) {
        endAngle -= Math.PI * 2;
    }

    return {
        kind: 'arc',
        source: entity,
        sourceEntityIndex,
        start: clonePoint(start),
        end: clonePoint(end),
        cx: center.x,
        cy: center.y,
        radius,
        startAngle,
        endAngle,
        clockwise,
        reverse() {
            return {
                ...this,
                start: clonePoint(this.end),
                end: clonePoint(this.start),
                startAngle: this.endAngle,
                endAngle: this.startAngle,
                clockwise: !this.clockwise,
                reverse: this.reverse,
                draw: this.draw,
                flatten: this.flatten,
            };
        },
        draw(path, transform, scale = 1, startNewSubpath = true) {
            const c = transform({ x: this.cx, y: this.cy });
            if (startNewSubpath) {
                const transformedStart = transform(this.start);
                path.moveTo(transformedStart.x, transformedStart.y);
            }
            path.arc(
                c.x,
                c.y,
                this.radius * scale,
                -this.startAngle,
                -this.endAngle,
                !this.clockwise,
            );
        },
        flatten(step = RENDER_SAMPLE_STEP) {
            const sweep = this.clockwise
                ? this.startAngle - this.endAngle
                : this.endAngle - this.startAngle;
            const total = Math.abs(sweep);
            const steps = Math.max(12, Math.ceil((this.radius * total) / step));
            const points = [];
            for (let i = 0; i <= steps; i += 1) {
                const t = i / steps;
                const angle = this.clockwise
                    ? this.startAngle - total * t
                    : this.startAngle + total * t;
                points.push({
                    x: this.cx + Math.cos(angle) * this.radius,
                    y: this.cy + Math.sin(angle) * this.radius,
                });
            }
            return points;
        },
    };
}

function buildSegmentsFromPolylineEntity(entity, entityIndex) {
    const vertices = entity.vertices || [];
    if (vertices.length < 2) {
        return [];
    }
    const segments = [];
    const count = entity.closed ? vertices.length : vertices.length - 1;
    for (let i = 0; i < count; i += 1) {
        const current = vertices[i];
        const next = vertices[(i + 1) % vertices.length];
        const start = { x: current.x, y: current.y };
        const end = { x: next.x, y: next.y };
        const bulge = Number(current.bulge) || 0;
        if (Math.abs(bulge) > 1e-9) {
            segments.push(
                createBulgeArcSegment(start, end, bulge, entity, entityIndex),
            );
        } else {
            segments.push(
                polylineSegmentFromPoints([start, end], entity, entityIndex),
            );
        }
    }
    return segments;
}

function createSplineSegment(entity) {
    const cps = entity.controlPoints.map((point) => ({
        x: point.x,
        y: point.y,
        w: point.w,
    }));
    const degree = entity.degree;
    const knots = entity.knots.slice();
    const isBezier =
        degree === 3 &&
        cps.length === 4 &&
        knots.length === 8 &&
        almostEqual(knots[0], knots[1]) &&
        almostEqual(knots[1], knots[2]) &&
        almostEqual(knots[2], knots[3]) &&
        almostEqual(knots[4], knots[5]) &&
        almostEqual(knots[5], knots[6]) &&
        almostEqual(knots[6], knots[7]);

    if (isBezier) {
        return {
            kind: 'bezier',
            source: entity,
            sourceEntityIndex: entity.__sourceEntityIndex ?? -1,
            cps: cps.map(clonePoint),
            start: clonePoint(cps[0]),
            end: clonePoint(cps[3]),
            reverse() {
                const reversed = this.cps.slice().reverse();
                return {
                    ...this,
                    cps: reversed,
                    start: clonePoint(reversed[0]),
                    end: clonePoint(reversed[3]),
                    reverse: this.reverse,
                    draw: this.draw,
                    flatten: this.flatten,
                };
            },
            draw(path, transform, scale = 1, startNewSubpath = true) {
                const p0 = transform(this.cps[0]);
                const p1 = transform(this.cps[1]);
                const p2 = transform(this.cps[2]);
                const p3 = transform(this.cps[3]);
                if (startNewSubpath) {
                    path.moveTo(p0.x, p0.y);
                }
                path.bezierCurveTo(p1.x, p1.y, p2.x, p2.y, p3.x, p3.y);
            },
            flatten(step = RENDER_SAMPLE_STEP) {
                const length = estimateBezierLength(this.cps);
                const steps = Math.max(10, Math.ceil(length / step));
                const points = [];
                for (let i = 0; i <= steps; i += 1) {
                    const t = i / steps;
                    points.push(evalBezier(this.cps, t));
                }
                return points;
            },
        };
    }

    const start = evaluateBSplinePoint(degree, knots, cps, knots[degree]);
    const end = evaluateBSplinePoint(
        degree,
        knots,
        cps,
        knots[knots.length - degree - 1],
    );
    return {
        kind: 'spline',
        source: entity,
        sourceEntityIndex: entity.__sourceEntityIndex ?? -1,
        cps,
        degree,
        knots,
        start,
        end,
        reverse() {
            const samples = this.flatten().slice().reverse();
            return polylineSegmentFromPoints(samples, entity);
        },
        draw(path, transform, scale = 1, startNewSubpath = true) {
            const points = this.flatten();
            drawPolylineIntoPath(path, points, transform, startNewSubpath);
        },
        flatten(step = RENDER_SAMPLE_STEP) {
            const steps = Math.max(
                18,
                Math.ceil(estimateControlPolygonLength(this.cps) / step),
            );
            const minT = this.knots[this.degree];
            const maxT = this.knots[this.knots.length - this.degree - 1];
            const points = [];
            for (let i = 0; i <= steps; i += 1) {
                const t =
                    i === steps ? maxT : minT + (maxT - minT) * (i / steps);
                points.push(
                    evaluateBSplinePoint(this.degree, this.knots, this.cps, t),
                );
            }
            return points;
        },
    };
}

export function polylineSegmentFromPoints(
    points,
    entity,
    sourceEntityIndex = -1,
) {
    const resolvedSourceEntityIndex =
        sourceEntityIndex >= 0
            ? sourceEntityIndex
            : (entity?.__sourceEntityIndex ?? -1);
    const start = points[0];
    const end = points[points.length - 1];
    return {
        kind: 'polyline',
        source: entity,
        sourceEntityIndex: resolvedSourceEntityIndex,
        start,
        end,
        reverse() {
            return polylineSegmentFromPoints(
                points.slice().reverse(),
                entity,
                resolvedSourceEntityIndex,
            );
        },
        draw(path, transform, scale = 1, startNewSubpath = true) {
            drawPolylineIntoPath(path, points, transform, startNewSubpath);
        },
        flatten() {
            return points.map(clonePoint);
        },
    };
}

export function buildLoops(entities) {
    const openSegments = [];
    const loops = [];
    const circles = [];
    for (let entityIndex = 0; entityIndex < entities.length; entityIndex += 1) {
        const entity = entities[entityIndex];
        if (entity.type === 'BITMAP') {
            const b = entity.bounds || {
                minX: entity.x || 0,
                minY: entity.y || 0,
                maxX: (entity.x || 0) + (entity.w || 10),
                maxY: (entity.y || 0) + (entity.h || 10),
            };
            const points = [
                { x: b.minX, y: b.minY },
                { x: b.maxX, y: b.minY },
                { x: b.maxX, y: b.maxY },
                { x: b.minX, y: b.maxY },
            ];
            const closed = closePoints(points);
            loops.push({
                id: entity.__loopId || crypto.randomUUID(),
                closed: true,
                sourceType: 'bitmap',
                sourceEntityIndexes: [entityIndex],
                segments: [],
                points: closed,
                bounds: {
                    minX: b.minX,
                    minY: b.minY,
                    maxX: b.maxX,
                    maxY: b.maxY,
                },
                area: (b.maxX - b.minX) * (b.maxY - b.minY),
                path2d: null,
                exportGeometry: { type: 'bitmap', entityIndex },
                isBitmap: true,
            });
            continue;
        }
        if (entity.type === 'CAD_TEXT') {
            for (const stroke of entity.strokes || []) {
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
            }
            continue;
        }
        if (entity.type === 'LWPOLYLINE' || entity.type === 'POLYLINE') {
            const segments = buildSegmentsFromPolylineEntity(
                entity,
                entityIndex,
            );
            if (!segments.length) {
                continue;
            }
            if (entity.closed) {
                const points = [];
                for (const segment of segments) {
                    const flattened = segment.flatten(TOOLPATH_SAMPLE_STEP);
                    if (points.length > 0) {
                        flattened.shift();
                    }
                    points.push(...flattened);
                }
                const closedPoints = closePoints(points);
                loops.push({
                    id: crypto.randomUUID(),
                    closed: true,
                    sourceType: entity.type.toLowerCase(),
                    sourceEntityIndexes: [entityIndex],
                    segments,
                    points: closedPoints,
                    bounds: boundsOfPoints(closedPoints),
                    area: polygonArea(closedPoints),
                    path2d: null,
                    exportGeometry: {
                        type: 'segments',
                        segments,
                    },
                });
            } else {
                openSegments.push(...segments);
            }
            continue;
        }
        entity.__sourceEntityIndex = entityIndex;
        const segment = entityToSegment(entity, entityIndex);
        if (!segment) {
            continue;
        }
        if (segment.kind === 'circle') {
            circles.push(buildCircleLoop(segment));
        } else {
            openSegments.push(segment);
        }
    }
    const dedupedOpenSegments = dedupeOpenSegments(openSegments);
    loops.push(...circles);

    const adjacency = new Map();
    dedupedOpenSegments.forEach((segment, index) => {
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

    for (let i = 0; i < dedupedOpenSegments.length; i += 1) {
        if (used.has(i)) {
            continue;
        }
        const seed = dedupedOpenSegments[i];
        used.add(i);
        let chain = [seed];
        let currentStart = clonePoint(seed.start);
        let currentEnd = clonePoint(seed.end);
        let changed = true;

        while (changed) {
            changed = false;
            const endMatch = findConnectedSegment(
                dedupedOpenSegments,
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
                dedupedOpenSegments,
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

        if (dist(currentStart, currentEnd) <= LOOP_TOLERANCE) {
            loops.push(buildLoopFromChain(chain));
        } else if (chain.length) {
            loops.push(buildOpenChain(chain));
        }
    }

    const filteredLoops = loops.filter(
        (loop) => loop.closed === false || Math.abs(loop.area) > 1e-3,
    );
    const representedEntityIndexes = new Set(
        filteredLoops
            .flatMap((loop) => loop.sourceEntityIndexes || [])
            .filter((value) => value >= 0),
    );
    for (const segment of dedupedOpenSegments) {
        if (
            segment.sourceEntityIndex >= 0 &&
            !representedEntityIndexes.has(segment.sourceEntityIndex)
        ) {
            filteredLoops.push(buildOpenChain([segment]));
            representedEntityIndexes.add(segment.sourceEntityIndex);
        }
    }

    return filteredLoops;
}

function dedupeOpenSegments(segments) {
    const unique = [];
    const seen = new Set();
    for (const segment of segments) {
        const signature = segmentGeometrySignature(segment);
        if (seen.has(signature)) {
            continue;
        }
        seen.add(signature);
        unique.push(segment);
    }
    return unique;
}

function segmentGeometrySignature(segment) {
    const points = segment.flatten(Math.max(0.25, RENDER_SAMPLE_STEP / 2));
    if (!points?.length) {
        return `${segment.kind}:empty`;
    }
    const start = points[0];
    const end = points[points.length - 1];
    const midpoint = points[Math.floor((points.length - 1) / 2)] || start;
    const forward = [start, midpoint, end].map(signaturePoint).join('|');
    const reverse = [end, midpoint, start].map(signaturePoint).join('|');
    return `${segment.kind}:${forward < reverse ? forward : reverse}`;
}

function signaturePoint(point) {
    return `${Math.round(point.x / LOOP_TOLERANCE)}:${Math.round(point.y / LOOP_TOLERANCE)}`;
}

function addAdjacency(map, key, item) {
    if (!map.has(key)) {
        map.set(key, []);
    }
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
    let bestMatch = null;
    let bestScore = Number.NEGATIVE_INFINITY;
    for (const candidate of candidates) {
        if (used.has(candidate.index)) {
            continue;
        }
        const nextSegment = openSegments[candidate.index];
        if (side === 'end') {
            const oriented =
                dist(nextSegment.start, anchorPoint) <= LOOP_TOLERANCE
                    ? nextSegment
                    : nextSegment.reverse();
            if (dist(oriented.start, anchorPoint) <= LOOP_TOLERANCE) {
                const score = scoreSegmentContinuation(
                    currentSegment,
                    oriented,
                    'end',
                );
                if (score > bestScore) {
                    bestScore = score;
                    bestMatch = { index: candidate.index, segment: oriented };
                }
            }
            continue;
        }
        const oriented =
            dist(nextSegment.end, anchorPoint) <= LOOP_TOLERANCE
                ? nextSegment
                : nextSegment.reverse();
        if (dist(oriented.end, anchorPoint) <= LOOP_TOLERANCE) {
            const score = scoreSegmentContinuation(
                currentSegment,
                oriented,
                'start',
            );
            if (score > bestScore) {
                bestScore = score;
                bestMatch = { index: candidate.index, segment: oriented };
            }
        }
    }
    return bestMatch;
}

function scoreSegmentContinuation(currentSegment, candidateSegment, side) {
    if (!currentSegment) {
        return 0;
    }
    const currentTangent =
        side === 'end'
            ? getSegmentTangent(currentSegment, true)
            : scaleVector(getSegmentTangent(currentSegment, false), -1);
    const candidateTangent =
        side === 'end'
            ? getSegmentTangent(candidateSegment, false)
            : scaleVector(getSegmentTangent(candidateSegment, true), -1);

    const currentUnit = normalizeVector(currentTangent);
    const candidateUnit = normalizeVector(candidateTangent);
    if (!currentUnit || !candidateUnit) {
        return 0;
    }
    return currentUnit.x * candidateUnit.x + currentUnit.y * candidateUnit.y;
}

function getSegmentTangent(segment, atEnd) {
    const points = segment.flatten(Math.max(0.25, RENDER_SAMPLE_STEP / 2));
    if (!points?.length || points.length < 2) {
        return { x: 0, y: 0 };
    }
    if (atEnd) {
        const a = points[points.length - 2];
        const b = points[points.length - 1];
        return { x: b.x - a.x, y: b.y - a.y };
    }
    const a = points[0];
    const b = points[1];
    return { x: b.x - a.x, y: b.y - a.y };
}

function normalizeVector(vector) {
    const length = Math.hypot(vector.x, vector.y);
    if (length <= 1e-9) {
        return null;
    }
    return {
        x: vector.x / length,
        y: vector.y / length,
    };
}

function scaleVector(vector, scalar) {
    return {
        x: vector.x * scalar,
        y: vector.y * scalar,
    };
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

function buildLoopFromChain(chain) {
    const points = [];
    for (const segment of chain) {
        const flattened = segment.flatten(TOOLPATH_SAMPLE_STEP);
        if (points.length > 0) {
            flattened.shift();
        }
        points.push(...flattened);
    }
    const closed = closePoints(points);
    return {
        id: crypto.randomUUID(),
        closed: true,
        sourceType: 'chain',
        sourceEntityIndexes: Array.from(
            new Set(
                chain
                    .map((segment) => segment.sourceEntityIndex)
                    .filter((value) => value >= 0),
            ),
        ).sort((a, b) => a - b),
        segments: chain,
        points: closed,
        bounds: boundsOfPoints(closed),
        area: polygonArea(closed),
        path2d: null,
        exportGeometry: {
            type: 'segments',
            segments: chain,
        },
    };
}

function buildOpenChain(chain) {
    const points = [];
    for (const segment of chain) {
        const flattened = segment.flatten(TOOLPATH_SAMPLE_STEP);
        if (points.length > 0) {
            flattened.shift();
        }
        points.push(...flattened);
    }
    return {
        id: crypto.randomUUID(),
        closed: false,
        sourceType: 'open-chain',
        sourceEntityIndexes: Array.from(
            new Set(
                chain
                    .map((segment) => segment.sourceEntityIndex)
                    .filter((value) => value >= 0),
            ),
        ).sort((a, b) => a - b),
        segments: chain,
        points,
        bounds: boundsOfPoints(points),
        area: 0,
        path2d: null,
        exportGeometry: {
            type: 'segments',
            segments: chain,
        },
    };
}

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
            const c = transform({ x: segment.cx, y: segment.cy });
            path.arc(c.x, c.y, segment.radius * scale, 0, Math.PI * 2);
        } else {
            segment.draw(path, transform, scale, false);
        }
    }
    if (closed) {
        path.closePath();
    }
    return path;
}

function drawPolylineIntoPath(path, points, transform, startNewSubpath = true) {
    if (!points.length) {
        return;
    }
    const start = transform(points[0]);
    if (startNewSubpath) {
        path.moveTo(start.x, start.y);
    } else {
        path.lineTo(start.x, start.y);
    }
    for (let i = 1; i < points.length; i += 1) {
        const point = transform(points[i]);
        path.lineTo(point.x, point.y);
    }
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
    if (!list.length) {
        return null;
    }
    return list.reduce((acc, bounds) => ({
        minX: Math.min(acc.minX, bounds.minX),
        minY: Math.min(acc.minY, bounds.minY),
        maxX: Math.max(acc.maxX, bounds.maxX),
        maxY: Math.max(acc.maxY, bounds.maxY),
    }));
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
        } else if (entity.type === 'CAD_TEXT') {
            candidateBounds.push(boundsOfPoints(entity.strokes.flat()));
        } else if (entity.type === 'LINE') {
            candidateBounds.push(
                boundsOfPoints([
                    { x: entity.x1, y: entity.y1 },
                    { x: entity.x2, y: entity.y2 },
                ]),
            );
        } else if (entity.type === 'ARC' || entity.type === 'CIRCLE') {
            candidateBounds.push({
                minX: entity.cx - entity.radius,
                minY: entity.cy - entity.radius,
                maxX: entity.cx + entity.radius,
                maxY: entity.cy + entity.radius,
            });
        } else if (
            (entity.type === 'LWPOLYLINE' || entity.type === 'POLYLINE') &&
            entity.vertices.length
        ) {
            candidateBounds.push(
                boundsOfPoints(
                    entity.vertices.map((vertex) => ({
                        x: vertex.x,
                        y: vertex.y,
                    })),
                ),
            );
        } else if (entity.type === 'SPLINE' && entity.controlPoints.length) {
            candidateBounds.push(boundsOfPoints(entity.controlPoints));
        }
    }
    return mergeBounds(candidateBounds);
}

export function polygonArea(points) {
    let area = 0;
    for (let i = 0; i < points.length - 1; i += 1) {
        area += points[i].x * points[i + 1].y - points[i + 1].x * points[i].y;
    }
    return area / 2;
}

export function closePoints(points) {
    if (!points.length) {
        return points;
    }
    const first = points[0];
    const last = points[points.length - 1];
    if (dist(first, last) <= LOOP_TOLERANCE) {
        return points;
    }
    return [...points, clonePoint(first)];
}

export function almostEqual(a, b, epsilon = 1e-9) {
    return Math.abs(a - b) <= epsilon;
}

function evalBezier(cps, t) {
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

function estimateBezierLength(cps) {
    let length = 0;
    let previous = cps[0];
    for (let i = 1; i <= 16; i += 1) {
        const point = evalBezier(cps, i / 16);
        length += dist(previous, point);
        previous = point;
    }
    return length;
}

function estimateControlPolygonLength(cps) {
    let length = 0;
    for (let i = 1; i < cps.length; i += 1) {
        length += dist(cps[i - 1], cps[i]);
    }
    return length;
}

function evaluateBSplinePoint(degree, knots, controlPoints, t) {
    const n = controlPoints.length - 1;
    const d = [];
    let k = degree;
    while (k < knots.length - degree - 1 && t >= knots[k + 1]) {
        k += 1;
    }

    for (let j = 0; j <= degree; j += 1) {
        const point = controlPoints[Math.min(n, Math.max(0, k - degree + j))];
        d[j] = { x: point.x, y: point.y, w: point.w || 1 };
    }

    for (let r = 1; r <= degree; r += 1) {
        for (let j = degree; j >= r; j -= 1) {
            const i = k - degree + j;
            const denominator = knots[i + degree + 1 - r] - knots[i];
            const alpha = denominator === 0 ? 0 : (t - knots[i]) / denominator;
            d[j] = {
                x: (1 - alpha) * d[j - 1].x + alpha * d[j].x,
                y: (1 - alpha) * d[j - 1].y + alpha * d[j].y,
                w: (1 - alpha) * d[j - 1].w + alpha * d[j].w,
            };
        }
    }

    return { x: d[degree].x, y: d[degree].y };
}

function cloneSplineControlPoint(point) {
    return { x: point.x, y: point.y, z: point.z || 0, w: point.w || 1 };
}

function splineDomain(entity) {
    const degree = Number(entity?.degree);
    const knots = entity?.knots || [];
    if (
        !Number.isInteger(degree) ||
        degree < 1 ||
        knots.length < degree * 2 + 2
    )
        return null;
    return { min: knots[degree], max: knots[knots.length - degree - 1] };
}

function homogeneousSplinePoint(point) {
    const weight = point.w || 1;
    return {
        x: point.x * weight,
        y: point.y * weight,
        z: (point.z || 0) * weight,
        w: weight,
    };
}

function dehomogenizeSplinePoint(point) {
    const weight = Math.abs(point.w) > 1e-12 ? point.w : 1;
    return {
        x: point.x / weight,
        y: point.y / weight,
        z: point.z / weight,
        w: weight,
    };
}

function evaluateRationalBSplinePoint(degree, knots, controlPoints, t) {
    const n = controlPoints.length - 1;
    const domainMin = knots[degree];
    const domainMax = knots[knots.length - degree - 1];
    const clampedT = Math.max(domainMin, Math.min(domainMax, t));
    let span = degree;
    while (span < n && clampedT >= knots[span + 1] - 1e-12) span += 1;
    const work = [];
    for (let j = 0; j <= degree; j += 1) {
        work.push(
            homogeneousSplinePoint(
                controlPoints[Math.min(n, Math.max(0, span - degree + j))],
            ),
        );
    }
    for (let level = 1; level <= degree; level += 1) {
        for (let j = degree; j >= level; j -= 1) {
            const knotIndex = span - degree + j;
            const denominator =
                knots[knotIndex + degree + 1 - level] - knots[knotIndex];
            const alpha =
                Math.abs(denominator) <= 1e-12
                    ? 0
                    : (clampedT - knots[knotIndex]) / denominator;
            work[j] = {
                x: (1 - alpha) * work[j - 1].x + alpha * work[j].x,
                y: (1 - alpha) * work[j - 1].y + alpha * work[j].y,
                z: (1 - alpha) * work[j - 1].z + alpha * work[j].z,
                w: (1 - alpha) * work[j - 1].w + alpha * work[j].w,
            };
        }
    }
    return dehomogenizeSplinePoint(work[degree]);
}

export function evaluateSplinePoint(entity, t) {
    const domain = splineDomain(entity);
    if (!domain || !entity?.controlPoints?.length) return null;
    return evaluateRationalBSplinePoint(
        entity.degree,
        entity.knots,
        entity.controlPoints,
        t,
    );
}

export function splineEndpointTangent(entity, end) {
    const domain = splineDomain(entity);
    if (!domain) return null;
    const range = domain.max - domain.min;
    const delta = Math.max(range * 1e-6, 1e-8);
    const atStart = end === 'start';
    const first = evaluateSplinePoint(
        entity,
        atStart ? domain.min : domain.max - delta,
    );
    const second = evaluateSplinePoint(
        entity,
        atStart ? domain.min + delta : domain.max,
    );
    if (!first || !second) return null;
    const dx = atStart ? second.x - first.x : first.x - second.x;
    const dy = atStart ? second.y - first.y : first.y - second.y;
    const length = Math.hypot(dx, dy);
    return length > 1e-10 ? { x: dx / length, y: dy / length } : null;
}

export function splineTangentAt(entity, t, direction = 1) {
    const domain = splineDomain(entity);
    if (!domain) return null;
    const range = domain.max - domain.min;
    const delta = Math.max(range * 1e-6, 1e-8);
    const first = evaluateSplinePoint(entity, Math.max(domain.min, t - delta));
    const second = evaluateSplinePoint(entity, Math.min(domain.max, t + delta));
    if (!first || !second) return null;
    const multiplier = direction < 0 ? -1 : 1;
    const dx = (second.x - first.x) * multiplier;
    const dy = (second.y - first.y) * multiplier;
    const length = Math.hypot(dx, dy);
    return length > 1e-10 ? { x: dx / length, y: dy / length } : null;
}

function splineArcLength(entity, startT, endT, steps = 48) {
    let length = 0;
    let previous = evaluateSplinePoint(entity, startT);
    for (let index = 1; index <= steps; index += 1) {
        const point = evaluateSplinePoint(
            entity,
            startT + (endT - startT) * (index / steps),
        );
        length += Math.hypot(point.x - previous.x, point.y - previous.y);
        previous = point;
    }
    return length;
}

export function splineParameterAtDistance(entity, end, distance) {
    const domain = splineDomain(entity);
    if (!domain) return null;
    const total = splineArcLength(entity, domain.min, domain.max, 96);
    const target = Math.max(0, Math.min(total, distance));
    let low = domain.min;
    let high = domain.max;
    for (let iteration = 0; iteration < 24; iteration += 1) {
        const middle = (low + high) / 2;
        const measured =
            end === 'start'
                ? splineArcLength(entity, domain.min, middle)
                : splineArcLength(entity, middle, domain.max);
        if (measured < target) {
            if (end === 'start') low = middle;
            else high = middle;
        } else if (end === 'start') {
            high = middle;
        } else {
            low = middle;
        }
    }
    return (low + high) / 2;
}

function findSplineSpan(degree, knots, pointCount, t) {
    const n = pointCount - 1;
    if (t >= knots[n + 1] - 1e-12) return n;
    let low = degree;
    let high = n + 1;
    let middle = Math.floor((low + high) / 2);
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
    const n = controlPoints.length - 1;
    const span = findSplineSpan(degree, knots, controlPoints.length, t);
    const multiplicity = knotMultiplicity(knots, t);
    const insertedKnots = [
        ...knots.slice(0, span + 1),
        t,
        ...knots.slice(span + 1),
    ];
    const insertedPoints = new Array(controlPoints.length + 1);
    for (let index = 0; index <= span - degree; index += 1)
        insertedPoints[index] = cloneSplineControlPoint(controlPoints[index]);
    for (let index = span - multiplicity; index <= n; index += 1)
        insertedPoints[index + 1] = cloneSplineControlPoint(
            controlPoints[index],
        );
    for (
        let index = span - degree + 1;
        index <= span - multiplicity;
        index += 1
    ) {
        const denominator = knots[index + degree] - knots[index];
        const alpha =
            Math.abs(denominator) <= 1e-12
                ? 0
                : (t - knots[index]) / denominator;
        const left = homogeneousSplinePoint(controlPoints[index - 1]);
        const right = homogeneousSplinePoint(controlPoints[index]);
        insertedPoints[index] = dehomogenizeSplinePoint({
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
    let knots = entity.knots.slice();
    let controlPoints = entity.controlPoints.map(cloneSplineControlPoint);
    while (knotMultiplicity(knots, t) < degree) {
        ({ knots, controlPoints } = insertSplineKnotOnce(
            degree,
            knots,
            controlPoints,
            t,
        ));
    }
    const firstSplitKnot = knots.findIndex(
        (knot) => Math.abs(knot - t) <= 1e-10,
    );
    const splitIndex = firstSplitKnot - 1;
    if (splitIndex < degree || splitIndex >= controlPoints.length - degree)
        return null;
    const left = {
        ...entity,
        knots: [...knots.slice(0, splitIndex + degree + 1), t],
        controlPoints: controlPoints
            .slice(0, splitIndex + 1)
            .map(cloneSplineControlPoint),
    };
    const right = {
        ...entity,
        knots: [t, ...knots.slice(splitIndex + 1)],
        controlPoints: controlPoints
            .slice(splitIndex)
            .map(cloneSplineControlPoint),
    };
    return end === 'start' ? right : left;
}

export function pointAtDistance(points, distanceValue) {
    let remaining = distanceValue;
    for (let i = 1; i < points.length; i += 1) {
        const a = points[i - 1];
        const b = points[i];
        const segmentLength = dist(a, b);
        if (remaining <= segmentLength || i === points.length - 1) {
            const t = segmentLength === 0 ? 0 : remaining / segmentLength;
            return {
                x: a.x + (b.x - a.x) * t,
                y: a.y + (b.y - a.y) * t,
            };
        }
        remaining -= segmentLength;
    }
    return clonePoint(points[points.length - 1]);
}

export function polylineLength(points) {
    let length = 0;
    for (let i = 1; i < points.length; i += 1) {
        length += dist(points[i - 1], points[i]);
    }
    return length;
}
