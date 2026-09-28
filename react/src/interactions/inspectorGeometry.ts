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
    const maxX = minX + width;
    const maxY = minY + height;
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const radius =
        patch.polygonMode === 'circumscribed'
            ? Math.min(width, height) / 2 / Math.cos(Math.PI / count)
            : Math.min(width, height) / 2;
    const start = Math.atan2(
        loop.points[0].y - centerY,
        loop.points[0].x - centerX,
    );
    return Array.from({ length: count + 1 }, (_, index) => {
        const angle = start + (index / count) * Math.PI * 2;
        return {
            x: centerX + Math.cos(angle) * radius,
            y: centerY + Math.sin(angle) * radius,
        };
    });
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
        (isCircle || isPolygon) && patch.radius && patch.radius > 0
            ? patch.radius * 2
            : patch.w;
    const targetHeight =
        (isCircle || isPolygon) && patch.radius && patch.radius > 0
            ? patch.radius * 2
            : patch.h;
    if (!(targetWidth > 0) || !(targetHeight > 0)) return null;
    const base = isPolygon
        ? polygonPoints(loop, patch, minX, minY, width, height)
        : loop.points;
    const moved = base.map((point) => ({
        x: point.x + (patch.x - minX),
        y: point.y + (patch.y - minY),
    }));
    const scaled =
        width > 0 && height > 0
            ? scalePointsXY(moved, targetWidth / width, targetHeight / height, {
                  x: patch.x,
                  y: patch.y,
              })
            : moved;
    const delta = patch.angle - currentAngle;
    return {
        points:
            Math.abs(delta) > 1e-9
                ? rotatePoints(scaled, delta, {
                      x: patch.x + targetWidth / 2,
                      y: patch.y + targetHeight / 2,
                  })
                : scaled,
        isCircle,
        isPolygon,
        targetWidth,
        targetHeight,
    };
}
