import {
    arcPoints3,
    cubicBezierPoints,
    draftPoints,
} from '../../draw/geometry';
import { snapDrawPoint } from '../selectionGeometry';
import { worldAtEvent } from './helpers';
import type {
    CanvasMouseEvent,
    CanvasPointerControllerProps,
    Point,
} from './types';

const CLICK_TO_DRAW = new Set(['line', 'rectangle', 'polygon', 'circle']);
const CHAIN_TO_DRAW = new Set(['arc', 'bezier', 'polyline']);

function snapped(
    event: CanvasMouseEvent,
    deps: CanvasPointerControllerProps,
): Point | null {
    const canvas = deps.canvasRef.current;
    if (!canvas) return null;
    const view = deps.viewRef.current;
    return snapDrawPoint(
        view.loops,
        view.hidden,
        worldAtEvent(event, canvas, deps.cameraRef.current),
        deps.cameraRef.current.scale,
        view.grid,
        view.guides,
    );
}

export function updateDrawDraft(
    event: CanvasMouseEvent,
    deps: CanvasPointerControllerProps,
): boolean {
    const tool = deps.viewRef.current.drawTool;
    if (!tool || tool === 'text') return false;
    if (
        CLICK_TO_DRAW.has(tool) &&
        deps.pendingAnchorRef.current &&
        event.buttons !== 1
    ) {
        const point = snapped(event, deps);
        const anchor = deps.pendingAnchorRef.current;
        if (point && anchor)
            deps.draftRef.current = {
                ax: anchor.x,
                ay: anchor.y,
                bx: point.x,
                by: point.y,
            };
        deps.forceTick();
        return true;
    }
    const down = deps.downRef.current;
    if (!down || event.buttons !== 1) return false;
    const canvas = deps.canvasRef.current;
    if (!canvas) return false;
    const rect = canvas.getBoundingClientRect();
    const camera = deps.cameraRef.current;
    deps.draftRef.current = {
        ax: (down.x - rect.left - camera.tx) / camera.scale,
        ay: (camera.ty - (down.y - rect.top)) / camera.scale,
        bx: (event.clientX - rect.left - camera.tx) / camera.scale,
        by: (camera.ty - (event.clientY - rect.top)) / camera.scale,
    };
    deps.forceTick();
    return true;
}

export function updateChainCursor(
    event: CanvasMouseEvent,
    deps: CanvasPointerControllerProps,
): boolean {
    const tool = deps.viewRef.current.drawTool;
    if (!tool || !CHAIN_TO_DRAW.has(tool) || !deps.clicksRef.current.length)
        return false;
    deps.updateCursor(event);
    deps.forceTick();
    return true;
}

export function finishDraw(
    event: CanvasMouseEvent,
    deps: CanvasPointerControllerProps,
    down: Point | null,
    marquee: unknown,
): boolean {
    const tool = deps.viewRef.current.drawTool;
    if (
        !tool ||
        !down ||
        marquee ||
        Math.hypot(event.clientX - down.x, event.clientY - down.y) >= 4
    )
        return false;
    if (tool === 'text') {
        const point = snapped(event, deps);
        if (point) deps.onCommitText(point);
        deps.forceTick();
        return true;
    }
    if (CHAIN_TO_DRAW.has(tool)) {
        const point = snapped(event, deps);
        if (point) {
            const chain = [...deps.clicksRef.current, point];
            deps.clicksRef.current = chain;
            if (tool === 'arc' && chain.length >= 3) {
                const arc = arcPoints3(chain[0], chain[1], chain[2]);
                deps.clicksRef.current = [];
                if (arc) deps.onCommitLoop(arc);
            }
            if (tool === 'bezier' && chain.length >= 4) {
                deps.clicksRef.current = [];
                deps.onCommitLoop(
                    cubicBezierPoints(chain[0], chain[1], chain[2], chain[3]),
                );
            }
        }
        deps.forceTick();
        return true;
    }
    if (!CLICK_TO_DRAW.has(tool)) return false;
    const point = snapped(event, deps);
    if (point) {
        const anchor = deps.pendingAnchorRef.current;
        if (!anchor) {
            deps.pendingAnchorRef.current = point;
            deps.draftRef.current = {
                ax: point.x,
                ay: point.y,
                bx: point.x,
                by: point.y,
            };
        } else {
            const view = deps.viewRef.current;
            const points = draftPoints(
                tool,
                { ax: anchor.x, ay: anchor.y, bx: point.x, by: point.y },
                view.drawSides,
                view.grid.snap ? view.grid.spacingMm : null,
                view.polygonMode,
            );
            deps.pendingAnchorRef.current = null;
            deps.draftRef.current = null;
            if (points && points.length >= 2) {
                const radius = Math.hypot(
                    point.x - anchor.x,
                    point.y - anchor.y,
                );
                deps.onCommitLoop(points, {
                    sourceType: tool,
                    ...(tool === 'circle' ? { radius } : {}),
                    ...(tool === 'polygon'
                        ? {
                              radius,
                              sides: Math.round(view.drawSides),
                              polygonMode: view.polygonMode,
                          }
                        : {}),
                });
            }
        }
    }
    deps.forceTick();
    return true;
}

export function clearDraggedDraft(deps: CanvasPointerControllerProps): boolean {
    const tool = deps.viewRef.current.drawTool;
    if (!tool || !CLICK_TO_DRAW.has(tool)) return false;
    const anchor = deps.pendingAnchorRef.current;
    deps.draftRef.current = anchor
        ? { ax: anchor.x, ay: anchor.y, bx: anchor.x, by: anchor.y }
        : null;
    deps.forceTick();
    return true;
}
