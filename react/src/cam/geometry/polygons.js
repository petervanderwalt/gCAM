/**
 * Purpose: Implementation module for polygons in the cam domain.
 */
import '../../engine/clipper-shim.js';
import { CLIPPER_SCALE } from '../../engine/constants.js';
import { closePoints, clonePoint } from '../../geometry/primitives.js';
import { polygonArea } from '../../geometry/bounds.js';

export function clipperPathFromPoints(points) {
    const path = points.slice(0, -1).map((point) => ({
        X: Math.round(point.x * CLIPPER_SCALE),
        Y: Math.round(point.y * CLIPPER_SCALE),
    }));
    return ClipperLib.JS.Clean(path, 2);
}

export function pointsFromClipperPath(path) {
    const points = path.map((point) => ({
        x: point.X / CLIPPER_SCALE,
        y: point.Y / CLIPPER_SCALE,
    }));
    return closePoints(points);
}

export function ensurePositiveOrientation(points) {
    return polygonArea(points) < 0
        ? closePoints(points.slice(0, -1).reverse())
        : points;
}

export function ensureNegativeOrientation(points) {
    return polygonArea(points) > 0
        ? closePoints(points.slice(0, -1).reverse())
        : points;
}

export function pointInPolygon(point, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
        const xi = polygon[i].x;
        const yi = polygon[i].y;
        const xj = polygon[j].x;
        const yj = polygon[j].y;
        const intersects =
            yi > point.y !== yj > point.y &&
            point.x < ((xj - xi) * (point.y - yi)) / (yj - yi || 1e-12) + xi;
        if (intersects) {
            inside = !inside;
        }
    }
    return inside;
}

export function polygonCentroid(points) {
    let signedArea = 0;
    let cx = 0;
    let cy = 0;
    for (let i = 0; i < points.length - 1; i += 1) {
        const a = points[i];
        const b = points[i + 1];
        const cross = a.x * b.y - b.x * a.y;
        signedArea += cross;
        cx += (a.x + b.x) * cross;
        cy += (a.y + b.y) * cross;
    }

    if (Math.abs(signedArea) < 1e-9) {
        return clonePoint(points[0]);
    }

    const scale = 1 / (3 * signedArea);
    return { x: cx * scale, y: cy * scale };
}

export function compositePocketSeedPaths(selectedLoops) {
    const records = selectedLoops.map((loop) => ({
        loop,
        points: closePoints(loop.points),
        area: Math.abs(polygonArea(loop.points)),
    }));

    records.sort((a, b) => b.area - a.area);
    for (const record of records) {
        const sample = polygonCentroid(record.points);
        record.depth = records.reduce((depth, candidate) => {
            if (candidate === record || candidate.area <= record.area)
                return depth;
            return pointInPolygon(sample, candidate.points) ? depth + 1 : depth;
        }, 0);
    }

    const orientedPaths = records.map((record) =>
        record.depth % 2 === 0
            ? ensurePositiveOrientation(record.points)
            : ensureNegativeOrientation(record.points),
    );
    const clipper = new ClipperLib.Clipper();
    clipper.AddPaths(
        orientedPaths.map(clipperPathFromPoints),
        ClipperLib.PolyType.ptSubject,
        true,
    );
    const solution = new ClipperLib.Paths();
    clipper.Execute(
        ClipperLib.ClipType.ctUnion,
        solution,
        ClipperLib.PolyFillType.pftNonZero,
        ClipperLib.PolyFillType.pftNonZero,
    );
    return solution
        .map(pointsFromClipperPath)
        .filter((points) => Math.abs(polygonArea(points)) > 1);
}

export function offsetCompositePolygons(paths, delta) {
    if (!paths.length) return [];
    const offsetter = new ClipperLib.ClipperOffset(2, 0.25 * CLIPPER_SCALE);
    offsetter.AddPaths(
        paths.map(clipperPathFromPoints),
        ClipperLib.JoinType.jtRound,
        ClipperLib.EndType.etClosedPolygon,
    );
    const solution = new ClipperLib.Paths();
    offsetter.Execute(solution, delta * CLIPPER_SCALE);
    return solution
        .map(pointsFromClipperPath)
        .filter((points) => Math.abs(polygonArea(points)) > 1);
}

export function booleanPolygons(selectedLoops, operation = 'union') {
    const records = selectedLoops
        .filter((loop) => loop?.closed !== false && loop?.points?.length >= 4)
        .map((loop) => ({
            points: closePoints(loop.points),
            area: Math.abs(polygonArea(loop.points)),
        }))
        .filter((record) => record.area > 1e-6);
    if (records.length < 2) return [];

    // Boolean inputs represent selected filled vectors. Do not infer holes from
    // centroid nesting: overlapping shapes can have their centroid inside a peer.
    const paths = records.map((record) =>
        clipperPathFromPoints(ensurePositiveOrientation(record.points)),
    );
    const fill = ClipperLib.PolyFillType.pftNonZero;
    const execute = (clipType, subject, clip = []) => {
        const clipper = new ClipperLib.Clipper();
        clipper.AddPaths(subject, ClipperLib.PolyType.ptSubject, true);
        if (clip.length)
            clipper.AddPaths(clip, ClipperLib.PolyType.ptClip, true);
        const solution = new ClipperLib.Paths();
        clipper.Execute(clipType, solution, fill, fill);
        return solution;
    };

    let solution;
    if (operation === 'difference') {
        solution = execute(
            ClipperLib.ClipType.ctDifference,
            [paths[0]],
            paths.slice(1),
        );
    } else if (operation === 'intersection') {
        solution = [paths[0]];
        for (const path of paths.slice(1)) {
            solution = execute(ClipperLib.ClipType.ctIntersection, solution, [
                path,
            ]);
            if (!solution.length) break;
        }
    } else if (operation === 'xor') {
        solution = [paths[0]];
        for (const path of paths.slice(1)) {
            solution = execute(ClipperLib.ClipType.ctXor, solution, [path]);
        }
    } else {
        solution = execute(ClipperLib.ClipType.ctUnion, paths);
    }
    return solution
        .map(pointsFromClipperPath)
        .filter((points) => Math.abs(polygonArea(points)) > 1e-6);
}
