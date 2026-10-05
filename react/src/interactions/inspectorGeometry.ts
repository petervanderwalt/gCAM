/**
 * Purpose: Implementation module for inspectorGeometry in the react domain.
 */
import { rotatePoints, scalePointsXY } from '../lib/transform';

export interface Point {
    x: number;
    y: number;
}

export interface InspectorGeometryPatch {
    x: number;
    y: number;
    w: number;
    h: number;
    angle: number;
    radius?: number;
    sides?: number;
    polygonMode?: 'inscribed' | 'circumscribed';
}

export interface InspectorGeometryLoop {
    id: string;
    points: Point[];
    sourceType?: string;
    exportGeometry?: { type?: string };
}

export interface InspectorGeometryResult {
    points: Point[];
    isCircle: boolean;
    isPolygon: boolean;
    targetWidth: number;
    targetHeight: number;
}

function polygonPoints(
    loop: InspectorGeometryLoop,
    patch: InspectorGeometryPatch,
    minX: number,
    minY: number,
    width: number,
    height: number,
) {
    if (!(patch.sides && patch.sides >= 3)) return loop.points;
    const count = Math.round(patch.sides);
    const centerX = minX + width / 2;
    const centerY = minY + height / 2;
    const apothemOrRadius =
        patch.radius && patch.radius > 0
            ? patch.radius
            : Math.min(width, height) / 2;
    const vertexRadius =
        patch.polygonMode === 'circumscribed'
            ? apothemOrRadius / Math.cos(Math.PI / count)
            : apothemOrRadius;
    const start = Math.atan2(
        loop.points[0].y - centerY,
        loop.points[0].x - centerX,
    );
    const points = Array.from({ length: count }, (_, index) => {
        const angle = start + (index / count) * Math.PI * 2;
        return {
            x: centerX + Math.cos(angle) * vertexRadius,
            y: centerY + Math.sin(angle) * vertexRadius,
        };
    });
    const nextMinX = Math.min(...points.map((point) => point.x));
    const nextMinY = Math.min(...points.map((point) => point.y));
    const shiftX = patch.x - nextMinX;
    const shiftY = patch.y - nextMinY;
    const placed = points.map((point) => ({
        x: point.x + shiftX,
        y: point.y + shiftY,
    }));
    return [...placed, { ...placed[0] }];
}

/** Derive inspector preview/final geometry without mutating document state. */
export function inspectorGeometry(
    loop: InspectorGeometryLoop,
    patch: InspectorGeometryPatch,
    currentAngle: number,
): InspectorGeometryResult | null {
    const xs = loop.points.map((point) => point.x);
    const ys = loop.points.map((point) => point.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const width = Math.max(...xs) - minX;
    const height = Math.max(...ys) - minY;
    const isCircle =
        loop.sourceType === 'circle' || loop.exportGeometry?.type === 'circle';
    const isPolygon = loop.sourceType === 'polygon';
    const targetWidth =
        isCircle && patch.radius && patch.radius > 0
            ? patch.radius * 2
            : patch.w;
    const targetHeight =
        isCircle && patch.radius && patch.radius > 0
            ? patch.radius * 2
            : patch.h;
    if (!(targetWidth > 0) || !(targetHeight > 0)) return null;
    const base = isPolygon
        ? polygonPoints(loop, patch, minX, minY, width, height)
        : loop.points;
    const moved = isPolygon
        ? base
        : base.map((point) => ({
              x: point.x + (patch.x - minX),
              y: point.y + (patch.y - minY),
          }));
    const scaled =
        !isPolygon && width > 0 && height > 0
            ? scalePointsXY(moved, targetWidth / width, targetHeight / height, {
                  x: patch.x,
                  y: patch.y,
              })
            : moved;
    const delta = patch.angle - currentAngle;
    const scaledMinX = Math.min(...scaled.map((point) => point.x));
    const scaledMaxX = Math.max(...scaled.map((point) => point.x));
    const scaledMinY = Math.min(...scaled.map((point) => point.y));
    const scaledMaxY = Math.max(...scaled.map((point) => point.y));
    return {
        points:
            Math.abs(delta) > 1e-9
                ? rotatePoints(scaled, delta, {
                      x: (scaledMinX + scaledMaxX) / 2,
                      y: (scaledMinY + scaledMaxY) / 2,
                  })
                : scaled,
        isCircle,
        isPolygon,
        targetWidth: isPolygon ? scaledMaxX - scaledMinX : targetWidth,
        targetHeight: isPolygon ? scaledMaxY - scaledMinY : targetHeight,
    };
}
