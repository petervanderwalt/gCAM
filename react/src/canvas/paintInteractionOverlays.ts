/**
 * Purpose: Implementation module for paintInteractionOverlays in the react domain.
 */
import {
    arcPoints3,
    cubicBezierPoints,
    draftPoints,
    type DrawTool,
    type Draft,
} from '../draw/geometry';
import { dogboneCorner, filletCorner } from '../lib/corners';
import type { TransformMode } from '../lib/transform';
import type { Guide } from '../lib/guides';
import {
    applyDragPreview,
    selectionFrame,
    snapDrawPoint,
    type CornerHover,
    type TransformDragState,
} from './selectionGeometry';
import { strokePoints } from './primitives';
import { paintTransformOverlay } from './transformOverlay';
import { DARK_CANVAS_THEME, LIGHT_CANVAS_THEME } from './theme';
import type { Camera, ViewLoop } from './types';

type Point = { x: number; y: number };

interface PaintInteractionOverlaysOptions {
    ctx: CanvasRenderingContext2D;
    loops: ViewLoop[];
    selected: string[];
    hidden: string[];
    darkMode: boolean;
    camera: Camera;
    trimHover: { loopId: string; segmentIndex: number } | null;
    cornerTool: 'fillet' | 'dogbone' | null;
    cornerHover: CornerHover | null;
    cornerRadius: number;
    transformMode: TransformMode | null;
    transformDrag: TransformDragState | null;
    clicks: Point[];
    cursor: Point | null;
    drawTool: DrawTool;
    draft?: Draft | null;
    drawSides?: number;
    polygonMode?: 'inscribed' | 'circumscribed';
    grid: {
        visible: boolean;
        spacingMm: number;
        snap: boolean;
        style: 'lines' | 'dots';
    };
    guides: Guide[];
}

/** Paints transient interaction feedback after the persistent scene frame. */
export function paintInteractionOverlays(
    options: PaintInteractionOverlaysOptions,
) {
    paintTrimHover(options);
    paintCornerHover(options);
    paintTransformHandles(options);
    paintClickChain(options);
    paintBezierPreview(options);
    paintSnapMarker(options);
}

/** Selection-adjacent feedback: trim target, corner preview and transform handles. */
export function paintSelectionFeedback(
    options: PaintInteractionOverlaysOptions,
) {
    paintTrimHover(options);
    paintCornerHover(options);
    paintTransformHandles(options);
}

/** Draft draw chain, bezier construction and endpoint snap feedback. */
export function paintDrawingFeedback(options: PaintInteractionOverlaysOptions) {
    paintShapeDraft(options);
    paintClickChain(options);
    paintBezierPreview(options);
    paintSnapMarker(options);
}

function paintShapeDraft({
    ctx,
    camera,
    darkMode,
    drawTool,
    draft,
    drawSides,
    polygonMode,
    grid,
}: PaintInteractionOverlaysOptions) {
    if (
        !draft ||
        !drawTool ||
        !['line', 'rectangle', 'circle', 'polygon'].includes(drawTool)
    )
        return;
    const points = draftPoints(
        drawTool,
        draft,
        drawSides,
        grid.snap ? grid.spacingMm : null,
        polygonMode,
    );
    if (!points || points.length < 2) return;
    const screen = points.map((point) => toScreen(camera, point));
    ctx.save();
    ctx.strokeStyle = (darkMode ? DARK_CANVAS_THEME : LIGHT_CANVAS_THEME).chain;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(screen[0].x, screen[0].y);
    for (const point of screen.slice(1)) ctx.lineTo(point.x, point.y);
    if (drawTool !== 'line') ctx.closePath();
    ctx.stroke();
    ctx.restore();
}

function toScreen(camera: Camera, point: Point) {
    return {
        x: camera.tx + point.x * camera.scale,
        y: camera.ty - point.y * camera.scale,
    };
}

function paintTrimHover({
    ctx,
    loops,
    darkMode,
    camera,
    trimHover,
}: PaintInteractionOverlaysOptions) {
    if (!trimHover) return;
    const loop = loops.find((item) => item.id === trimHover.loopId);
    const a = loop?.points[trimHover.segmentIndex];
    const b = loop?.points[trimHover.segmentIndex + 1];
    if (!a || !b) return;
    const start = toScreen(camera, a);
    const end = toScreen(camera, b);
    ctx.save();
    ctx.strokeStyle = darkMode ? '#fbbf24' : '#dc2626';
    ctx.lineWidth = Math.max(4, 3 * camera.scale);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
    ctx.restore();
}

function paintCornerHover({
    ctx,
    loops,
    darkMode,
    camera,
    cornerTool,
    cornerHover,
    cornerRadius,
}: PaintInteractionOverlaysOptions) {
    if (!cornerTool || !cornerHover) return;
    const loop = loops.find((item) => item.id === cornerHover.loopId);
    const preview = loop
        ? cornerTool === 'dogbone'
            ? dogboneCorner(loop.points, cornerHover.index, cornerRadius)
            : filletCorner(loop.points, cornerHover.index, cornerRadius)
        : null;
    if (!preview?.length) return;
    ctx.save();
    ctx.strokeStyle = darkMode ? '#fbbf24' : '#f05a28';
    ctx.fillStyle = darkMode
        ? 'rgba(251,191,36,0.18)'
        : 'rgba(255,190,72,0.34)';
    ctx.lineWidth = 3;
    ctx.setLineDash(cornerTool === 'dogbone' ? [] : [6, 4]);
    if (cornerTool === 'dogbone') {
        const center = preview.reduce(
            (sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }),
            { x: 0, y: 0 },
        );
        center.x /= preview.length;
        center.y /= preview.length;
        const radius = Math.hypot(
            preview[0].x - center.x,
            preview[0].y - center.y,
        );
        const screenCenter = toScreen(camera, center);
        ctx.beginPath();
        ctx.arc(
            screenCenter.x,
            screenCenter.y,
            radius * camera.scale,
            0,
            Math.PI * 2,
        );
        ctx.fill();
        ctx.stroke();
    } else {
        strokePoints(ctx, preview, (x, y) => toScreen(camera, { x, y }));
    }
    ctx.setLineDash([]);
    const point = toScreen(camera, cornerHover.point);
    ctx.beginPath();
    ctx.arc(point.x, point.y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
}

function paintTransformHandles({
    ctx,
    loops,
    selected,
    hidden,
    camera,
    transformMode,
    transformDrag,
}: PaintInteractionOverlaysOptions) {
    if (!transformMode) return;
    const frame = selectionFrame(loops, selected, hidden);
    if (!frame) return;
    paintTransformOverlay(
        ctx,
        (x, y) => toScreen(camera, { x, y }),
        frame,
        transformMode,
        transformDrag
            ? applyDragPreview(transformDrag.orig, transformDrag)
            : null,
    );
}

function paintClickChain({
    ctx,
    camera,
    darkMode,
    clicks,
    cursor,
    drawTool,
}: PaintInteractionOverlaysOptions) {
    if (!clicks.length) return;
    const color = darkMode ? DARK_CANVAS_THEME.chain : LIGHT_CANVAS_THEME.chain;
    if (drawTool === 'arc' && clicks.length >= 2 && cursor) {
        const arc = arcPoints3(clicks[0], cursor, clicks[1]);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        if (arc) strokePoints(ctx, arc, (x, y) => toScreen(camera, { x, y }));
        const start = toScreen(camera, clicks[0]);
        const end = toScreen(camera, clicks[1]);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = color;
        for (const point of clicks) {
            const screen = toScreen(camera, point);
            ctx.fillRect(screen.x - 2.5, screen.y - 2.5, 5, 5);
        }
        return;
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    clicks.forEach((point, index) => {
        const screen = toScreen(camera, point);
        if (index === 0) ctx.moveTo(screen.x, screen.y);
        else ctx.lineTo(screen.x, screen.y);
    });
    if (cursor) {
        const start = toScreen(camera, clicks[clicks.length - 1]);
        const end = toScreen(camera, cursor);
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = color;
    for (const point of clicks) {
        const screen = toScreen(camera, point);
        ctx.fillRect(screen.x - 2.5, screen.y - 2.5, 5, 5);
    }
}

function paintBezierPreview({
    ctx,
    camera,
    darkMode,
    clicks,
    cursor,
    drawTool,
}: PaintInteractionOverlaysOptions) {
    if (drawTool !== 'bezier' || !clicks.length || !cursor) return;
    const control = [...clicks, cursor];
    const points =
        control.length >= 4
            ? cubicBezierPoints(control[0], control[1], control[2], control[3])
            : control.length === 3
              ? cubicBezierPoints(
                    control[0],
                    control[1],
                    control[2],
                    control[2],
                )
              : control.length === 2
                ? cubicBezierPoints(
                      control[0],
                      control[1],
                      control[1],
                      control[1],
                  )
                : [control[0], control[1]];
    ctx.save();
    ctx.strokeStyle = darkMode
        ? DARK_CANVAS_THEME.draft
        : LIGHT_CANVAS_THEME.draft;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    strokePoints(ctx, points, (x, y) => toScreen(camera, { x, y }));
    ctx.restore();
}

function paintSnapMarker({
    ctx,
    loops,
    hidden,
    darkMode,
    camera,
    cursor,
    drawTool,
    grid,
    guides,
}: PaintInteractionOverlaysOptions) {
    if (!drawTool || !cursor) return;
    const snapped = snapDrawPoint(
        loops,
        hidden,
        cursor,
        camera.scale,
        grid,
        guides,
    );
    if (snapped.x === cursor.x && snapped.y === cursor.y) return;
    const point = toScreen(camera, snapped);
    ctx.save();
    ctx.strokeStyle = darkMode ? '#60a5fa' : '#2563eb';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(point.x, point.y, 6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(point.x - 9, point.y);
    ctx.lineTo(point.x + 9, point.y);
    ctx.moveTo(point.x, point.y - 9);
    ctx.lineTo(point.x, point.y + 9);
    ctx.stroke();
    ctx.restore();
}
