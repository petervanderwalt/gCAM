import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
    getMinimumTabWidth,
    getTabCenterlineSpan,
    nearestPointOnPolyline,
} from '../engine/cam-ops.js';
import { boundsOfPoints, pointAtDistance, polylineLength } from '../engine/paths.js';
import {
    arcPoints3,
    cubicBezierPoints,
    draftPoints,
    rulerStep,
    snapToEndpoints,
    type DrawTool,
} from '../lib/draw';
import {
    rotatePoints,
    scalePoints,
    translatePoints,
    type TransformCommit,
    type TransformMode,
} from '../lib/transform';
import { trimNearestSegment } from '../lib/trim';
import { dogboneCorner, filletCorner } from '../lib/corners';
import { displayValue, lengthUnit, MM_PER_INCH, type UnitSystem } from '../lib/units';

type Tool = 'select' | 'draw' | 'trim' | 'preview';

interface TabMarker {
    entryId: string;
    tabIndex: number;
    contourIndex: number;
    along: number;
    previewIndex: number;
    x: number;
    y: number;
}

export interface ViewLoop {
    id: string;
    points: { x: number; y: number }[];
    bitmapId?: string;
    groupId?: string;
    sourceType?: string;
    radius?: number;
    sides?: number;
    polygonMode?: 'inscribed' | 'circumscribed';
    text?: string;
    fontId?: string;
    fontSize?: number;
    exportGeometry?: { type?: string };
}

export interface ViewBounds {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
}

interface Camera {
    scale: number;
    tx: number;
    ty: number;
}

interface CanvasTheme {
    bg: string;
    grid: string;
    rulerBg: string;
    rulerTick: string;
    rulerTickMinor: string;
    rulerLabel: string;
    rulerEdge: string;
    vector: string;
    selected: string;
    preview: string;
    draft: string;
    chain: string;
    tab: string;
    marqueeFill: string;
    marqueeStroke: string;
    originX: string;
    originY: string;
    originDot: string;
    originLabel: string;
    emptyText: string;
}

const DARK_THEME: CanvasTheme = {
    bg: '#0b1220',
    grid: 'rgba(104,154,201,0.18)',
    rulerBg: 'rgba(11,18,32,0.9)',
    rulerTick: 'rgba(148,163,184,0.76)',
    rulerTickMinor: 'rgba(148,163,184,0.4)',
    rulerLabel: 'rgba(148,163,184,0.9)',
    rulerEdge: 'rgba(148,163,184,0.25)',
    vector: '#f8fafc',
    selected: '#60a5fa',
    preview: '#f5b942',
    draft: '#dc3545',
    chain: '#ffffff',
    tab: '#f5b942',
    marqueeFill: 'rgba(96,165,250,0.12)',
    marqueeStroke: 'rgba(96,165,250,0.9)',
    originX: '#bf605a',
    originY: '#3a8872',
    originDot: '#315d73',
    originLabel: '#9fb3c8',
    emptyText: 'rgba(148,163,184,0.9)',
};

const LIGHT_THEME: CanvasTheme = {
    bg: '#f8fafc',
    grid: 'rgba(100,116,139,0.28)',
    rulerBg: 'rgba(241,245,249,0.95)',
    rulerTick: 'rgba(100,116,139,0.8)',
    rulerTickMinor: 'rgba(100,116,139,0.45)',
    rulerLabel: 'rgba(71,85,105,0.95)',
    rulerEdge: 'rgba(100,116,139,0.35)',
    vector: '#111827',
    selected: '#2563eb',
    preview: '#d97706',
    draft: '#dc2626',
    chain: '#0f172a',
    tab: '#d97706',
    marqueeFill: 'rgba(37,99,235,0.12)',
    marqueeStroke: 'rgba(37,99,235,0.9)',
    originX: '#bf605a',
    originY: '#3a8872',
    originDot: '#315d73',
    originLabel: '#475569',
    emptyText: 'rgba(100,116,139,0.9)',
};

/**
 * 2D canvas: fitted vector view with wheel-zoom, drag-pan (middle/right
 * button or Alt+left) and fit/zoom controls. Vectors green, toolpath
 * preview amber. Full CanvasView scene (rulers, snap, overlays) ports here.
 */
export interface PreviewLoop {
    points: { x: number; y: number }[];
    entryId: string;
    tabEligible?: boolean;
    tabWidth?: number;
    toolDiameter?: number;
}

interface TabHoverCandidate {
    entryId: string;
    previewIndex: number;
    contourIndex: number;
    along: number;
    start: { x: number; y: number };
    end: { x: number; y: number };
    center: { x: number; y: number };
    spine: { x: number; y: number }[];
    toolDiameter: number;
}

export interface LoopMeta {
    sourceType?: string;
    radius?: number;
    sides?: number;
    polygonMode?: 'inscribed' | 'circumscribed';
}

export type { DrawTool };

/** Live direct-manipulation drag state (camcanvas geometryTransform). */
interface TransformDragState {
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

interface SelectionFrame {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
}

interface CornerHover {
    loopId: string;
    index: number;
    point: { x: number; y: number };
}

function findFilletCorner(
    loops: ViewLoop[],
    selected: string[],
    hidden: string[],
    world: { x: number; y: number },
    scale: number,
): CornerHover | null {
    const allowed = selected.length ? new Set(selected) : null;
    const tolerance = 10 / Math.max(scale, 0.01);
    let best: (CornerHover & { distance: number }) | null = null;
    for (const loop of loops) {
        if (hidden.includes(loop.id) || loop.bitmapId || (allowed && !allowed.has(loop.id))) continue;
        const closed = loop.points.length > 1 && loop.points[0].x === loop.points[loop.points.length - 1].x && loop.points[0].y === loop.points[loop.points.length - 1].y;
        const first = closed ? 0 : 1;
        const last = closed ? loop.points.length - 2 : loop.points.length - 2;
        for (let index = first; index <= last; index += 1) {
            const point = loop.points[index];
            const distance = Math.hypot(point.x - world.x, point.y - world.y);
            if (distance <= tolerance && (!best || distance < best.distance)) {
                best = { loopId: loop.id, index, point, distance };
            }
        }
    }
    return best;
}

/** Axis-aligned bbox of the visible selection, or null when empty. */
function selectionFrame(
    loops: ViewLoop[],
    selected: string[],
    hidden: string[],
): SelectionFrame | null {
    const hide = new Set(hidden);
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let found = false;
    for (const loop of loops) {
        if (!selected.includes(loop.id) || hide.has(loop.id)) continue;
        for (const p of loop.points) {
            found = true;
            if (p.x < minX) minX = p.x;
            if (p.y < minY) minY = p.y;
            if (p.x > maxX) maxX = p.x;
            if (p.y > maxY) maxY = p.y;
        }
    }
    return found ? { minX, minY, maxX, maxY } : null;
}

/** Apply live drag params to loop points for overlay preview. */
function applyDragPreview(
    orig: { id: string; points: { x: number; y: number }[] }[],
    drag: TransformDragState,
): { x: number; y: number }[][] {
    return orig.map((loop) => {
        if (drag.mode === 'move')
            return translatePoints(loop.points, drag.dx, drag.dy);
        if (drag.mode === 'rotate')
            return rotatePoints(loop.points, drag.deg, drag.center);
        return scalePoints(loop.points, drag.factor, drag.anchor);
    });
}

/** Magnetic endpoint snap for draw clicks (camcanvas snap-to-geometry). */
function snapDrawPoint(
    loops: ViewLoop[],
    hidden: string[],
    world: { x: number; y: number },
    scale: number,
    grid: { snap: boolean; spacingMm: number } | null = null,
    guides: { axis: 'x' | 'y'; pos: number }[] = [],
): { x: number; y: number } {
    const hide = new Set(hidden);
    const endpoint = snapToEndpoints(
        loops.filter((l) => !hide.has(l.id) && l.points.length >= 2),
        world,
        10 / scale,
    );
    if (endpoint !== world) return endpoint;

    const tolerance = 12 / Math.max(scale, 0.01);
    let x = world.x;
    let y = world.y;
    let snapped = false;
    if (Math.hypot(world.x, world.y) <= tolerance) return { x: 0, y: 0 };
    for (const guide of guides) {
        if (guide.axis === 'x' && Math.abs(world.x - guide.pos) <= tolerance) {
            x = guide.pos;
            snapped = true;
        }
        if (guide.axis === 'y' && Math.abs(world.y - guide.pos) <= tolerance) {
            y = guide.pos;
            snapped = true;
        }
    }
    if (snapped) return { x, y };
    if (grid?.snap && grid.spacingMm > 0) {
        return {
            x: Math.round(world.x / grid.spacingMm) * grid.spacingMm,
            y: Math.round(world.y / grid.spacingMm) * grid.spacingMm,
        };
    }
    return world;
}

/** Hit-test the transform overlay (screen space, camcanvas parity). */
function hitTransformTarget(
    mode: TransformMode,
    frame: SelectionFrame,
    toScreen: (x: number, y: number) => { x: number; y: number },
    sx: number,
    sy: number,
    world: { x: number; y: number },
    loops: ViewLoop[],
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
        const corners: [string, { x: number; y: number }][] = [
            ['nw', nw],
            ['ne', ne],
            ['se', se],
            ['sw', sw],
        ];
        for (const [key, c] of corners) {
            if (Math.hypot(sx - c.x, sy - c.y) <= 10) {
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
        for (const c of [nw, ne, se, sw]) {
            const dx = c.x - cx;
            const dy = c.y - cy;
            const len = Math.hypot(dx, dy) || 1;
            const hx = c.x + (dx / len) * 18;
            const hy = c.y + (dy / len) * 18;
            if (Math.hypot(sx - hx, sy - hy) <= 10) {
                return { kind: 'rotate', key: '', cursor: 'grab' };
            }
        }
        return null;
    }
    const pad = 2;
    const x0 = Math.min(nw.x, se.x) - pad;
    const x1 = Math.max(nw.x, se.x) + pad;
    const y0 = Math.min(nw.y, se.y) - pad;
    const y1 = Math.max(nw.y, se.y) + pad;
    if (sx >= x0 && sx <= x1 && sy >= y0 && sy <= y1) {
        return { kind: 'move', key: '', cursor: 'move' };
    }
    const hide = new Set(hidden);
    const tol = 12 / scale;
    for (const loop of loops) {
        if (
            !selected.includes(loop.id) ||
            hide.has(loop.id) ||
            !Array.isArray(loop.points) ||
            loop.points.length < 2
        )
            continue;
        let hit: { distance: number } | null = null;
        try {
            hit = nearestPointOnPolyline(loop.points, world);
        } catch {
            continue;
        }
        if (hit && hit.distance <= tol) {
            return { kind: 'move', key: '', cursor: 'move' };
        }
    }
    return null;
}

/** Paint the selection frame + handles + live preview (camcanvas overlay). */
function paintTransformOverlay(
    ctx: CanvasRenderingContext2D,
    toScreen: (x: number, y: number) => { x: number; y: number },
    frame: SelectionFrame,
    mode: 'move' | 'scale' | 'rotate',
    preview: { x: number; y: number }[][] | null,
) {
    const nw = toScreen(frame.minX, frame.maxY);
    const ne = toScreen(frame.maxX, frame.maxY);
    const se = toScreen(frame.maxX, frame.minY);
    const sw = toScreen(frame.minX, frame.minY);
    const center = toScreen(
        (frame.minX + frame.maxX) / 2,
        (frame.minY + frame.maxY) / 2,
    );
    ctx.save();
    // Live geometry preview while dragging.
    if (preview) {
        ctx.strokeStyle = '#2563eb';
        ctx.lineWidth = 2;
        for (const points of preview) {
            strokePoints(ctx, points, toScreen);
        }
    }
    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(nw.x, nw.y);
    ctx.lineTo(ne.x, ne.y);
    ctx.lineTo(se.x, se.y);
    ctx.lineTo(sw.x, sw.y);
    ctx.closePath();
    ctx.stroke();
    ctx.setLineDash([]);
    if (mode === 'scale') {
        for (const c of [nw, ne, se, sw]) {
            ctx.fillStyle = '#ffffff';
            ctx.strokeStyle = '#2563eb';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.rect(c.x - 5, c.y - 5, 10, 10);
            ctx.fill();
            ctx.stroke();
        }
    }
    if (mode === 'rotate') {
        for (const c of [nw, ne, se, sw]) {
            const dx = c.x - center.x;
            const dy = c.y - center.y;
            const len = Math.hypot(dx, dy) || 1;
            const hx = c.x + (dx / len) * 18;
            const hy = c.y + (dy / len) * 18;
            ctx.strokeStyle = 'rgba(37, 99, 235, 0.45)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(c.x, c.y);
            ctx.lineTo(hx, hy);
            ctx.stroke();
            ctx.fillStyle = '#eff6ff';
            ctx.strokeStyle = '#2563eb';
            ctx.beginPath();
            ctx.arc(hx, hy, 6, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
        }
    }
    ctx.restore();
}

export function CanvasStage({
    activeTool,
    loops,
    bounds,
    preview,
    draftPreview,
    inspectorPreview,
    draftProgress,
    darkMode,
    selected,
    hidden,
    onSelect,
    tabMode,
    tabMarkers,
    onPlaceTab,
    onMoveTab,
    onDeleteTab,
    drawTool,
    drawSides,
    polygonMode,
    grid,
    guides,
    guidePlacement = null,
    onPlaceGuide = () => {},
    onCancelGuide = () => {},
    bitmaps,
    onCommitLoop,
    onTrimAt,
    onTrimStroke,
    onCommitText,
    transformMode,
    onTransformCommit,
    cornerTool,
    cornerRadius,
    onFilletCorner,
    preserveViewToken,
    viewportCommand,
    units = 'metric',
}: {
    activeTool: Tool;
    loops: ViewLoop[];
    bounds: ViewBounds | null;
    preview: PreviewLoop[];
    draftPreview: { x: number; y: number }[][];
    inspectorPreview?: { id: string; points: { x: number; y: number }[] } | null;
    draftProgress: { percent: number; label: string } | null;
    darkMode: boolean;
    selected: string[];
    hidden: string[];
    onSelect: (ids: string[]) => void;
    tabMode: boolean;
    tabMarkers: TabMarker[];
    onPlaceTab: (entryId: string, contourIndex: number, along: number) => void;
    onMoveTab: (entryId: string, tabIndex: number, along: number) => void;
    onDeleteTab: (entryId: string, tabIndex: number) => void;
    drawTool: DrawTool;
    drawSides: number;
    polygonMode: 'inscribed' | 'circumscribed';
    grid: { visible: boolean; spacingMm: number; snap: boolean; style: 'lines' | 'dots' };
    guides: { id: string; axis: 'x' | 'y'; pos: number }[];
    guidePlacement?: 'x' | 'y' | null;
    onPlaceGuide?: (axis: 'x' | 'y', position: number) => void;
    onCancelGuide?: () => void;
    bitmaps: {
        id: string;
        x: number;
        y: number;
        w: number;
        h: number;
        rotation?: number;
        img?: HTMLImageElement;
    }[];
    onCommitLoop: (points: { x: number; y: number }[], meta?: LoopMeta) => void;
    onTrimAt?: (point: { x: number; y: number }) => void;
    onTrimStroke?: (points: { x: number; y: number }[]) => void;
    onCommitText: (at: { x: number; y: number }) => void;
    transformMode: TransformMode | null;
    onTransformCommit: (t: TransformCommit | null) => void;
    cornerTool?: 'fillet' | 'dogbone' | null;
    cornerRadius?: number;
    onFilletCorner?: (loopId: string, cornerIndex: number) => void;
    preserveViewToken?: number;
    viewportCommand?: { type: 'fit' | 'zoomIn' | 'zoomOut'; token: number };
    units?: UnitSystem;
}) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const topRulerRef = useRef<HTMLCanvasElement>(null);
    const leftRulerRef = useRef<HTMLCanvasElement>(null);
    const cameraRef = useRef<Camera>({ scale: 1, tx: 0, ty: 0 });
    const panRef = useRef<{ x: number; y: number } | null>(null);
    const downRef = useRef<{ x: number; y: number } | null>(null);
    const marqueeRef = useRef<{
        x0: number;
        y0: number;
        x1: number;
        y1: number;
    } | null>(null);
    const draftRef = useRef<{
        ax: number;
        ay: number;
        bx: number;
        by: number;
    } | null>(null);
    const clicksRef = useRef<{ x: number; y: number }[]>([]);
    const cursorRef = useRef<{ x: number; y: number } | null>(null);
    const progressPointerRef = useRef<{ x: number; y: number } | null>(null);

    useEffect(() => {
        const move = (event: PointerEvent) => {
            progressPointerRef.current = {
                x: event.clientX,
                y: event.clientY,
            };
            // Repaint while a worker is running so the badge follows the
            // pointer even when the worker has not emitted its next update.
            setTick((n) => n + 1);
        };
        window.addEventListener('pointermove', move);
        return () => window.removeEventListener('pointermove', move);
    }, []);
    const trimHoverRef = useRef<{
        loopId: string;
        segmentIndex: number;
    } | null>(null);
    const trimBrushRef = useRef<{ points: { x: number; y: number }[] } | null>(null);
    const tabDragRef = useRef<{
        marker: TabMarker;
        along: number;
        moved: boolean;
    } | null>(null);
    const selectedTabRef = useRef<TabMarker | null>(null);
    const tabHoverRef = useRef<TabHoverCandidate | null>(null);
    // Click-click drawing anchor (first click for line/rect/polygon/circle).
    const pendingAnchorRef = useRef<{ x: number; y: number } | null>(null);
    // Live direct-manipulation transform drag (move/scale/rotate).
    const transformDragRef = useRef<TransformDragState | null>(null);
    const cornerHoverRef = useRef<CornerHover | null>(null);
    // Center-on-origin once for the empty canvas; imports fit instead.
    const centeredRef = useRef(false);
    const preserveViewTokenRef = useRef(preserveViewToken ?? 0);
    const viewRef = useRef<{
        loops: ViewLoop[];
        bounds: ViewBounds | null;
        preview: PreviewLoop[];
        draftPreview: { x: number; y: number }[][];
        inspectorPreview: { id: string; points: { x: number; y: number }[] } | null;
        darkMode: boolean;
        activeTool: Tool;
        selected: string[];
        hidden: string[];
        tabMode: boolean;
        tabMarkers: TabMarker[];
        tabHover: TabHoverCandidate | null;
        drawTool: DrawTool;
        drawSides: number;
        polygonMode: 'inscribed' | 'circumscribed';
        grid: { visible: boolean; spacingMm: number; snap: boolean; style: 'lines' | 'dots' };
        guides: { id: string; axis: 'x' | 'y'; pos: number }[];
        guidePlacement: 'x' | 'y' | null;
        transformMode: TransformMode | null;
        cornerTool: 'fillet' | 'dogbone' | null;
        cornerRadius: number;
        units: UnitSystem;
        bitmaps: {
            id: string;
            x: number;
            y: number;
            w: number;
            h: number;
            rotation?: number;
            img?: HTMLImageElement;
        }[];
    }>({
        loops,
        bounds,
        preview,
        draftPreview,
        inspectorPreview: inspectorPreview ?? null,
        darkMode,
        activeTool,
        selected,
        hidden,
        tabMode,
        tabMarkers,
        tabHover: tabHoverRef.current,
        drawTool,
        drawSides,
        polygonMode,
        grid,
        guides,
        guidePlacement,
        transformMode,
        cornerTool: cornerTool ?? null,
        cornerRadius: cornerRadius ?? 3,
        units,
        bitmaps,
    });
    viewRef.current = {
        loops,
        bounds,
        preview,
        draftPreview,
        inspectorPreview: inspectorPreview ?? null,
        darkMode,
        activeTool,
        selected,
        hidden,
        tabMode,
        tabMarkers,
        tabHover: tabHoverRef.current,
        drawTool,
        drawSides,
        polygonMode,
        grid,
        guides,
        guidePlacement,
        transformMode,
        cornerTool: cornerTool ?? null,
        cornerRadius: cornerRadius ?? 3,
        units,
        bitmaps,
    };
    // Imperative canvas draws need a re-render trigger for camera changes.
    const [, setTick] = useState(0);
    const forceTick = () => setTick((n) => n + 1);
    // Latest frame renderer, invoked after every React render so canvas
    // state (loops, selection, preview, camera) always repaints.
    const renderRef = useRef<() => void>(() => {});

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Attach wheel listener with passive: false to allow preventDefault()
        const handleWheel = (e: WheelEvent) => {
            e.preventDefault();
            const rect = canvas.getBoundingClientRect();
            zoomBy(
                Math.exp(-e.deltaY * 0.002),
                e.clientX - rect.left,
                e.clientY - rect.top,
            );
        };
        canvas.addEventListener('wheel', handleWheel, { passive: false });
        const cleanupWheel = () =>
            canvas.removeEventListener('wheel', handleWheel);

        // External coordinate rulers (camcanvas top/left ruler canvases).
        const paintRulers = () => {
            const theme = viewRef.current.darkMode ? DARK_THEME : LIGHT_THEME;
            const cam = cameraRef.current;
            const unitScale = viewRef.current.units === 'imperial' ? MM_PER_INCH : 1;
            const major = rulerStep(cam.scale * unitScale) * unitScale;
            const minor = major / 5;
            const top = topRulerRef.current;
            if (top) {
                const r = top.getBoundingClientRect();
                top.width = Math.max(1, Math.floor(r.width));
                top.height = RULER;
                const tctx = top.getContext('2d');
                if (tctx) {
                    tctx.fillStyle = theme.rulerBg;
                    tctx.fillRect(0, 0, top.width, top.height);
                    rulerTicks(
                        tctx,
                        cam,
                        'x',
                        top.width,
                        top.height,
                        minor,
                        major,
                        theme,
                        0,
                        viewRef.current.units,
                    );
                    tctx.strokeStyle = theme.rulerEdge;
                    tctx.lineWidth = 1;
                    tctx.beginPath();
                    tctx.moveTo(0, top.height - 0.5);
                    tctx.lineTo(top.width, top.height - 0.5);
                    tctx.stroke();
                }
            }
            const left = leftRulerRef.current;
            if (left) {
                const r = left.getBoundingClientRect();
                left.width = RULER;
                left.height = Math.max(1, Math.floor(r.height));
                const lctx = left.getContext('2d');
                if (lctx) {
                    lctx.fillStyle = theme.rulerBg;
                    lctx.fillRect(0, 0, left.width, left.height);
                    rulerTicks(
                        lctx,
                        cam,
                        'y',
                        left.width,
                        left.height,
                        minor,
                        major,
                        theme,
                        0,
                        viewRef.current.units,
                    );
                    lctx.strokeStyle = theme.rulerEdge;
                    lctx.lineWidth = 1;
                    lctx.beginPath();
                    lctx.moveTo(left.width - 0.5, 0);
                    lctx.lineTo(left.width - 0.5, left.height);
                    lctx.stroke();
                }
            }
        };

        const render = () => {
            const {
                loops,
                bounds,
                preview,
                draftPreview,
                inspectorPreview,
                darkMode,
                selected,
                hidden,
                tabMarkers,
                tabHover,
                grid,
                bitmaps,
                guides,
                guidePlacement,
            } = viewRef.current;
            const rect = canvas.parentElement?.getBoundingClientRect();
            if (!rect) return;
            canvas.width = Math.max(1, Math.floor(rect.width));
            canvas.height = Math.max(1, Math.floor(rect.height));
            if (!bounds && !centeredRef.current) {
                // Empty workspace: origin at canvas center, 1 unit = 1px.
                cameraRef.current = {
                    scale: 1,
                    tx: canvas.width / 2,
                    ty: canvas.height / 2,
                };
                centeredRef.current = true;
            }
            if (bounds && cameraRef.current.scale === 1) {
                cameraRef.current = fitCamera(
                    bounds,
                    canvas.width,
                    canvas.height,
                );
            }
            draw(
                ctx,
                canvas.width,
                canvas.height,
                loops,
                bounds,
                preview,
                draftPreview,
                inspectorPreview,
                darkMode ? DARK_THEME : LIGHT_THEME,
                selected,
                hidden,
                tabMarkers,
                tabHover,
                tabDragRef.current,
                selectedTabRef.current,
                cameraRef.current,
                marqueeRef.current,
                draftPoints(
                    viewRef.current.drawTool,
                    draftRef.current,
                    viewRef.current.drawSides,
                    viewRef.current.grid.snap
                        ? viewRef.current.grid.spacingMm
                        : null,
                    viewRef.current.polygonMode,
                ),
                grid,
                bitmaps,
                guides,
                guidePlacement,
                cursorRef.current,
            );
            // Trim preview: show the exact segment that a click would remove.
            const trimHover = trimHoverRef.current;
            if (viewRef.current.activeTool === 'trim' && trimHover) {
                const loop = loops.find((item) => item.id === trimHover.loopId);
                const a = loop?.points[trimHover.segmentIndex];
                const b = loop?.points[trimHover.segmentIndex + 1];
                if (a && b) {
                    const toScreen = (x: number, y: number) => ({
                        x: cameraRef.current.tx + x * cameraRef.current.scale,
                        y: cameraRef.current.ty - y * cameraRef.current.scale,
                    });
                    const sa = toScreen(a.x, a.y);
                    const sb = toScreen(b.x, b.y);
                    ctx.save();
                    ctx.strokeStyle = darkMode ? '#fbbf24' : '#dc2626';
                    ctx.lineWidth = Math.max(4, 3 * cameraRef.current.scale);
                    ctx.lineCap = 'round';
                    ctx.beginPath();
                    ctx.moveTo(sa.x, sa.y);
                    ctx.lineTo(sb.x, sb.y);
                    ctx.stroke();
                    ctx.restore();
                }
            }
            const cornerHover = cornerHoverRef.current;
            if (viewRef.current.cornerTool && cornerHover) {
                const loop = loops.find((item) => item.id === cornerHover.loopId);
                const previewPoints = loop
                    ? viewRef.current.cornerTool === 'dogbone'
                        ? dogboneCorner(loop.points, cornerHover.index, viewRef.current.cornerRadius)
                        : filletCorner(loop.points, cornerHover.index, viewRef.current.cornerRadius)
                    : null;
                if (previewPoints) {
                    const toScreen = (x: number, y: number) => ({
                        x: cameraRef.current.tx + x * cameraRef.current.scale,
                        y: cameraRef.current.ty - y * cameraRef.current.scale,
                    });
                    ctx.save();
                    ctx.strokeStyle = darkMode ? '#fbbf24' : '#f05a28';
                    ctx.fillStyle = darkMode ? 'rgba(251,191,36,0.18)' : 'rgba(255,190,72,0.34)';
                    ctx.lineWidth = 3;
                    ctx.setLineDash(viewRef.current.cornerTool === 'dogbone' ? [] : [6, 4]);
                    if (viewRef.current.cornerTool === 'dogbone') {
                        const center = previewPoints.reduce((sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }), { x: 0, y: 0 });
                        center.x /= previewPoints.length;
                        center.y /= previewPoints.length;
                        const radius = Math.hypot(previewPoints[0].x - center.x, previewPoints[0].y - center.y);
                        const screenCenter = toScreen(center.x, center.y);
                        ctx.beginPath();
                        ctx.arc(screenCenter.x, screenCenter.y, radius * cameraRef.current.scale, 0, Math.PI * 2);
                        ctx.fill();
                        ctx.stroke();
                    } else {
                        strokePoints(ctx, previewPoints, toScreen);
                    }
                    ctx.setLineDash([]);
                    const point = toScreen(cornerHover.point.x, cornerHover.point.y);
                    ctx.beginPath();
                    ctx.arc(point.x, point.y, 5, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.stroke();
                    ctx.restore();
                }
            }
            paintRulers();
            // Direct-manipulation transform overlay (camcanvas parity).
            {
                const cam = cameraRef.current;
                const toScreen = (x: number, y: number) => ({
                    x: cam.tx + x * cam.scale,
                    y: cam.ty - y * cam.scale,
                });
                const mode = viewRef.current.transformMode;
                const drag = transformDragRef.current;
                if (mode) {
                    const frame = selectionFrame(loops, selected, hidden);
                    if (frame) {
                        paintTransformOverlay(
                            ctx,
                            toScreen,
                            frame,
                            mode,
                            drag ? applyDragPreview(drag.orig, drag) : null,
                        );
                    }
                }
            }
            // Arc/polyline click chain + rubber band.
            const chain = clicksRef.current;
            if (chain.length) {
                const cam = cameraRef.current;
                const chainColor = darkMode
                    ? DARK_THEME.chain
                    : LIGHT_THEME.chain;
                const toScreen = (x: number, y: number) => ({
                    x: cam.tx + x * cam.scale,
                    y: cam.ty - y * cam.scale,
                });
                ctx.strokeStyle = chainColor;
                ctx.lineWidth = 1.5;
                ctx.setLineDash([6, 4]);
                ctx.beginPath();
                chain.forEach((p, i) => {
                    const s = toScreen(p.x, p.y);
                    if (i === 0) ctx.moveTo(s.x, s.y);
                    else ctx.lineTo(s.x, s.y);
                });
                const cursor = cursorRef.current;
                if (cursor) {
                    const s = toScreen(cursor.x, cursor.y);
                    const last = chain[chain.length - 1];
                    const ls = toScreen(last.x, last.y);
                    ctx.moveTo(ls.x, ls.y);
                    ctx.lineTo(s.x, s.y);
                }
                ctx.stroke();
                ctx.setLineDash([]);
                ctx.fillStyle = chainColor;
                for (const p of chain) {
                    const s = toScreen(p.x, p.y);
                    ctx.fillRect(s.x - 2.5, s.y - 2.5, 5, 5);
                }
            }
            // Bezier construction preview: the original tool shows the curve
            // continuously while its four control clicks are being entered.
            if (viewRef.current.drawTool === 'bezier' && chain.length && cursorRef.current) {
                const control = [...chain, cursorRef.current];
                const points = control.length >= 4
                    ? cubicBezierPoints(control[0], control[1], control[2], control[3])
                    : control.length === 3
                      ? cubicBezierPoints(control[0], control[1], control[2], control[2])
                      : control.length === 2
                        ? cubicBezierPoints(control[0], control[1], control[1], control[1])
                        : [control[0], control[1]];
                ctx.save();
                ctx.strokeStyle = darkMode ? DARK_THEME.draft : LIGHT_THEME.draft;
                ctx.lineWidth = 1.5;
                ctx.setLineDash([6, 4]);
                strokePoints(ctx, points, (x, y) => ({
                    x: cameraRef.current.tx + x * cameraRef.current.scale,
                    y: cameraRef.current.ty - y * cameraRef.current.scale,
                }));
                ctx.restore();
            }
            // Endpoint snap marker while a draw tool is armed.
            if (viewRef.current.drawTool && cursorRef.current) {
                const markerCam = cameraRef.current;
                const cursor = cursorRef.current;
                const snapped = snapDrawPoint(
                    loops,
                    hidden,
                    cursor,
                    markerCam.scale,
                    viewRef.current.grid,
                    viewRef.current.guides,
                );
                if (snapped.x !== cursor.x || snapped.y !== cursor.y) {
                    const s = {
                        x: markerCam.tx + snapped.x * markerCam.scale,
                        y: markerCam.ty - snapped.y * markerCam.scale,
                    };
                    ctx.save();
                    ctx.strokeStyle = darkMode ? '#60a5fa' : '#2563eb';
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.arc(s.x, s.y, 6, 0, Math.PI * 2);
                    ctx.stroke();
                    ctx.beginPath();
                    ctx.moveTo(s.x - 9, s.y);
                    ctx.lineTo(s.x + 9, s.y);
                    ctx.moveTo(s.x, s.y - 9);
                    ctx.lineTo(s.x, s.y + 9);
                    ctx.stroke();
                    ctx.restore();
                }
            }
        };
        render();
        renderRef.current = render;
        const ro = new ResizeObserver(render);
        if (canvas.parentElement) ro.observe(canvas.parentElement);
        return () => {
            ro.disconnect();
            cleanupWheel();
            renderRef.current = () => {};
        };
    }, []);

    // Repaint after every render — viewRef is refreshed during render, so
    // the canvas always reflects current loops/selection/preview/camera.
    useEffect(() => {
        renderRef.current();
    });

    // Clear partial click chains when the draw tool changes.
    useEffect(() => {
        clicksRef.current = [];
        cursorRef.current = null;
        pendingAnchorRef.current = null;
        draftRef.current = null;
    }, [drawTool]);
    useEffect(() => {
        if (!tabMode) {
            tabHoverRef.current = null;
            const canvas = canvasRef.current;
            if (canvas) canvas.style.cursor = '';
            renderRef.current();
        }
    }, [tabMode]);
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !bounds) return;
        if (preserveViewTokenRef.current !== (preserveViewToken ?? 0)) {
            preserveViewTokenRef.current = preserveViewToken ?? 0;
            forceTick();
            return;
        }
        const rect = canvas.parentElement?.getBoundingClientRect();
        if (!rect) return;
        cameraRef.current = fitCamera(bounds, rect.width, rect.height);
        forceTick();
    }, [bounds, loops.length, preserveViewToken]);

    const updateCursor = (e: React.MouseEvent) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const cam = cameraRef.current;
        cursorRef.current = {
            x: (e.clientX - rect.left - cam.tx) / cam.scale,
            y: (cam.ty - (e.clientY - rect.top)) / cam.scale,
        };
    };

    const zoomBy = (factor: number, cx?: number, cy?: number) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const px = cx ?? rect.width / 2;
        const py = cy ?? rect.height / 2;
        const cam = cameraRef.current;
        const next = Math.min(500, Math.max(0.01, cam.scale * factor));
        // Keep the world point under the cursor fixed.
        const wx = (px - cam.tx) / cam.scale;
        const wy = (py - cam.ty) / cam.scale;
        cameraRef.current = {
            scale: next,
            tx: px - wx * next,
            ty: py - wy * next,
        };
        forceTick();
    };

    useEffect(() => {
        if (!viewportCommand) return;
        if (viewportCommand.type === 'zoomIn') {
            zoomBy(1.25);
            return;
        }
        if (viewportCommand.type === 'zoomOut') {
            zoomBy(0.8);
            return;
        }
        const canvas = canvasRef.current;
        const b = viewRef.current.bounds;
        const rect = canvas?.parentElement?.getBoundingClientRect();
        if (canvas && b && rect) {
            cameraRef.current = fitCamera(b, rect.width, rect.height);
            forceTick();
        }
        // token makes repeated commands observable even when type is unchanged.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [viewportCommand?.token]);

    // Progress pill position: pinned near the cursor (camcanvas parity).
    const camNow = cameraRef.current;
    const pillPos =
        draftProgress && progressPointerRef.current
            ? {
                  x: progressPointerRef.current.x + 16,
                  y: progressPointerRef.current.y + 18,
              }
            : null;
    const draftDimension = (() => {
        const draft = draftRef.current;
        if (!draft || !drawTool) return null;
        const dx = draft.bx - draft.ax;
        const dy = draft.by - draft.ay;
        const distance = Math.hypot(dx, dy);
        if (!(distance > 0.01)) return null;
        const label = drawTool === 'circle'
            ? `R ${displayValue(distance, units, 2)} ${lengthUnit(units)}`
            : `ΔX ${displayValue(dx, units, 2)}  ΔY ${displayValue(dy, units, 2)}  L ${displayValue(distance, units, 2)} ${lengthUnit(units)}`;
        const x = camNow.tx + draft.bx * camNow.scale + 16;
        const y = camNow.ty - draft.by * camNow.scale + 18;
        return { label, x, y };
    })();

    const chrome = darkMode
        ? 'bg-[#0b1220] border-robin-900'
        : 'bg-white border-slate-300';
    const chip = darkMode
        ? 'bg-dark/80 border-robin-900 text-slate-300'
        : 'bg-white/90 border-slate-300 text-slate-600';

    return (
        <div
            className={`h-full flex flex-col rounded border overflow-hidden ${chrome}`}
        >
            <div className="flex shrink-0">
                <div
                    aria-hidden="true"
                    style={{ width: RULER, height: RULER }}
                    className={
                        darkMode
                            ? 'bg-[#0b1220] border-b border-r border-robin-900'
                            : 'bg-slate-100 border-b border-r border-slate-300'
                    }
                />
                <canvas
                    ref={topRulerRef}
                    aria-hidden="true"
                    className="flex-1 block min-w-0"
                    style={{ height: RULER }}
                />
            </div>
            <div className="flex flex-1 min-h-0">
                <canvas
                    ref={leftRulerRef}
                    aria-hidden="true"
                    className="block shrink-0 self-stretch"
                    style={{ width: RULER }}
                />
                <div className="relative flex-1 min-w-0">
                    <CanvasViewport
                        canvasRef={canvasRef}
                        viewRef={viewRef}
                        clicksRef={clicksRef}
                        cursorRef={cursorRef}
                        draftRef={draftRef}
                        downRef={downRef}
                        panRef={panRef}
                        marqueeRef={marqueeRef}
                        cameraRef={cameraRef}
                        updateCursor={updateCursor}
                        zoomBy={zoomBy}
                        forceTick={forceTick}
                        onCommitLoop={onCommitLoop}
                        activeTool={activeTool}
                        onCommitText={onCommitText}
                        onSelect={onSelect}
                        onPlaceTab={onPlaceTab}
                        onMoveTab={onMoveTab}
                        onDeleteTab={onDeleteTab}
                        tabDragRef={tabDragRef}
                        selectedTabRef={selectedTabRef}
                        tabHoverRef={tabHoverRef}
                        progressPointerRef={progressPointerRef}
                        pendingAnchorRef={pendingAnchorRef}
                        transformDragRef={transformDragRef}
                        onTransformCommit={onTransformCommit}
                        onFilletCorner={onFilletCorner}
                        cornerHoverRef={cornerHoverRef}
                        onTrimAt={onTrimAt}
                        onTrimStroke={onTrimStroke}
                        trimBrushRef={trimBrushRef}
                        onTrimHover={(hover) => {
                            trimHoverRef.current = hover;
                            renderRef.current();
                        }}
                        onPlaceGuide={onPlaceGuide}
                        onCancelGuide={onCancelGuide}
                    />
                    {/* activeTool drives future selection/draw modes; canvas stays live. */}
                    <div
                        className={`absolute top-2 left-2 text-xs px-2 py-1 rounded border ${chip}`}
                    >
                        {loops.length
                            ? `${loops.length} vector${loops.length === 1 ? '' : 's'}`
                            : 'Drop DXF/SVG here or use Import'}
                    </div>
                    <CursorReadout
                        cursorRef={cursorRef}
                        darkMode={darkMode}
                        guidePlacement={guidePlacement}
                        units={units}
                    />
                    {draftProgress && createPortal(
                        <div
                            role="status"
                            className={`pointer-events-none fixed z-[100] flex items-center gap-2 text-xs px-2.5 py-1.5 rounded-lg border shadow-lg ${chip}`}
                            style={
                                pillPos
                                    ? {
                                          left: pillPos.x,
                                          top: pillPos.y,
                                      }
                                    : { left: '50%', top: 12 }
                            }
                        >
                            <span className="whitespace-nowrap">
                                {draftProgress.label}
                            </span>
                            <span className="tabular-nums font-medium">
                                {Math.round(
                                    Number.isFinite(draftProgress.percent)
                                        ? draftProgress.percent
                                        : 0,
                                )}%
                            </span>
                            <span
                                aria-hidden="true"
                                className="w-16 h-1.5 rounded-full bg-slate-500/30 overflow-hidden"
                            >
                                <span
                                    className="block h-full rounded-full bg-robin-500"
                                    style={{
                                        width: `${Math.min(100, Math.max(0, Number.isFinite(draftProgress.percent) ? draftProgress.percent : 0))}%`,
                                    }}
                                />
                            </span>
                        </div>,
                        document.body,
                    )}
                    {draftDimension && (
                        <div
                            role="status"
                            className={`pointer-events-none absolute z-10 rounded border px-2 py-1 text-[11px] tabular-nums shadow ${chip}`}
                            style={{ left: draftDimension.x, top: draftDimension.y }}
                        >
                            {draftDimension.label}
                        </div>
                    )}
                    <div className="absolute bottom-2 right-2 flex gap-1">
                        <ZoomButton
                            label="+"
                            onClick={() => zoomBy(1.25)}
                            darkMode={darkMode}
                        />
                        <ZoomButton
                            label="-"
                            onClick={() => zoomBy(0.8)}
                            darkMode={darkMode}
                        />
                        <ZoomButton
                            label="Fit"
                            onClick={() => {
                                const canvas = canvasRef.current;
                                const b = viewRef.current.bounds;
                                if (!canvas || !b) return;
                                const rect =
                                    canvas.parentElement?.getBoundingClientRect();
                                if (!rect) return;
                                cameraRef.current = fitCamera(
                                    b,
                                    rect.width,
                                    rect.height,
                                );
                                forceTick();
                            }}
                            darkMode={darkMode}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}

function CanvasViewport({
    canvasRef,
    viewRef,
    clicksRef,
    cursorRef,
    draftRef,
    downRef,
    panRef,
    marqueeRef,
    cameraRef,
    updateCursor,
    zoomBy,
    forceTick,
    onCommitLoop,
    activeTool,
    onTrimAt,
    onTrimStroke,
    trimBrushRef,
    onTrimHover,
    onPlaceGuide,
    onCancelGuide,
    onCommitText,
    onSelect,
    onPlaceTab,
    onMoveTab,
    onDeleteTab,
    tabHoverRef,
    tabDragRef,
    selectedTabRef,
    pendingAnchorRef,
    progressPointerRef,
    transformDragRef,
    onTransformCommit,
    onFilletCorner,
    cornerHoverRef,
}: {
    canvasRef: { current: HTMLCanvasElement | null };
    viewRef: {
        current: {
            loops: ViewLoop[];
            bounds: ViewBounds | null;
            preview: PreviewLoop[];
            draftPreview: { x: number; y: number }[][];
            darkMode: boolean;
            selected: string[];
            hidden: string[];
            tabMode: boolean;
            tabMarkers: TabMarker[];
            tabHover: TabHoverCandidate | null;
            drawTool: DrawTool;
            drawSides: number;
            polygonMode: 'inscribed' | 'circumscribed';
            grid: { visible: boolean; spacingMm: number; snap: boolean; style: 'lines' | 'dots' };
            guides: { id: string; axis: 'x' | 'y'; pos: number }[];
            guidePlacement: 'x' | 'y' | null;
            transformMode: TransformMode | null;
            cornerTool: 'fillet' | 'dogbone' | null;
            cornerRadius: number;
            bitmaps: {
                id: string;
                x: number;
                y: number;
                w: number;
                h: number;
                rotation?: number;
                img?: HTMLImageElement;
            }[];
        };
    };
    clicksRef: { current: { x: number; y: number }[] };
    cursorRef: { current: { x: number; y: number } | null };
    draftRef: {
        current: {
            ax: number;
            ay: number;
            bx: number;
            by: number;
        } | null;
    };
    downRef: { current: { x: number; y: number } | null };
    panRef: { current: { x: number; y: number } | null };
    marqueeRef: {
        current: {
            x0: number;
            y0: number;
            x1: number;
            y1: number;
        } | null;
    };
    cameraRef: { current: Camera };
    updateCursor: (e: React.MouseEvent) => void;
    zoomBy: (factor: number, cx?: number, cy?: number) => void;
    forceTick: () => void;
    onCommitLoop: (points: { x: number; y: number }[], meta?: LoopMeta) => void;
    activeTool: Tool;
    onTrimAt?: (point: { x: number; y: number }) => void;
    onTrimStroke?: (points: { x: number; y: number }[]) => void;
    trimBrushRef: { current: { points: { x: number; y: number }[] } | null };
    onTrimHover: (hover: { loopId: string; segmentIndex: number } | null) => void;
    onPlaceGuide: (axis: 'x' | 'y', position: number) => void;
    onCancelGuide: () => void;
    onCommitText: (at: { x: number; y: number }) => void;
    onSelect: (ids: string[]) => void;
    onPlaceTab: (entryId: string, contourIndex: number, along: number) => void;
    onMoveTab: (entryId: string, tabIndex: number, along: number) => void;
    onDeleteTab: (entryId: string, tabIndex: number) => void;
    tabHoverRef: { current: TabHoverCandidate | null };
    tabDragRef: { current: { marker: TabMarker; along: number; moved: boolean } | null };
    selectedTabRef: { current: TabMarker | null };
    progressPointerRef: { current: { x: number; y: number } | null };
    pendingAnchorRef: { current: { x: number; y: number } | null };
    transformDragRef: { current: TransformDragState | null };
    onTransformCommit: (t: TransformCommit | null) => void;
    onFilletCorner?: (loopId: string, cornerIndex: number) => void;
    cornerHoverRef: { current: CornerHover | null };
}) {
    void zoomBy;
    return (
        <canvas
            ref={canvasRef}
            className="w-full h-full block"
            data-testid="gcam-canvas"
            tabIndex={0}
            style={{ touchAction: 'none', userSelect: 'none' }}
            onKeyDown={(e) => {
                if ((e.key === 'Delete' || e.key === 'Backspace') && selectedTabRef.current) {
                    const marker = selectedTabRef.current;
                    selectedTabRef.current = null;
                    onDeleteTab(marker.entryId, marker.tabIndex);
                    e.preventDefault();
                    forceTick();
                    return;
                }
                if (e.key === 'Escape') {
                    if (viewRef.current.guidePlacement) onCancelGuide();
                    clicksRef.current = [];
                    cursorRef.current = null;
                    pendingAnchorRef.current = null;
                    draftRef.current = null;
                    if (
                        transformDragRef.current ||
                        viewRef.current.transformMode
                    ) {
                        transformDragRef.current = null;
                        onTransformCommit(null);
                    }
                    forceTick();
                    return;
                }
                if (viewRef.current.drawTool !== 'polyline') return;
                if (e.key === 'Enter') {
                    const chain = clicksRef.current;
                    if (chain.length >= 2) {
                        onCommitLoop([...chain]);
                    }
                    clicksRef.current = [];
                    cursorRef.current = null;
                    forceTick();
                }
            }}
            onDoubleClick={() => {
                if (viewRef.current.drawTool !== 'polyline') return;
                const chain = clicksRef.current;
                // The double-click itself recorded a duplicate point.
                const trimmed =
                    chain.length >= 2 &&
                    Math.hypot(
                        chain[chain.length - 1].x - chain[chain.length - 2].x,
                        chain[chain.length - 1].y - chain[chain.length - 2].y,
                    ) < 1
                        ? chain.slice(0, -1)
                        : chain;
                if (trimmed.length >= 2) {
                    onCommitLoop([...trimmed]);
                }
                clicksRef.current = [];
                cursorRef.current = null;
                forceTick();
            }}
            onMouseDown={(e) => {
                e.currentTarget.focus();
                downRef.current = { x: e.clientX, y: e.clientY };
                if (viewRef.current.cornerTool && e.button === 0) {
                    const canvas = canvasRef.current;
                    if (canvas) {
                        const rect = canvas.getBoundingClientRect();
                        const cam = cameraRef.current;
                        const world = {
                            x: (e.clientX - rect.left - cam.tx) / cam.scale,
                            y: (cam.ty - (e.clientY - rect.top)) / cam.scale,
                        };
                        const hover = findFilletCorner(viewRef.current.loops, viewRef.current.selected, viewRef.current.hidden, world, cam.scale);
                        if (hover) onFilletCorner?.(hover.loopId, hover.index);
                    }
                    e.preventDefault();
                    forceTick();
                    return;
                }
                const marker = viewRef.current.tabMarkers.find((m) => {
                    const canvas = canvasRef.current;
                    if (!canvas) return false;
                    const rect = canvas.getBoundingClientRect();
                    const cam = cameraRef.current;
                    const sx = cam.tx + m.x * cam.scale + rect.left;
                    const sy = cam.ty - m.y * cam.scale + rect.top;
                    return Math.hypot(e.clientX - sx, e.clientY - sy) <= 10;
                });
                if (marker && (e.button === 0 || e.button === 2)) {
                    selectedTabRef.current = marker;
                    if (e.button === 2) {
                        onDeleteTab(marker.entryId, marker.tabIndex);
                        selectedTabRef.current = null;
                    } else {
                        tabDragRef.current = { marker, along: marker.along, moved: false };
                    }
                    e.preventDefault();
                    forceTick();
                    return;
                }
                selectedTabRef.current = null;
                if (activeTool === 'trim' && e.button === 0 && e.ctrlKey) {
                    const canvas = canvasRef.current;
                    if (canvas) {
                        const rect = canvas.getBoundingClientRect();
                        const cam = cameraRef.current;
                        trimBrushRef.current = {
                            points: [{
                                x: (e.clientX - rect.left - cam.tx) / cam.scale,
                                y: (cam.ty - (e.clientY - rect.top)) / cam.scale,
                            }],
                        };
                        e.preventDefault();
                        forceTick();
                        return;
                    }
                }
                if (e.button === 1 || e.button === 2 || e.altKey) {
                    panRef.current = { x: e.clientX, y: e.clientY };
                    e.preventDefault();
                }
                // Direct-manipulation transform (camcanvas parity): grab a
                // handle or the selection frame to start a live drag.
                if (e.button === 0 && !e.altKey) {
                    const mode = viewRef.current.transformMode;
                    if (mode) {
                        const canvas = canvasRef.current;
                        if (canvas) {
                            const rect = canvas.getBoundingClientRect();
                            const cam = cameraRef.current;
                            const sx = e.clientX - rect.left;
                            const sy = e.clientY - rect.top;
                            const world = {
                                x: (sx - cam.tx) / cam.scale,
                                y: (cam.ty - sy) / cam.scale,
                            };
                            const { loops, selected, hidden } = viewRef.current;
                            const frame = selectionFrame(
                                loops,
                                selected,
                                hidden,
                            );
                            if (frame) {
                                const toScreen = (x: number, y: number) => ({
                                    x: cam.tx + x * cam.scale,
                                    y: cam.ty - y * cam.scale,
                                });
                                const hit = hitTransformTarget(
                                    mode,
                                    frame,
                                    toScreen,
                                    sx,
                                    sy,
                                    world,
                                    loops,
                                    selected,
                                    hidden,
                                    cam.scale,
                                );
                                if (hit) {
                                    const hide = new Set(hidden);
                                    const byId = new Map(
                                        loops.map((l) => [l.id, l]),
                                    );
                                    const orig = selected.flatMap((id) => {
                                        const loop = byId.get(id);
                                        return loop && !hide.has(id)
                                            ? [
                                                  {
                                                      id,
                                                      points: loop.points.map(
                                                          (p) => ({ ...p }),
                                                      ),
                                                  },
                                              ]
                                            : [];
                                    });
                                    if (orig.length) {
                                        const center = {
                                            x: (frame.minX + frame.maxX) / 2,
                                            y: (frame.minY + frame.maxY) / 2,
                                        };
                                        const opposites: Record<
                                            string,
                                            { x: number; y: number }
                                        > = {
                                            nw: {
                                                x: frame.maxX,
                                                y: frame.minY,
                                            },
                                            ne: {
                                                x: frame.minX,
                                                y: frame.minY,
                                            },
                                            se: {
                                                x: frame.minX,
                                                y: frame.maxY,
                                            },
                                            sw: {
                                                x: frame.maxX,
                                                y: frame.maxY,
                                            },
                                        };
                                        transformDragRef.current = {
                                            mode: hit.kind,
                                            startWorld: world,
                                            orig,
                                            center,
                                            anchor:
                                                opposites[hit.key] ?? center,
                                            moved: false,
                                            dx: 0,
                                            dy: 0,
                                            deg: 0,
                                            factor: 1,
                                        };
                                        try {
                                            const withPointer =
                                                e as unknown as {
                                                    pointerId?: number;
                                                };
                                            if (
                                                typeof withPointer.pointerId ===
                                                'number'
                                            ) {
                                                e.currentTarget.setPointerCapture(
                                                    withPointer.pointerId,
                                                );
                                            }
                                        } catch {
                                            /* ignore */
                                        }
                                        (
                                            e.currentTarget as HTMLCanvasElement
                                        ).style.cursor = hit.cursor;
                                        e.preventDefault();
                                        forceTick();
                                        return;
                                    }
                                }
                            }
                        }
                    }
                }
            }}
            onMouseMove={(e) => {
                progressPointerRef.current = {
                    x: e.clientX,
                    y: e.clientY,
                };
                if (tabDragRef.current) {
                    const canvas = canvasRef.current;
                    const contour = viewRef.current.preview[tabDragRef.current.marker.previewIndex]?.points;
                    if (canvas && contour && contour.length >= 2) {
                        const rect = canvas.getBoundingClientRect();
                        const cam = cameraRef.current;
                        const world = {
                            x: (e.clientX - rect.left - cam.tx) / cam.scale,
                            y: (cam.ty - (e.clientY - rect.top)) / cam.scale,
                        };
                        const hit = nearestPointOnPolyline(contour, world);
                        if (hit) {
                            tabDragRef.current.along = hit.along;
                            if (Math.hypot(e.movementX, e.movementY) > 1) {
                                tabDragRef.current.moved = true;
                            }
                            canvas.style.cursor = 'grabbing';
                            forceTick();
                        }
                    }
                    return;
                }
                if (trimBrushRef.current) {
                    const canvas = canvasRef.current;
                    if (canvas) {
                        const rect = canvas.getBoundingClientRect();
                        const cam = cameraRef.current;
                        const point = {
                            x: (e.clientX - rect.left - cam.tx) / cam.scale,
                            y: (cam.ty - (e.clientY - rect.top)) / cam.scale,
                        };
                        const points = trimBrushRef.current.points;
                        const last = points[points.length - 1];
                        if (!last || Math.hypot(point.x - last.x, point.y - last.y) > 1) {
                            points.push(point);
                            forceTick();
                        }
                    }
                    return;
                }
                // Live transform drag takes precedence over pan/select.
                const drag = transformDragRef.current;
                if (drag) {
                    const canvas = canvasRef.current;
                    if (!canvas) return;
                    const rect = canvas.getBoundingClientRect();
                    const cam = cameraRef.current;
                    const world = {
                        x: (e.clientX - rect.left - cam.tx) / cam.scale,
                        y: (cam.ty - (e.clientY - rect.top)) / cam.scale,
                    };
                    if (
                        Math.hypot(
                            e.clientX -
                                (drag.startWorld.x * cam.scale + cam.tx),
                            e.clientY -
                                (cam.ty - drag.startWorld.y * cam.scale),
                        ) > 2
                    ) {
                        drag.moved = true;
                    }
                    if (drag.mode === 'move') {
                        drag.dx = world.x - drag.startWorld.x;
                        drag.dy = world.y - drag.startWorld.y;
                    } else if (drag.mode === 'rotate') {
                        const a0 = Math.atan2(
                            drag.startWorld.y - drag.center.y,
                            drag.startWorld.x - drag.center.x,
                        );
                        const a1 = Math.atan2(
                            world.y - drag.center.y,
                            world.x - drag.center.x,
                        );
                        drag.deg = ((a1 - a0) * 180) / Math.PI;
                    } else {
                        const d0 =
                            Math.hypot(
                                drag.startWorld.x - drag.anchor.x,
                                drag.startWorld.y - drag.anchor.y,
                            ) || 1;
                        const d1 = Math.hypot(
                            world.x - drag.anchor.x,
                            world.y - drag.anchor.y,
                        );
                        drag.factor = Math.max(0.02, d1 / d0);
                    }
                    forceTick();
                    return;
                }
                if (viewRef.current.cornerTool && e.buttons === 0) {
                    const canvas = canvasRef.current;
                    if (canvas) {
                        const rect = canvas.getBoundingClientRect();
                        const cam = cameraRef.current;
                        const world = {
                            x: (e.clientX - rect.left - cam.tx) / cam.scale,
                            y: (cam.ty - (e.clientY - rect.top)) / cam.scale,
                        };
                        cornerHoverRef.current = findFilletCorner(viewRef.current.loops, viewRef.current.selected, viewRef.current.hidden, world, cam.scale);
                        canvas.style.cursor = cornerHoverRef.current ? 'crosshair' : '';
                        updateCursor(e);
                        forceTick();
                        return;
                    }
                }
                if (activeTool === 'trim' && e.buttons === 0) {
                    const canvas = canvasRef.current;
                    if (canvas) {
                        const rect = canvas.getBoundingClientRect();
                        const cam = cameraRef.current;
                        const world = {
                            x: (e.clientX - rect.left - cam.tx) / cam.scale,
                            y: (cam.ty - (e.clientY - rect.top)) / cam.scale,
                        };
                        const candidates = viewRef.current.loops.filter(
                            (loop) =>
                                !viewRef.current.hidden.includes(loop.id) &&
                                !loop.bitmapId &&
                                (viewRef.current.selected.length === 0 ||
                                    viewRef.current.selected.includes(loop.id)),
                        );
                        let best: { loopId: string; segmentIndex: number; distance: number } | null = null;
                        const tolerance = 8;
                        for (const loop of candidates) {
                            const hit = trimNearestSegment(loop.points, world, tolerance);
                            if (hit && (!best || hit.distance < best.distance)) {
                                best = {
                                    loopId: loop.id,
                                    segmentIndex: hit.segmentIndex,
                                    distance: hit.distance,
                                };
                            }
                        }
                        onTrimHover(best);
                        canvas.style.cursor = best ? 'crosshair' : '';
                        forceTick();
                    }
                }
                // Hover cursor for the transform overlay.
                if (
                    viewRef.current.transformMode &&
                    e.buttons === 0 &&
                    !viewRef.current.drawTool
                ) {
                    const canvas = canvasRef.current;
                    if (canvas) {
                        const rect = canvas.getBoundingClientRect();
                        const cam = cameraRef.current;
                        const sx = e.clientX - rect.left;
                        const sy = e.clientY - rect.top;
                        const { loops, selected, hidden, transformMode } =
                            viewRef.current;
                        let cursor = '';
                        if (transformMode) {
                            const frame = selectionFrame(
                                loops,
                                selected,
                                hidden,
                            );
                            if (frame) {
                                const toScreen = (x: number, y: number) => ({
                                    x: cam.tx + x * cam.scale,
                                    y: cam.ty - y * cam.scale,
                                });
                                const hit = hitTransformTarget(
                                    transformMode,
                                    frame,
                                    toScreen,
                                    sx,
                                    sy,
                                    {
                                        x: (sx - cam.tx) / cam.scale,
                                        y: (cam.ty - sy) / cam.scale,
                                    },
                                    loops,
                                    selected,
                                    hidden,
                                    cam.scale,
                                );
                                cursor = hit?.cursor ?? '';
                            }
                        }
                        canvas.style.cursor = cursor;
                    }
                }
                const start = panRef.current;
                if (start) {
                    const cam = cameraRef.current;
                    cameraRef.current = {
                        ...cam,
                        tx: cam.tx + (e.clientX - start.x),
                        ty: cam.ty + (e.clientY - start.y),
                    };
                    panRef.current = { x: e.clientX, y: e.clientY };
                    updateCursor(e);
                    forceTick();
                    return;
                }
                // Rubber-band cursor for arc/bezier/polyline click chains.
                const chainTool = viewRef.current.drawTool;
                if (
                    (chainTool === 'arc' ||
                        chainTool === 'bezier' ||
                        chainTool === 'polyline') &&
                    clicksRef.current.length
                ) {
                    updateCursor(e);
                    forceTick();
                    return;
                }
                updateCursor(e);
                if (viewRef.current.tabMode && e.buttons === 0) {
                    const canvas = canvasRef.current;
                    if (canvas) {
                        const rect = canvas.getBoundingClientRect();
                        const cam = cameraRef.current;
                        const world = {
                            x: (e.clientX - rect.left - cam.tx) / cam.scale,
                            y: (cam.ty - (e.clientY - rect.top)) / cam.scale,
                        };
                        const seen = new Map<string, number>();
                        let best: (TabHoverCandidate & { distance: number }) | null = null;
                        const tolerance = 14 / cam.scale;
                        viewRef.current.preview.forEach((contour, previewIndex) => {
                            if (contour.tabEligible === false || contour.points.length < 2) return;
                            const contourIndex = seen.get(contour.entryId) ?? 0;
                            seen.set(contour.entryId, contourIndex + 1);
                            const hit = nearestPointOnPolyline(contour.points, world);
                            if (!hit || hit.distance > tolerance) return;
                            const toolDiameter = Number(contour.toolDiameter) > 0
                                ? Number(contour.toolDiameter)
                                : 6;
                            const tabWidth = Number(contour.tabWidth) > 0
                                ? Number(contour.tabWidth)
                                : 9;
                            const span = getTabCenterlineSpan(
                                Math.max(tabWidth, getMinimumTabWidth(toolDiameter)),
                                toolDiameter,
                            );
                            const total = polylineLength(contour.points);
                            const start = pointAtDistance(contour.points, Math.max(0, hit.along - span / 2));
                            const end = pointAtDistance(contour.points, Math.min(total, hit.along + span / 2));
                            const center = pointAtDistance(contour.points, hit.along);
                            if (!start || !end || !center) return;
                            if (!best || hit.distance < best.distance) {
                                best = {
                                    entryId: contour.entryId,
                                    previewIndex,
                                    contourIndex,
                                    along: hit.along,
                                    start,
                                    end,
                                    center,
                                    spine: polylineSlice(
                                        contour.points,
                                        Math.max(0, hit.along - span / 2),
                                        Math.min(total, hit.along + span / 2),
                                    ),
                                    toolDiameter,
                                    distance: hit.distance,
                                };
                            }
                        });
                        tabHoverRef.current = best;
                        canvas.style.cursor = best ? 'crosshair' : '';
                    }
                } else if (!viewRef.current.tabMode) {
                    tabHoverRef.current = null;
                }
                // Hover (no buttons): refresh cursor readout.
                forceTick();
                // Click-click drawing (camcanvas parity): after the first
                // click the live shape follows the cursor until the second.
                const tool = viewRef.current.drawTool;
                if (
                    (tool === 'line' ||
                        tool === 'rectangle' ||
                        tool === 'polygon' ||
                        tool === 'circle') &&
                    pendingAnchorRef.current &&
                    e.buttons !== 1
                ) {
                    const canvas = canvasRef.current;
                    if (canvas) {
                        const rect = canvas.getBoundingClientRect();
                        const cam = cameraRef.current;
                        const anchor = pendingAnchorRef.current;
                        draftRef.current = {
                            ax: anchor.x,
                            ay: anchor.y,
                            bx: (e.clientX - rect.left - cam.tx) / cam.scale,
                            by: (cam.ty - (e.clientY - rect.top)) / cam.scale,
                        };
                        forceTick();
                        return;
                    }
                }
                // Draw mode: live shape draft in world coords
                // (text places on click instead).
                const downAtMove = downRef.current;
                if (tool && tool !== 'text' && downAtMove && e.buttons === 1) {
                    const canvas = canvasRef.current;
                    if (!canvas) return;
                    const rect = canvas.getBoundingClientRect();
                    const cam = cameraRef.current;
                    const toWorld = (px: number, py: number) => ({
                        x: (px - cam.tx) / cam.scale,
                        y: (cam.ty - py) / cam.scale,
                    });
                    const a = toWorld(
                        downAtMove.x - rect.left,
                        downAtMove.y - rect.top,
                    );
                    const b = toWorld(
                        e.clientX - rect.left,
                        e.clientY - rect.top,
                    );
                    draftRef.current = {
                        ax: a.x,
                        ay: a.y,
                        bx: b.x,
                        by: b.y,
                    };
                    forceTick();
                    return;
                }
                // Left-drag beyond click slop → marquee box select.
                const down = downRef.current;
                if (down && e.buttons === 1) {
                    const canvas = canvasRef.current;
                    if (!canvas) return;
                    const rect = canvas.getBoundingClientRect();
                    const cur = {
                        x: e.clientX - rect.left,
                        y: e.clientY - rect.top,
                    };
                    const origin = {
                        x: down.x - rect.left,
                        y: down.y - rect.top,
                    };
                    if (Math.hypot(cur.x - origin.x, cur.y - origin.y) > 4) {
                        marqueeRef.current = {
                            x0: origin.x,
                            y0: origin.y,
                            x1: cur.x,
                            y1: cur.y,
                        };
                        forceTick();
                    }
                }
            }}
            onMouseUp={(e) => {
                if (tabDragRef.current && e.button === 0) {
                    const drag = tabDragRef.current;
                    tabDragRef.current = null;
                    if (drag.moved) {
                        onMoveTab(drag.marker.entryId, drag.marker.tabIndex, drag.along);
                    }
                    const canvas = canvasRef.current;
                    if (canvas) canvas.style.cursor = '';
                    downRef.current = null;
                    forceTick();
                    return;
                }
                if (trimBrushRef.current && e.button === 0) {
                    const stroke = trimBrushRef.current;
                    trimBrushRef.current = null;
                    onTrimStroke?.(stroke.points);
                    downRef.current = null;
                    forceTick();
                    return;
                }
                const down = downRef.current;
                downRef.current = null;
                panRef.current = null;
                const marquee = marqueeRef.current;
                marqueeRef.current = null;
                const draft = draftRef.current;
                draftRef.current = null;
                // Finish a direct-manipulation transform drag: commit on
                // real movement, silently cancel plain clicks.
                const finished = transformDragRef.current;
                if (finished && e.button === 0) {
                    transformDragRef.current = null;
                    const canvas = canvasRef.current;
                    if (canvas) canvas.style.cursor = '';
                    if (!finished.moved) {
                        forceTick();
                        return;
                    }
                    if (finished.mode === 'move') {
                        onTransformCommit({
                            type: 'move',
                            dx: finished.dx,
                            dy: finished.dy,
                        });
                    } else if (finished.mode === 'rotate') {
                        onTransformCommit({
                            type: 'rotate',
                            degrees: finished.deg,
                            about: finished.center,
                        });
                    } else {
                        onTransformCommit({
                            type: 'scale',
                            factor: finished.factor,
                            about: finished.anchor,
                        });
                    }
                    forceTick();
                    return;
                }
                if (e.button !== 0) {
                    forceTick();
                    return;
                }
                if (
                    viewRef.current.guidePlacement &&
                    down &&
                    Math.hypot(e.clientX - down.x, e.clientY - down.y) < 6 &&
                    !marquee
                ) {
                    const canvas = canvasRef.current;
                    if (canvas) {
                        const rect = canvas.getBoundingClientRect();
                        const cam = cameraRef.current;
                        const position =
                            viewRef.current.guidePlacement === 'x'
                                ? (e.clientX - rect.left - cam.tx) / cam.scale
                                : (cam.ty - (e.clientY - rect.top)) / cam.scale;
                        onPlaceGuide(viewRef.current.guidePlacement, position);
                    }
                    forceTick();
                    return;
                }
                if (
                    activeTool === 'trim' &&
                    down &&
                    Math.hypot(e.clientX - down.x, e.clientY - down.y) < 6 &&
                    !marquee
                ) {
                    const canvas = canvasRef.current;
                    if (canvas) {
                        const rect = canvas.getBoundingClientRect();
                        const cam = cameraRef.current;
                            onTrimAt?.({
                            x: (e.clientX - rect.left - cam.tx) / cam.scale,
                            y: (cam.ty - (e.clientY - rect.top)) / cam.scale,
                        });
                    }
                    downRef.current = null;
                    forceTick();
                    return;
                }
                // Draw mode: commit the dragged shape, place
                // text on a plain click, or accumulate arc/polyline
                // click chains.
                const drawActive = viewRef.current.drawTool;
                if (drawActive === 'text') {
                    if (
                        down &&
                        Math.hypot(e.clientX - down.x, e.clientY - down.y) <
                            4 &&
                        !marquee
                    ) {
                        const canvas = canvasRef.current;
                        if (canvas) {
                            const rect = canvas.getBoundingClientRect();
                            const cam = cameraRef.current;
                            onCommitText(
                                snapDrawPoint(
                                    viewRef.current.loops,
                                    viewRef.current.hidden,
                                    {
                                        x:
                                            (e.clientX - rect.left - cam.tx) /
                                            cam.scale,
                                        y:
                                            (cam.ty - (e.clientY - rect.top)) /
                                            cam.scale,
                                    },
                                    cam.scale,
                                    viewRef.current.grid,
                                    viewRef.current.guides,
                                ),
                            );
                        }
                    }
                    forceTick();
                    return;
                }
                if (
                    (drawActive === 'arc' ||
                        drawActive === 'bezier' ||
                        drawActive === 'polyline') &&
                    down &&
                    Math.hypot(e.clientX - down.x, e.clientY - down.y) < 4 &&
                    !marquee
                ) {
                    const canvas = canvasRef.current;
                    if (canvas) {
                        const rect = canvas.getBoundingClientRect();
                        const cam = cameraRef.current;
                        const at = snapDrawPoint(
                            viewRef.current.loops,
                            viewRef.current.hidden,
                            {
                                x: (e.clientX - rect.left - cam.tx) / cam.scale,
                                y:
                                    (cam.ty - (e.clientY - rect.top)) /
                                    cam.scale,
                            },
                            cam.scale,
                            viewRef.current.grid,
                            viewRef.current.guides,
                        );
                        const chain = [...clicksRef.current, at];
                        clicksRef.current = chain;
                        if (drawActive === 'arc' && chain.length >= 3) {
                            const arc = arcPoints3(
                                chain[0],
                                chain[1],
                                chain[2],
                            );
                            clicksRef.current = [];
                            if (arc) onCommitLoop(arc);
                        }
                        if (drawActive === 'bezier' && chain.length >= 4) {
                            clicksRef.current = [];
                            onCommitLoop(
                                cubicBezierPoints(
                                    chain[0],
                                    chain[1],
                                    chain[2],
                                    chain[3],
                                ),
                            );
                        }
                    }
                    forceTick();
                    return;
                }
                // Click-click drawing (camcanvas parity): first plain
                // click anchors the shape, second click commits it.
                if (
                    (drawActive === 'line' ||
                        drawActive === 'rectangle' ||
                        drawActive === 'polygon' ||
                        drawActive === 'circle') &&
                    down &&
                    Math.hypot(e.clientX - down.x, e.clientY - down.y) < 4 &&
                    !marquee
                ) {
                    const canvas = canvasRef.current;
                    if (canvas) {
                        const rect = canvas.getBoundingClientRect();
                        const cam = cameraRef.current;
                        const at = snapDrawPoint(
                            viewRef.current.loops,
                            viewRef.current.hidden,
                            {
                                x: (e.clientX - rect.left - cam.tx) / cam.scale,
                                y:
                                    (cam.ty - (e.clientY - rect.top)) /
                                    cam.scale,
                            },
                            cam.scale,
                            viewRef.current.grid,
                            viewRef.current.guides,
                        );
                        const anchor = pendingAnchorRef.current;
                        if (!anchor) {
                            pendingAnchorRef.current = at;
                            draftRef.current = {
                                ax: at.x,
                                ay: at.y,
                                bx: at.x,
                                by: at.y,
                            };
                        } else {
                            const points = draftPoints(
                                drawActive,
                                {
                                    ax: anchor.x,
                                    ay: anchor.y,
                                    bx: at.x,
                                    by: at.y,
                                },
                                viewRef.current.drawSides,
                                viewRef.current.grid.snap
                                    ? viewRef.current.grid.spacingMm
                                    : null,
                                viewRef.current.polygonMode,
                            );
                            pendingAnchorRef.current = null;
                            draftRef.current = null;
                            if (points && points.length >= 2) {
                                const radius = Math.hypot(at.x - anchor.x, at.y - anchor.y);
                                onCommitLoop(points, {
                                    sourceType: drawActive,
                                    ...(drawActive === 'circle' ? { radius } : {}),
                                    ...(drawActive === 'polygon'
                                        ? {
                                              radius,
                                              sides: Math.round(viewRef.current.drawSides),
                                              polygonMode: viewRef.current.polygonMode,
                                          }
                                        : {}),
                                });
                            }
                        }
                    }
                    forceTick();
                    return;
                }
                if (
                    drawActive &&
                    (drawActive === 'line' ||
                        drawActive === 'rectangle' ||
                        drawActive === 'polygon' ||
                        drawActive === 'circle')
                ) {
                    // Drag release or non-click in a click-click tool:
                    // keep any pending anchor, drop the drag draft.
                    const anchor = pendingAnchorRef.current;
                    draftRef.current = anchor
                        ? {
                              ax: anchor.x,
                              ay: anchor.y,
                              bx: anchor.x,
                              by: anchor.y,
                          }
                        : null;
                    forceTick();
                    return;
                }
                const canvas = canvasRef.current;
                if (!canvas) return;
                const rect = canvas.getBoundingClientRect();
                const cam = cameraRef.current;
                const toWorld = (px: number, py: number) => ({
                    x: (px - cam.tx) / cam.scale,
                    y: (cam.ty - py) / cam.scale,
                });
                const { loops, selected, hidden, preview, tabMode } =
                    viewRef.current;
                const { bitmaps } = viewRef.current;
                const hide = new Set(hidden);
                // Marquee → select intersecting loops by bounds.
                if (marquee) {
                    const a = toWorld(
                        Math.min(marquee.x0, marquee.x1),
                        Math.max(marquee.y0, marquee.y1),
                    );
                    const b = toWorld(
                        Math.max(marquee.x0, marquee.x1),
                        Math.min(marquee.y0, marquee.y1),
                    );
                    const hits = loops.flatMap((loop) => {
                        if (hide.has(loop.id)) return [];
                        if (!loop.points || !Array.isArray(loop.points) || loop.points.length < 2) return [];
                        try {
                            const lb = boundsOfPoints(loop.points);
                            if (!lb || !Number.isFinite(lb.minX) || !Number.isFinite(lb.minY) || !Number.isFinite(lb.maxX) || !Number.isFinite(lb.maxY)) {
                                return [];
                            }
                            const overlap =
                                lb.minX <= b.x &&
                                lb.maxX >= a.x &&
                                lb.minY <= b.y &&
                                lb.maxY >= a.y;
                            return overlap ? [loop.id] : [];
                        } catch {
                            return [];
                        }
                    });
                    onSelect(
                        e.shiftKey
                            ? Array.from(new Set([...selected, ...hits]))
                            : hits,
                    );
                    forceTick();
                    return;
                }
                // Tab mode → place a tab on the nearest preview contour.
                if (tabMode) {
                    const candidate = tabHoverRef.current;
                    if (candidate) onPlaceTab(candidate.entryId, candidate.contourIndex, candidate.along);
                    tabHoverRef.current = null;
                    (e.currentTarget as HTMLCanvasElement).style.cursor = '';
                    forceTick();
                    return;
                }
                // Left-click without drag → toggle vector selection
                // (never while a draw tool is active).
                if (
                    !drawActive &&
                    e.button === 0 &&
                    down &&
                    Math.hypot(e.clientX - down.x, e.clientY - down.y) < 4
                ) {
                    const world = toWorld(
                        e.clientX - rect.left,
                        e.clientY - rect.top,
                    );
                    // Bitmap pixels are not vector geometry, so their filled
                    // area needs an explicit bounds hit-test. Select the
                    // linked rectangle loop so bitmap selection continues to
                    // use the same selection, trace, and object-tree paths.
                    const bitmapHit = [...bitmaps]
                        .reverse()
                        .find((bitmap) => {
                            const linked = loops.find(
                                (loop) => loop.bitmapId === bitmap.id,
                            );
                            if (!linked || hide.has(linked.id)) return false;
                            const angle = ((bitmap.rotation ?? 0) * Math.PI) / 180;
                            const centerX = bitmap.x + bitmap.w / 2;
                            const centerY = bitmap.y + bitmap.h / 2;
                            const dx = world.x - centerX;
                            const dy = world.y - centerY;
                            const localX = centerX + dx * Math.cos(angle) + dy * Math.sin(angle);
                            const localY = centerY - dx * Math.sin(angle) + dy * Math.cos(angle);
                            return (
                                localX >= bitmap.x &&
                                localX <= bitmap.x + bitmap.w &&
                                localY >= bitmap.y &&
                                localY <= bitmap.y + bitmap.h
                            );
                        });
                    if (bitmapHit) {
                        const linkedId = loops.find(
                            (loop) => loop.bitmapId === bitmapHit.id,
                        )?.id;
                        if (linkedId) {
                            onSelect(
                                selected.includes(linkedId)
                                    ? selected.filter((s) => s !== linkedId)
                                    : [...selected, linkedId],
                            );
                            forceTick();
                            return;
                        }
                    }
                    const tol = 10 / cam.scale;
                    let best: string | null = null;
                    let bestDist = Infinity;
                    loops.forEach((loop) => {
                        if (hide.has(loop.id)) return;
                        if (!Array.isArray(loop.points) || loop.points.length < 2) return;
                        let hit: { distance: number } | null = null;
                        try {
                            hit = nearestPointOnPolyline(loop.points, world);
                        } catch {
                            return;
                        }
                        if (hit && hit.distance < bestDist) {
                            bestDist = hit.distance;
                            best = loop.id;
                        }
                    });
                    if (best !== null && bestDist <= tol) {
                        onSelect(
                            selected.includes(best)
                                ? selected.filter((s) => s !== best)
                                : [...selected, best],
                        );
                    } else if (!e.shiftKey) {
                        onSelect([]);
                    }
                }
            }}
            onMouseLeave={() => {
                // Keep a middle/right-button pan alive if the pointer briefly
                // leaves the canvas while dragging.
                marqueeRef.current = null;
                draftRef.current = null;
                cursorRef.current = null;
                onTrimHover(null);
                transformDragRef.current = null;
                const canvas = canvasRef.current;
                if (canvas) canvas.style.cursor = '';
                forceTick();
            }}
            onContextMenu={(e) => e.preventDefault()}
        />
    );
}

function CursorReadout({
    cursorRef,
    darkMode,
    guidePlacement,
    units,
}: {
    cursorRef: React.RefObject<{ x: number; y: number } | null>;
    darkMode: boolean;
    guidePlacement: 'x' | 'y' | null;
    units: UnitSystem;
}) {
    const cursor = cursorRef.current;
    if (!cursor) return null;
    return (
        <div
            className={`absolute bottom-2 left-2 text-xs px-2 py-1 rounded border tabular-nums ${
                darkMode
                    ? 'bg-dark/80 border-robin-900 text-slate-300'
                    : 'bg-white/90 border-slate-300 text-slate-600'
            }`}
        >
            {guidePlacement
                ? `${guidePlacement === 'x' ? 'Vertical' : 'Horizontal'} guide: ${displayValue(guidePlacement === 'x' ? cursor.x : cursor.y, units, 2)} ${lengthUnit(units)}`
                : `X ${displayValue(cursor.x, units, 2)} · Y ${displayValue(cursor.y, units, 2)} ${lengthUnit(units)}`}
        </div>
    );
}

function ZoomButton({
    label,
    onClick,
    darkMode,
}: {
    label: string;
    onClick: () => void;
    darkMode: boolean;
}) {
    return (
        <button
            onClick={onClick}
            className={`w-8 h-8 rounded border text-sm ${
                darkMode
                    ? 'bg-dark/80 border-robin-900 text-slate-200 hover:bg-dark-lighter'
                    : 'bg-white/90 border-slate-300 text-slate-600 hover:bg-slate-100'
            }`}
        >
            {label}
        </button>
    );
}

function fitCamera(bounds: ViewBounds, w: number, h: number): Camera {
    const spanX = Math.max(1e-6, bounds.maxX - bounds.minX);
    const spanY = Math.max(1e-6, bounds.maxY - bounds.minY);
    const pad = 24;
    const scale = Math.min((w - pad * 2) / spanX, (h - pad * 2) / spanY);
    const cx = (bounds.minX + bounds.maxX) / 2;
    const cy = (bounds.minY + bounds.maxY) / 2;
    return {
        scale,
        tx: w / 2 - cx * scale,
        // world Y-up → screen Y-down
        ty: h / 2 + cy * scale,
    };
}

function draw(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    loops: ViewLoop[],
    bounds: ViewBounds | null,
    preview: PreviewLoop[],
    draftPreview: { x: number; y: number }[][],
    inspectorPreview: { id: string; points: { x: number; y: number }[] } | null,
    theme: CanvasTheme,
    selected: string[],
    hidden: string[],
    tabMarkers: TabMarker[],
    tabHover: TabHoverCandidate | null,
    activeTabDrag: { marker: TabMarker; along: number; moved: boolean } | null,
    selectedTab: TabMarker | null,
    cam: Camera,
    marquee: { x0: number; y0: number; x1: number; y1: number } | null,
    draft: { x: number; y: number }[] | null,
    grid: { visible: boolean; spacingMm: number; snap: boolean; style: 'lines' | 'dots' },
    bitmaps: {
        id: string;
        x: number;
        y: number;
        w: number;
        h: number;
        rotation?: number;
        img?: HTMLImageElement;
    }[],
    guides: { id: string; axis: 'x' | 'y'; pos: number }[],
    guidePlacement: 'x' | 'y' | null,
    guideCursor: { x: number; y: number } | null,
) {
    ctx.fillStyle = theme.bg;
    ctx.fillRect(0, 0, w, h);

    // Construction guides (screen-space dashed lines).
    if (guides.length) {
        ctx.strokeStyle = 'rgba(232,121,249,0.65)';
        ctx.lineWidth = 1;
        ctx.setLineDash([8, 5]);
        ctx.beginPath();
        for (const guide of guides) {
            if (guide.axis === 'x') {
                const px = Math.round(cam.tx + guide.pos * cam.scale) + 0.5;
                ctx.moveTo(px, 0);
                ctx.lineTo(px, h);
            } else {
                const py = Math.round(cam.ty - guide.pos * cam.scale) + 0.5;
                ctx.moveTo(0, py);
                ctx.lineTo(w, py);
            }
        }
        ctx.stroke();
        ctx.setLineDash([]);
    }

    if (guidePlacement && guideCursor) {
        ctx.save();
        ctx.strokeStyle = 'rgba(59,130,246,0.9)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        if (guidePlacement === 'x') {
            const px = Math.round(cam.tx + guideCursor.x * cam.scale) + 0.5;
            ctx.moveTo(px, 0);
            ctx.lineTo(px, h);
        } else {
            const py = Math.round(cam.ty - guideCursor.y * cam.scale) + 0.5;
            ctx.moveTo(0, py);
            ctx.lineTo(w, py);
        }
        ctx.stroke();
        ctx.restore();
    }

    // Grid in screen space, anchored to world origin.
    if (grid.visible) {
        const step = Math.max(4, grid.spacingMm * cam.scale);
        const ox = ((cam.tx % step) + step) % step;
        const oy = ((cam.ty % step) + step) % step;
        if (grid.style === 'dots') {
            ctx.fillStyle = theme.grid;
            ctx.beginPath();
            for (let x = ox; x < w; x += step) {
                for (let y = oy; y < h; y += step) {
                    ctx.moveTo(x + 1.1, y);
                    ctx.arc(x, y, 1.1, 0, Math.PI * 2);
                }
            }
            ctx.fill();
        } else {
            ctx.strokeStyle = theme.grid;
            ctx.lineWidth = 1;
            ctx.beginPath();
            for (let x = ox + 0.5; x < w; x += step) {
                ctx.moveTo(x, 0);
                ctx.lineTo(x, h);
            }
            for (let y = oy + 0.5; y < h; y += step) {
                ctx.moveTo(0, y);
                ctx.lineTo(w, y);
            }
            ctx.stroke();
        }
    }

    // Machine origin: X axis red, Y axis green, dot + label (camcanvas parity).
    drawOriginGuides(ctx, w, h, cam, theme);

    if (!loops.length || !bounds) {
        ctx.fillStyle = theme.emptyText;
        ctx.font = '12px system-ui';
        ctx.fillText('gCAM canvas — drop DXF/SVG here', 16, h - 16);
        return;
    }

    const toScreen = (x: number, y: number) => ({
        x: cam.tx + x * cam.scale,
        y: cam.ty - y * cam.scale,
    });

    for (const bm of bitmaps) {
        if (!(bm.img instanceof HTMLImageElement)) continue;
        const center = toScreen(bm.x + bm.w / 2, bm.y + bm.h / 2);
        try {
            ctx.save();
            ctx.translate(center.x, center.y);
            ctx.rotate(-((bm.rotation ?? 0) * Math.PI) / 180);
            ctx.drawImage(
                bm.img,
                -(bm.w * cam.scale) / 2,
                -(bm.h * cam.scale) / 2,
                bm.w * cam.scale,
                bm.h * cam.scale,
            );
            ctx.restore();
        } catch {
            /* image not yet decodable — skip frame */
        }
    }

    ctx.strokeStyle = theme.vector;
    ctx.lineWidth = 1.5;
    loops.forEach((loop) => {
        if (hidden.includes(loop.id)) return;
        if (selected.includes(loop.id)) {
            ctx.strokeStyle = theme.selected;
            ctx.lineWidth = 2.5;
        } else {
            ctx.strokeStyle = theme.vector;
            ctx.lineWidth = 1.5;
        }
        strokePoints(ctx, loop.points, toScreen);
    });

    if (inspectorPreview && inspectorPreview.points.length >= 2) {
        ctx.save();
        ctx.strokeStyle = theme.selected;
        ctx.lineWidth = 2.5;
        ctx.setLineDash([7, 5]);
        strokePoints(ctx, inspectorPreview.points, toScreen);
        ctx.setLineDash([]);
        ctx.restore();
    }

    ctx.strokeStyle = theme.preview;
    ctx.lineWidth = 1.25;
    for (const contour of preview) {
        strokePoints(ctx, contour.points, toScreen);
    }

    // Live draft preview (uncommitted form state): dashed red, camcanvas parity.
    if (draftPreview.length) {
        ctx.save();
        ctx.strokeStyle = theme.draft;
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 6]);
        for (const contour of draftPreview) {
            strokePoints(ctx, contour, toScreen);
        }
        ctx.restore();
    }

    // Placed tabs follow the actual preview contour. The body is drawn as
    // remaining stock around the cutter, with the cutter's endmill scallops
    // removed at both ends (CAMCANVAS parity).
    for (const m of tabMarkers) {
        const contour = preview[m.previewIndex];
        if (!contour || contour.points.length < 2) continue;
        const diameter = Number(contour.toolDiameter) > 0 ? Number(contour.toolDiameter) : 6;
        const width = Number(contour.tabWidth) > 0 ? Number(contour.tabWidth) : 9;
        const span = getTabCenterlineSpan(Math.max(width, getMinimumTabWidth(diameter)), diameter);
        const along = activeTabDrag?.marker.entryId === m.entryId &&
            activeTabDrag.marker.tabIndex === m.tabIndex
            ? activeTabDrag.along
            : m.along;
        const spine = polylineSlice(
            contour.points,
            Math.max(0, along - span / 2),
            Math.min(polylineLength(contour.points), along + span / 2),
        );
        if (spine.length < 2) continue;
        const isSelected = selectedTab?.entryId === m.entryId && selectedTab.tabIndex === m.tabIndex;
        drawTabBody(
            ctx,
            spine.map((point) => toScreen(point.x, point.y)),
            Math.max(2.5, diameter * cam.scale / 2),
            theme === DARK_THEME ? '#34d399' : '#20c997',
            theme === DARK_THEME ? '#065f46' : '#198754',
            isSelected || (activeTabDrag?.marker.entryId === m.entryId && activeTabDrag.marker.tabIndex === m.tabIndex),
        );
    }

    // CAMCANVAS parity: while Add a Tab is active, show the tab body that
    // would be placed at the nearest eligible toolpath under the cursor.
    if (tabHover) {
        drawTabBody(
            ctx,
            tabHover.spine.map((point) => toScreen(point.x, point.y)),
            Math.max(2.5, tabHover.toolDiameter * cam.scale / 2),
            theme === DARK_THEME ? '#34d399' : '#20c997',
            theme === DARK_THEME ? '#065f46' : '#198754',
            true,
            0.86,
        );
    }

    if (marquee && typeof marquee.x0 === 'number' && typeof marquee.y0 === 'number' && typeof marquee.x1 === 'number' && typeof marquee.y1 === 'number') {
        const x = Math.min(marquee.x0, marquee.x1);
        const y = Math.min(marquee.y0, marquee.y1);
        const mw = Math.abs(marquee.x1 - marquee.x0);
        const mh = Math.abs(marquee.y1 - marquee.y0);
        if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(mw) && Number.isFinite(mh)) {
            ctx.fillStyle = 'rgba(96,165,250,0.12)';
            ctx.fillRect(x, y, mw, mh);
            ctx.strokeStyle = 'rgba(96,165,250,0.9)';
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 3]);
            ctx.strokeRect(x + 0.5, y + 0.5, mw, mh);
            ctx.setLineDash([]);
        }
    }

    if (draft && draft.length >= 2) {
        ctx.strokeStyle = theme.chain;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        draft.forEach((p, i) => {
            const s = toScreen(p.x, p.y);
            if (i === 0) ctx.moveTo(s.x, s.y);
            else ctx.lineTo(s.x, s.y);
        });
        ctx.stroke();
        ctx.setLineDash([]);
    }
}

const RULER = 20;

/** Minor/major ruler ticks ported from camcanvas (dark-adapted colors). */
function rulerTicks(
    ctx: CanvasRenderingContext2D,
    cam: Camera,
    axis: 'x' | 'y',
    w: number,
    h: number,
    minorStep: number,
    majorStep: number,
    theme: CanvasTheme,
    gutter: number,
    units: UnitSystem,
) {
    const toScreen =
        axis === 'x'
            ? (v: number) => cam.tx + v * cam.scale
            : (v: number) => cam.ty - v * cam.scale;
    const lo =
        axis === 'x' ? (gutter - cam.tx) / cam.scale : (cam.ty - h) / cam.scale;
    const hi =
        axis === 'x' ? (w - cam.tx) / cam.scale : (cam.ty - gutter) / cam.scale;
    const eps = minorStep * 1e-6;
    const start = Math.floor(Math.min(lo, hi) / minorStep) * minorStep;
    const end = Math.max(lo, hi);
    ctx.font = '10px system-ui';
    ctx.fillStyle = theme.rulerLabel;
    ctx.textBaseline = axis === 'x' ? 'top' : 'middle';
    ctx.textAlign = axis === 'x' ? 'center' : 'right';
    let guard = 0;
    for (
        let v = start;
        v <= end + eps && guard < 2000;
        v += minorStep, guard += 1
    ) {
        const snapped = Math.abs(v) < eps ? 0 : v;
        const s = Math.round(toScreen(snapped)) + 0.5;
        if (s < gutter) continue;
        if (axis === 'x' && s > w) continue;
        if (axis === 'y' && s > h) continue;
        const isMajor = isNearMultiple(snapped, majorStep);
        const len = isMajor ? 11 : 5;
        ctx.strokeStyle = isMajor ? theme.rulerTick : theme.rulerTickMinor;
        ctx.lineWidth = 1;
        ctx.beginPath();
        if (axis === 'x') {
            ctx.moveTo(s, h);
            ctx.lineTo(s, h - len);
        } else {
            ctx.moveTo(w, s);
            ctx.lineTo(w - len, s);
        }
        ctx.stroke();
        if (!isMajor) continue;
        const label = formatRulerLabel(displayValue(snapped, units, 3));
        if (axis === 'x') {
            ctx.fillText(label, s, 2);
        } else {
            ctx.save();
            ctx.translate(w - 13, s);
            ctx.rotate(-Math.PI / 2);
            ctx.textAlign = 'center';
            ctx.fillText(label, 0, 0);
            ctx.restore();
        }
    }
}

function isNearMultiple(value: number, step: number): boolean {
    if (!Number.isFinite(step) || step <= 0) return false;
    const remainder = Math.abs(value % step);
    const epsilon = step * 1e-4;
    return remainder < epsilon || Math.abs(remainder - step) < epsilon;
}

function formatRulerLabel(value: number): string {
    if (Math.abs(value) >= 100) return String(Math.round(value));
    return String(Math.round(value * 100) / 100);
}

function polylineSlice(
    points: { x: number; y: number }[],
    fromDistance: number,
    toDistance: number,
) {
    if (points.length < 2) return [];
    const total = polylineLength(points);
    const from = Math.max(0, Math.min(total, fromDistance));
    const to = Math.max(from, Math.min(total, toDistance));
    const first = pointAtDistance(points, from);
    if (!first) return [];
    const result = [first];
    let walked = 0;
    for (let index = 1; index < points.length; index += 1) {
        const start = points[index - 1];
        const end = points[index];
        const length = Math.hypot(end.x - start.x, end.y - start.y);
        if (walked + length > from && walked + length < to && length > 0) result.push(end);
        walked += length;
    }
    const last = pointAtDistance(points, to);
    if (last && Math.hypot(last.x - result[result.length - 1].x, last.y - result[result.length - 1].y) > 0.001) {
        result.push(last);
    }
    return result;
}

function drawTabBody(
    ctx: CanvasRenderingContext2D,
    points: { x: number; y: number }[],
    radius: number,
    fill: string,
    stroke: string,
    hovered: boolean,
    alpha = 0.92,
) {
    if (points.length < 2) return;
    const outline = hovered ? 1.7 : 1.25;
    const minX = Math.floor(Math.min(...points.map((point) => point.x)) - radius - outline - 3);
    const minY = Math.floor(Math.min(...points.map((point) => point.y)) - radius - outline - 3);
    const maxX = Math.ceil(Math.max(...points.map((point) => point.x)) + radius + outline + 3);
    const maxY = Math.ceil(Math.max(...points.map((point) => point.y)) + radius + outline + 3);
    const scratch = document.createElement('canvas');
    scratch.width = Math.max(1, maxX - minX);
    scratch.height = Math.max(1, maxY - minY);
    const sctx = scratch.getContext('2d');
    if (!sctx) return;
    const local = points.map((point) => ({ x: point.x - minX, y: point.y - minY }));
    sctx.save();
    sctx.globalAlpha = alpha;
    sctx.lineCap = 'round';
    sctx.lineJoin = 'round';
    sctx.strokeStyle = stroke;
    sctx.lineWidth = radius * 2 + outline * 2;
    strokeScreenSpine(sctx, local);
    sctx.strokeStyle = fill;
    sctx.lineWidth = radius * 2;
    strokeScreenSpine(sctx, local);
    sctx.globalCompositeOperation = 'destination-out';
    fillScreenCircle(sctx, local[0], radius + outline + 1);
    fillScreenCircle(sctx, local[local.length - 1], radius + outline + 1);
    sctx.globalCompositeOperation = 'source-over';
    sctx.strokeStyle = stroke;
    sctx.lineWidth = outline * 2;
    strokeConcaveScreenArc(sctx, local[0], local[1], radius);
    strokeConcaveScreenArc(sctx, local[local.length - 1], local[local.length - 2], radius);
    sctx.restore();
    ctx.save();
    if (hovered) {
        ctx.shadowColor = 'rgba(6,95,70,0.28)';
        ctx.shadowBlur = 8;
    }
    ctx.drawImage(scratch, minX, minY);
    ctx.restore();
}

function strokeScreenSpine(ctx: CanvasRenderingContext2D, points: { x: number; y: number }[]) {
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let index = 1; index < points.length; index += 1) ctx.lineTo(points[index].x, points[index].y);
    ctx.stroke();
}

function fillScreenCircle(ctx: CanvasRenderingContext2D, center: { x: number; y: number }, radius: number) {
    ctx.beginPath();
    ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
    ctx.fill();
}

function strokeConcaveScreenArc(
    ctx: CanvasRenderingContext2D,
    anchor: { x: number; y: number },
    next: { x: number; y: number },
    radius: number,
) {
    const dx = next.x - anchor.x;
    const dy = next.y - anchor.y;
    const length = Math.hypot(dx, dy) || 1;
    const ux = dx / length;
    const uy = dy / length;
    const nx = -uy;
    const ny = ux;
    const start = Math.atan2(ny, nx);
    const end = Math.atan2(-ny, -nx);
    const inward = Math.atan2(uy, ux);
    const tau = Math.PI * 2;
    const normalized = (value: number) => (value % tau + tau) % tau;
    const ccwSpan = (normalized(start) - normalized(end) + tau) % tau;
    const ccwTarget = (normalized(start) - normalized(inward) + tau) % tau;
    ctx.beginPath();
    ctx.arc(anchor.x, anchor.y, radius, start, end, ccwTarget <= ccwSpan);
    ctx.stroke();
}

function drawOriginGuides(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    cam: Camera,
    theme: CanvasTheme,
) {
    const ox = Math.round(cam.tx) + 0.5;
    const oy = Math.round(cam.ty) + 0.5;
    const xVisible = ox >= 0 && ox <= w;
    const yVisible = oy >= 0 && oy <= h;
    ctx.save();
    ctx.setLineDash([]);
    ctx.lineWidth = 1.5;
    if (yVisible) {
        ctx.strokeStyle = theme.originX;
        ctx.beginPath();
        ctx.moveTo(0, oy);
        ctx.lineTo(w, oy);
        ctx.stroke();
    }
    if (xVisible) {
        ctx.strokeStyle = theme.originY;
        ctx.beginPath();
        ctx.moveTo(ox, 0);
        ctx.lineTo(ox, h);
        ctx.stroke();
    }
    if (xVisible && yVisible) {
        ctx.fillStyle = theme.originDot;
        ctx.beginPath();
        ctx.arc(ox, oy, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = theme.originLabel;
        ctx.font = '12px system-ui';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'top';
        ctx.fillText('X0, Y0', ox - 8, oy + 8);
    }
    ctx.restore();
}

function strokePoints(
    ctx: CanvasRenderingContext2D,
    points: { x: number; y: number }[],
    toScreen: (x: number, y: number) => { x: number; y: number },
) {
    if (!Array.isArray(points) || points.length < 2) return;
    ctx.beginPath();
    points.forEach((p, i) => {
        if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return;
        const s = toScreen(p.x, p.y);
        if (i === 0) ctx.moveTo(s.x, s.y);
        else ctx.lineTo(s.x, s.y);
    });
    ctx.stroke();
}
