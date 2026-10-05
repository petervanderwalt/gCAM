/**
 * Purpose: Implementation module for selectionGeometry in the canvas domain.
 */
import { nearestPointOnPolyline } from '../cam/cam-ops.js';
import { snapToEndpoints } from '../draw/geometry';
import { snapToGuides, type Guide } from '../lib/guides';
import {
    rotatePoints,
    scalePoints,
    translatePoints,
    type TransformMode,
} from '../lib/transform';

export interface CanvasLoopGeometry {
    id: string;
    points: { x: number; y: number }[];
    bitmapId?: string;
}

export interface SelectionFrame {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
}

export interface TransformDragState {
    mode: 'move' | 'scale' | 'rotate';
    startWorld: { x: number; y: number };
    orig: { id: string; points: { x: number; y: number }[] }[];
    center: { x: number; y: number };
    anchor: { x: number; y: number };
    moved: boolean;
    dx: number;
    dy: number;
    deg: number;
    factor: number;
}

export interface CornerHover {
    loopId: string;
    index: number;
    point: { x: number; y: number };
}

export function findFilletCorner(
    loops: CanvasLoopGeometry[],
    selected: string[],
    hidden: string[],
    world: { x: number; y: number },
    scale: number,
): CornerHover | null {
    const allowed = selected.length ? new Set(selected) : null;
    const tolerance = 10 / Math.max(scale, 0.01);
    let best: (CornerHover & { distance: number }) | null = null;
    for (const loop of loops) {
        if (
            hidden.includes(loop.id) ||
            loop.bitmapId ||
            (allowed && !allowed.has(loop.id))
        )
            continue;
        const lastPoint = loop.points[loop.points.length - 1];
        const closed =
            loop.points.length > 1 &&
            loop.points[0].x === lastPoint.x &&
            loop.points[0].y === lastPoint.y;
        const first = closed ? 0 : 1;
        for (let index = first; index <= loop.points.length - 2; index += 1) {
            const point = loop.points[index];
            const distance = Math.hypot(point.x - world.x, point.y - world.y);
            if (distance <= tolerance && (!best || distance < best.distance)) {
                best = { loopId: loop.id, index, point, distance };
            }
        }
    }
    return best;
}

export function selectionFrame(
    loops: CanvasLoopGeometry[],
    selected: string[],
    hidden: string[],
): SelectionFrame | null {
    const hiddenIds = new Set(hidden);
    const points = loops
        .filter((loop) => selected.includes(loop.id) && !hiddenIds.has(loop.id))
        .flatMap((loop) => loop.points);
    if (!points.length) return null;
    return {
        minX: Math.min(...points.map((point) => point.x)),
        minY: Math.min(...points.map((point) => point.y)),
        maxX: Math.max(...points.map((point) => point.x)),
        maxY: Math.max(...points.map((point) => point.y)),
    };
}

export function applyDragPreview(
    original: TransformDragState['orig'],
    drag: TransformDragState,
): { x: number; y: number }[][] {
    return original.map((loop) => {
        if (drag.mode === 'move')
            return translatePoints(loop.points, drag.dx, drag.dy);
        if (drag.mode === 'rotate')
            return rotatePoints(loop.points, drag.deg, drag.center);
        return scalePoints(loop.points, drag.factor, drag.anchor);
    });
}

export function snapDrawPoint(
    loops: CanvasLoopGeometry[],
    hidden: string[],
    world: { x: number; y: number },
    scale: number,
    grid: { snap: boolean; spacingMm: number } | null = null,
    guides: Guide[] = [],
): { x: number; y: number } {
    const hiddenIds = new Set(hidden);
    const endpoint = snapToEndpoints(
        loops.filter(
            (loop) => !hiddenIds.has(loop.id) && loop.points.length >= 2,
        ),
        world,
        10 / scale,
    );
    if (endpoint !== world) return endpoint;
    const tolerance = 12 / Math.max(scale, 0.01);
    if (Math.hypot(world.x, world.y) <= tolerance) return { x: 0, y: 0 };
    const guideSnap = snapToGuides(world, guides, tolerance);
    if (guideSnap.x !== world.x || guideSnap.y !== world.y) return guideSnap;
    if (grid?.snap && grid.spacingMm > 0) {
        return {
            x: Math.round(world.x / grid.spacingMm) * grid.spacingMm,
            y: Math.round(world.y / grid.spacingMm) * grid.spacingMm,
        };
    }
    return world;
}

export function hitTransformTarget(
    mode: TransformMode,
    frame: SelectionFrame,
    toScreen: (x: number, y: number) => { x: number; y: number },
    sx: number,
    sy: number,
    world: { x: number; y: number },
    loops: CanvasLoopGeometry[],
    selected: string[],
    hidden: string[],
    scale: number,
): { kind: 'move' | 'scale' | 'rotate'; key: string; cursor: string } | null {
    const nw = toScreen(frame.minX, frame.maxY);
    const ne = toScreen(frame.maxX, frame.maxY);
    const se = toScreen(frame.maxX, frame.minY);
    const sw = toScreen(frame.minX, frame.minY);
    const cx = (nw.x + se.x) / 2;
    const cy = (nw.y + se.y) / 2;
    if (mode === 'scale') {
        for (const [key, point] of [
            ['nw', nw],
            ['ne', ne],
            ['se', se],
            ['sw', sw],
        ] as const) {
            if (Math.hypot(sx - point.x, sy - point.y) <= 10) {
                return {
                    kind: 'scale',
                    key,
                    cursor:
                        key === 'ne' || key === 'sw'
                            ? 'nesw-resize'
                            : 'nwse-resize',
                };
            }
        }
        return null;
    }
    if (mode === 'rotate') {
        for (const point of [nw, ne, se, sw]) {
            const dx = point.x - cx;
            const dy = point.y - cy;
            const length = Math.hypot(dx, dy) || 1;
            if (
                Math.hypot(
                    sx - (point.x + (dx / length) * 18),
                    sy - (point.y + (dy / length) * 18),
                ) <= 10
            )
                return { kind: 'rotate', key: '', cursor: 'grab' };
        }
        return null;
    }
    if (
        sx >= Math.min(nw.x, se.x) - 2 &&
        sx <= Math.max(nw.x, se.x) + 2 &&
        sy >= Math.min(nw.y, se.y) - 2 &&
        sy <= Math.max(nw.y, se.y) + 2
    )
        return { kind: 'move', key: '', cursor: 'move' };
    const hiddenIds = new Set(hidden);
    for (const loop of loops) {
        if (
            !selected.includes(loop.id) ||
            hiddenIds.has(loop.id) ||
            loop.points.length < 2
        )
            continue;
        const nearest = nearestPointOnPolyline(loop.points, world);
        if (nearest && nearest.distance <= 12 / scale)
            return { kind: 'move', key: '', cursor: 'move' };
    }
    return null;
}
