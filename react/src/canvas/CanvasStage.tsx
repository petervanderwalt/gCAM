import { useEffect, useRef, useState } from 'react';
import {
    getMinimumTabWidth,
    getTabCenterlineSpan,
    nearestPointOnPolyline,
} from '../cam/cam-ops.js';
import { pointAtDistance, polylineLength } from '../geometry/primitives.js';
import { boundsOfPoints } from '../geometry/bounds.js';
import {
    arcPoints3,
    draftPoints,
    rulerStep,
    type DrawTool,
} from '../draw/geometry';
import { type TransformCommit, type TransformMode } from '../lib/transform';
import {
    findFilletCorner,
    hitTransformTarget,
    type CornerHover,
    type SelectionFrame,
    type TransformDragState,
} from './selectionGeometry';
import { fitCamera } from './camera';
import { drawRulerTicks, RULER_SIZE } from './rulers';
import { drawCanvasScene, polylineSlice } from './sceneRenderer';
import {
    paintDrawingFeedback,
    paintSelectionFeedback,
} from './paintInteractionOverlays';
import { CanvasViewport } from './CanvasViewport';
import { CanvasHud } from './CanvasHud';
import { DARK_CANVAS_THEME, LIGHT_CANVAS_THEME } from './theme';
import type { CanvasStageProps } from './CanvasStage.types';
import type { CanvasViewState } from './stageViewState';
import { useCanvasViewportCommands } from './useCanvasViewportCommands';
import type {
    Camera,
    LoopMeta,
    PreviewLoop,
    TabHoverCandidate,
    TabMarker,
    Tool,
    ViewBounds,
    ViewLoop,
} from './types';
import { trimNearestSegment } from '../lib/trim';
import {
    displayValue,
    lengthUnit,
    MM_PER_INCH,
    type UnitSystem,
} from '../lib/units';

/**
 * 2D canvas: fitted vector view with wheel-zoom, drag-pan (middle/right
 * button or Alt+left) and fit/zoom controls. Vectors green, toolpath
 * preview amber. Full CanvasView scene (rulers, snap, overlays) ports here.
 */
export type {
    Camera,
    LoopMeta,
    PreviewLoop,
    TabHoverCandidate,
    TabMarker,
    Tool,
    ViewBounds,
    ViewLoop,
};
export type { DrawTool } from './types';

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
}: CanvasStageProps) {
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
    const trimBrushRef = useRef<{ points: { x: number; y: number }[] } | null>(
        null,
    );
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
    const viewRef = useRef<CanvasViewState>({
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
            const theme = viewRef.current.darkMode
                ? DARK_CANVAS_THEME
                : LIGHT_CANVAS_THEME;
            const cam = cameraRef.current;
            const unitScale =
                viewRef.current.units === 'imperial' ? MM_PER_INCH : 1;
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
                    drawRulerTicks(
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
                    drawRulerTicks(
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
            drawCanvasScene({
                ctx,
                width: canvas.width,
                height: canvas.height,
                loops,
                hasBounds: Boolean(bounds),
                preview,
                draftPreview,
                inspectorPreview,
                theme: darkMode ? DARK_CANVAS_THEME : LIGHT_CANVAS_THEME,
                darkMode,
                selected,
                hidden,
                tabMarkers,
                tabHover,
                activeTabDrag: tabDragRef.current,
                selectedTab: selectedTabRef.current,
                camera: cameraRef.current,
                marquee: marqueeRef.current,
                draft: draftPoints(
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
                guideCursor: cursorRef.current,
            });
            paintRulers();
            paintSelectionFeedback({
                ctx,
                loops,
                selected,
                hidden,
                darkMode,
                camera: cameraRef.current,
                trimHover:
                    viewRef.current.activeTool === 'trim'
                        ? trimHoverRef.current
                        : null,
                cornerTool: viewRef.current.cornerTool,
                cornerHover: cornerHoverRef.current,
                cornerRadius: viewRef.current.cornerRadius,
                transformMode: viewRef.current.transformMode,
                transformDrag: transformDragRef.current,
                clicks: [],
                cursor: null,
                drawTool: null,
                grid: viewRef.current.grid,
                guides: viewRef.current.guides,
            });
            paintDrawingFeedback({
                ctx,
                loops,
                selected,
                hidden,
                darkMode,
                camera: cameraRef.current,
                trimHover: null,
                cornerTool: null,
                cornerHover: null,
                cornerRadius: 0,
                transformMode: null,
                transformDrag: null,
                clicks: clicksRef.current,
                cursor: cursorRef.current,
                drawTool: viewRef.current.drawTool,
                grid: viewRef.current.grid,
                guides: viewRef.current.guides,
            });
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
    const { fitToBounds, zoomBy } = useCanvasViewportCommands({
        canvasRef,
        cameraRef,
        viewRef,
        bounds,
        loopCount: loops.length,
        preserveViewToken,
        viewportCommand,
        repaint: forceTick,
    });

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
        const label =
            drawTool === 'circle'
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
                    <CanvasHud
                        loopCount={loops.length}
                        darkMode={darkMode}
                        cursorRef={cursorRef}
                        guidePlacement={guidePlacement}
                        units={units}
                        draftProgress={draftProgress}
                        progressPosition={pillPos}
                        draftDimension={draftDimension}
                        onZoom={zoomBy}
                        onFit={fitToBounds}
                    />
                </div>
            </div>
        </div>
    );
}
const RULER = RULER_SIZE;
