/**
 * Purpose: Implementation module for texturePreview in the react domain.
 */
import '../engine/clipper-shim.js';
import { CLIPPER_SCALE } from '../engine/constants.js';
import { polygonArea } from '../geometry/bounds.js';
import { closePoints } from '../geometry/primitives.js';

function clipperPathFromPoints(points) {
    return ClipperLib.JS.Clean(
        points.slice(0, -1).map((point) => ({
            X: Math.round(point.x * CLIPPER_SCALE),
            Y: Math.round(point.y * CLIPPER_SCALE),
        })),
        2,
    );
}

function pointsFromClipperPath(path) {
    return closePoints(
        path.map((point) => ({
            x: point.X / CLIPPER_SCALE,
            y: point.Y / CLIPPER_SCALE,
        })),
    );
}

/** Clips generated texture cells to the selected vector region. */
export function clipVoronoiCellToSelection(cell, selection) {
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
