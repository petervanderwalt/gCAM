import '../engine/clipper-shim.js';
import { CLIPPER_SCALE } from '../engine/constants.js';
import { closePoints, clonePoint } from '../geometry/primitives.js';
import { boundsOfPoints, polygonArea } from '../geometry/bounds.js';

function clipperPathFromPoints(points) {
    const path = points.slice(0, -1).map((point) => ({
        X: Math.round(point.x * CLIPPER_SCALE),
        Y: Math.round(point.y * CLIPPER_SCALE),
    }));
    return ClipperLib.JS.Clean(path, 2);
}

function pointsFromClipperPath(path) {
    return closePoints(
        path.map((point) => ({
            x: point.X / CLIPPER_SCALE,
            y: point.Y / CLIPPER_SCALE,
        })),
    );
}

function pointInPolygon(point, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
        const a = polygon[i];
        const b = polygon[j];
        const intersects =
            a.y > point.y !== b.y > point.y &&
            point.x <
                ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y || 1e-12) + a.x;
        if (intersects) inside = !inside;
    }
    return inside;
}

function clipPolygonHalfPlane(points, normalX, normalY, constant) {
    const output = [];
    for (let i = 0; i < points.length; i += 1) {
        const a = points[i];
        const b = points[(i + 1) % points.length];
        const da = a.x * normalX + a.y * normalY - constant;
        const db = b.x * normalX + b.y * normalY - constant;
        const aInside = da <= 1e-8;
        const bInside = db <= 1e-8;
        if (aInside) output.push(a);
        if (aInside !== bInside) {
            const t = da / (da - db);
            output.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
        }
    }
    return output;
}

function clipVoronoiCellToSelection(cell, selection) {
    if (cell.length < 3 || !selection.length) return [];
    const clipper = new ClipperLib.Clipper();
    clipper.AddPath(
        clipperPathFromPoints(closePoints(cell)),
        ClipperLib.PolyType.ptSubject,
        true,
    );
    clipper.AddPaths(
        selection.map(clipperPathFromPoints),
        ClipperLib.PolyType.ptClip,
        true,
    );
    const solution = new ClipperLib.Paths();
    clipper.Execute(
        ClipperLib.ClipType.ctIntersection,
        solution,
        ClipperLib.PolyFillType.pftNonZero,
        ClipperLib.PolyFillType.pftNonZero,
    );
    return solution
        .map(pointsFromClipperPath)
        .filter((path) => Math.abs(polygonArea(path)) > 0.05);
}

/** Deterministic V-bit texture contours, independent of toolpath construction. */
export function voronoiTextureContours(selection, spacing = 5) {
    if (!selection.length) return [];
    const bounds = boundsOfPoints(
        selection.flatMap((path) => path.slice(0, -1)),
    );
    const requestedStep = Math.max(0.1, Number(spacing) || 5);
    // Never stop halfway through a selection: that leaves the last sampled
    // row's cells unbounded and creates the long spikes seen in the preview.
    // For very large jobs, enlarge the requested cell size uniformly so the
    // whole selected area remains represented within a bounded preview cost.
    const area = Math.max(
        1,
        (bounds.maxX - bounds.minX) * (bounds.maxY - bounds.minY),
    );
    const step = Math.max(requestedStep, Math.sqrt(area / 480));
    const contains = (point) =>
        selection.reduce(
            (inside, path) => (pointInPolygon(point, path) ? !inside : inside),
            false,
        );
    const sites = [];
    for (
        let row = 0, y = bounds.minY + step / 2;
        y < bounds.maxY;
        row += 1, y += step
    ) {
        for (
            let col = 0, x = bounds.minX + step / 2;
            x < bounds.maxX;
            col += 1, x += step
        ) {
            const hash =
                Math.sin((col + 17) * 12.9898 + (row + 31) * 78.233) *
                43758.5453;
            const jitterHash = Math.sin(hash * 19.19) * 43758.5453;
            const site = {
                x: x + (hash - Math.floor(hash) - 0.5) * step * 0.5,
                y: y + (jitterHash - Math.floor(jitterHash) - 0.5) * step * 0.5,
            };
            if (contains(site)) sites.push(site);
        }
    }
    const pad =
        Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY, step) *
        2;
    const seedBounds = [
        { x: bounds.minX - pad, y: bounds.minY - pad },
        { x: bounds.maxX + pad, y: bounds.minY - pad },
        { x: bounds.maxX + pad, y: bounds.maxY + pad },
        { x: bounds.minX - pad, y: bounds.maxY + pad },
    ];
    const contours = [];
    for (let i = 0; i < sites.length; i += 1) {
        let cell = seedBounds.map(clonePoint);
        const site = sites[i];
        for (let j = 0; j < sites.length && cell.length >= 3; j += 1) {
            if (i === j) continue;
            const other = sites[j];
            const nx = other.x - site.x;
            const ny = other.y - site.y;
            cell = clipPolygonHalfPlane(
                cell,
                nx,
                ny,
                (other.x * other.x +
                    other.y * other.y -
                    site.x * site.x -
                    site.y * site.y) /
                    2,
            );
        }
        contours.push(...clipVoronoiCellToSelection(cell, selection));
    }
    return contours;
}

export function crosshatchTextureContours(
    selection,
    spacing = 5,
    angleDegrees = 45,
) {
    if (!selection.length) return [];
    const bounds = boundsOfPoints(
        selection.flatMap((path) => path.slice(0, -1)),
    );
    const step = Math.max(0.5, Number(spacing) || 5);
    const contains = (point) =>
        selection.reduce(
            (inside, path) => (pointInPolygon(point, path) ? !inside : inside),
            false,
        );
    const contours = [];
    const origin = {
        x: (bounds.minX + bounds.maxX) / 2,
        y: (bounds.minY + bounds.maxY) / 2,
    };
    const span =
        Math.hypot(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY) +
        step * 4;
    for (const angle of [angleDegrees, angleDegrees + 90]) {
        const radians = (Number(angle) * Math.PI) / 180;
        const dx = Math.cos(radians);
        const dy = Math.sin(radians);
        const nx = -dy;
        const ny = dx;
        const originAlongLine = origin.x * dx + origin.y * dy;
        const offsets = [
            bounds.minX * nx + bounds.minY * ny,
            bounds.maxX * nx + bounds.minY * ny,
            bounds.maxX * nx + bounds.maxY * ny,
            bounds.minX * nx + bounds.maxY * ny,
        ];
        for (
            let offset = Math.min(...offsets) - step;
            offset <= Math.max(...offsets) + step;
            offset += step
        ) {
            // Anchor every line at the selection centre, not world origin.
            // Without this term, a selection far from X0/Y0 loses a whole
            // perpendicular pass because the finite line span never reaches it.
            const center = {
                x: nx * offset + dx * originAlongLine,
                y: ny * offset + dy * originAlongLine,
            };
            const steps = Math.ceil(span / 0.35);
            let start = null;
            for (let i = 0; i < steps; i += 1) {
                const a = -span / 2 + (i / steps) * span;
                const b = -span / 2 + ((i + 1) / steps) * span;
                const mid = {
                    x: center.x + (dx * (a + b)) / 2,
                    y: center.y + (dy * (a + b)) / 2,
                };
                if (contains(mid)) {
                    if (!start)
                        start = { x: center.x + dx * a, y: center.y + dy * a };
                } else if (start) {
                    contours.push([
                        start,
                        { x: center.x + dx * a, y: center.y + dy * a },
                    ]);
                    start = null;
                }
                if (i === steps - 1 && start)
                    contours.push([
                        start,
                        { x: center.x + dx * b, y: center.y + dy * b },
                    ]);
            }
        }
    }
    return contours;
}
