/**
 * Purpose: Implementation module for transformInteraction in the react domain.
 */
import type { TransformMode } from '../lib/transform';
import {
    hitTransformTarget,
    selectionFrame,
    type TransformDragState,
} from './selectionGeometry';
import type { CanvasCamera } from './camera';

type Point = { x: number; y: number };
type TransformLoop = { id: string; points: Point[] };

export function beginTransformDrag(input: {
    mode: TransformMode;
    loops: TransformLoop[];
    selected: string[];
    hidden: string[];
    camera: CanvasCamera;
    screen: Point;
}): { drag: TransformDragState; cursor: string } | null {
    const { mode, loops, selected, hidden, camera, screen } = input;
    const world = {
        x: (screen.x - camera.tx) / camera.scale,
        y: (camera.ty - screen.y) / camera.scale,
    };
    const frame = selectionFrame(loops, selected, hidden);
    if (!frame) return null;
    const hit = hitTransformTarget(
        mode,
        frame,
        (x, y) => ({
            x: camera.tx + x * camera.scale,
            y: camera.ty - y * camera.scale,
        }),
        screen.x,
        screen.y,
        world,
        loops,
        selected,
        hidden,
        camera.scale,
    );
    if (!hit) return null;
    const hiddenIds = new Set(hidden);
    const byId = new Map(loops.map((loop) => [loop.id, loop]));
    const orig = selected.flatMap((id) => {
        const loop = byId.get(id);
        return loop && !hiddenIds.has(id)
            ? [{ id, points: loop.points.map((point) => ({ ...point })) }]
            : [];
    });
    if (!orig.length) return null;
    const center = {
        x: (frame.minX + frame.maxX) / 2,
        y: (frame.minY + frame.maxY) / 2,
    };
    const oppositeCorners: Record<string, Point> = {
        nw: { x: frame.maxX, y: frame.minY },
        ne: { x: frame.minX, y: frame.minY },
        se: { x: frame.minX, y: frame.maxY },
        sw: { x: frame.maxX, y: frame.maxY },
    };
    return {
        cursor: hit.cursor,
        drag: {
            mode: hit.kind,
            startWorld: world,
            orig,
            center,
            anchor: oppositeCorners[hit.key] ?? center,
            moved: false,
            dx: 0,
            dy: 0,
            deg: 0,
            factor: 1,
        },
    };
}
