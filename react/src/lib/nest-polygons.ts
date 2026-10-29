/** Integer polygon geometry used by the nesting search. Millimetres in/out. */
import ClipperLib from '../engine/clipper-shim.js';
import type { NestUnit } from './nest';
import { rotateNestPoint } from './nest-mask';

export type IntPath = { X: number; Y: number }[];
export const NEST_SCALE = 10000;
const C = ClipperLib;

export function clipNest(
    subject: IntPath[],
    clips: IntPath[],
    operation: number,
): IntPath[] {
    const engine = new C.Clipper();
    engine.AddPaths(subject, C.PolyType.ptSubject, true);
    if (clips.length) engine.AddPaths(clips, C.PolyType.ptClip, true);
    const result: IntPath[] = [];
    if (
        !engine.Execute(
            operation,
            result,
            C.PolyFillType.pftNonZero,
            C.PolyFillType.pftNonZero,
        )
    )
        throw Error('Nesting polygon operation failed');
    return result;
}
export const nestUnion = (paths: IntPath[]) =>
    clipNest(paths, [], C.ClipType.ctUnion);
export const nestDifference = (a: IntPath[], b: IntPath[]) =>
    clipNest(a, b, C.ClipType.ctDifference);
export function offsetNest(paths: IntPath[], distance: number): IntPath[] {
    if (!distance) return paths;
    const offset = new C.ClipperOffset(2, 0.005 * NEST_SCALE);
    offset.AddPaths(paths, C.JoinType.jtRound, C.EndType.etClosedPolygon);
    const result: IntPath[] = [];
    offset.Execute(result, distance * NEST_SCALE);
    return result;
}
export const translateNest = (paths: IntPath[], x: number, y: number) =>
    paths.map((path) => path.map((p) => ({ X: p.X + x, Y: p.Y + y })));
export function nestIntersects(a: IntPath[], b: IntPath[]): boolean {
    return clipNest(a, b, C.ClipType.ctIntersection).some(
        (path) => Math.abs(C.Clipper.Area(path)) > 1,
    );
}

export interface PolygonVariant {
    key: string;
    turns: number;
    paths: IntPath[];
    packing: IntPath[];
    width: number;
    height: number;
    offsetX: number;
    offsetY: number;
    envelope: number;
}
export function polygonVariant(
    unit: NestUnit,
    index: number,
    turns: number,
    gap: number,
): PolygonVariant {
    const rotated = unit.loops.map((loop) =>
        loop.points.map((p) =>
            rotateNestPoint(
                p.x - unit.minX,
                p.y - unit.minY,
                unit.width,
                unit.height,
                turns,
            ),
        ),
    );
    const bounds = rotated.flat().reduce(
        (b, p) => ({
            minX: Math.min(b.minX, p.x),
            minY: Math.min(b.minY, p.y),
            maxX: Math.max(b.maxX, p.x),
            maxY: Math.max(b.maxY, p.y),
        }),
        {
            minX: Infinity,
            minY: Infinity,
            maxX: -Infinity,
            maxY: -Infinity,
        },
    );
    const rings = rotated.map((points) => {
        const path = points.map((p) => ({
            X: Math.round((p.x - bounds.minX) * NEST_SCALE),
            Y: Math.round((p.y - bounds.minY) * NEST_SCALE),
        }));
        // Reserve letter interiors; never treat a counter as a loose part or available stock.
        if (!C.Clipper.Orientation(path)) path.reverse();
        return path;
    });
    const solid = nestUnion(rings);
    if (!solid.length)
        throw Error('Nesting requires closed shapes with an area.');
    const envelope = unit.envelope ?? 0;
    const buffer = gap / 2 + envelope;
    const paths = offsetNest(solid, buffer + (buffer > 0 ? 0.01 : 0));
    // Simplification proposes placements only; acceptance checks the unsimplified clearance polygons.
    const cleaned = solid
        .map((path) => C.Clipper.CleanPolygon(path, 0.03 * NEST_SCALE))
        .filter((path: IntPath) => path.length >= 3);
    const expanded = offsetNest(
        cleaned.length ? nestUnion(cleaned) : solid,
        gap / 2 + envelope + 0.15,
    );
    const packing = nestUnion(
        expanded
            .map((path) => C.Clipper.CleanPolygon(path, 0.1 * NEST_SCALE))
            .filter((path: IntPath) => path.length >= 3),
    );
    return {
        key: `${index}:${turns}`,
        turns,
        paths,
        packing,
        width: bounds.maxX - bounds.minX,
        height: bounds.maxY - bounds.minY,
        offsetX: bounds.minX,
        offsetY: bounds.minY,
        envelope,
    };
}

/** A + (-B) describes forbidden translations of moving B around stationary A. */
export function noFitPolygons(a: PolygonVariant, b: PolygonVariant): IntPath[] {
    const sums: IntPath[] = [];
    for (const stationary of a.packing)
        for (const moving of b.packing) {
            const reflected = moving.map((p) => ({ X: -p.X, Y: -p.Y }));
            const paths = C.Clipper.MinkowskiSum(
                reflected,
                stationary,
                true,
            ) as IntPath[];
            // Minkowski sums of boundary paths may contain a spurious inner ring: reserve it conservatively.
            sums.push(...paths.filter((path) => C.Clipper.Orientation(path)));
        }
    return nestUnion(sums);
}
