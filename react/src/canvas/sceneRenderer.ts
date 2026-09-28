import { getMinimumTabWidth, getTabCenterlineSpan } from '../cam/cam-ops.js';
import { pointAtDistance, polylineLength } from '../geometry/primitives.js';
import { drawOriginGuides, strokePoints } from './primitives';
import type { CanvasCamera } from './camera';

type Point = { x: number; y: number };

export interface CanvasSceneTheme {
    bg: string;
    grid: string;
    vector: string;
    selected: string;
    preview: string;
    draft: string;
    chain: string;
    originX: string;
    originY: string;
    originDot: string;
    originLabel: string;
    emptyText: string;
}

export interface CanvasSceneLoop {
    id: string;
    points: Point[];
}

export interface CanvasScenePreview {
    points: Point[];
    intensity?: number;
    tabWidth?: number;
    toolDiameter?: number;
}

export interface CanvasTabMarker {
    entryId: string;
    tabIndex: number;
    previewIndex: number;
    along: number;
}

export interface CanvasTabHover {
    spine: Point[];
    toolDiameter: number;
}

export interface CanvasSceneInput {
    ctx: CanvasRenderingContext2D;
    width: number;
    height: number;
    loops: CanvasSceneLoop[];
    hasBounds: boolean;
    preview: CanvasScenePreview[];
    draftPreview: Point[][];
    inspectorPreview: { id: string; points: Point[] } | null;
    theme: CanvasSceneTheme;
    darkMode: boolean;
    selected: string[];
    hidden: string[];
    tabMarkers: CanvasTabMarker[];
    tabHover: CanvasTabHover | null;
    activeTabDrag: {
        marker: CanvasTabMarker;
        along: number;
        moved: boolean;
    } | null;
    selectedTab: CanvasTabMarker | null;
    camera: CanvasCamera;
    marquee: { x0: number; y0: number; x1: number; y1: number } | null;
    draft: Point[] | null;
    grid: {
        visible: boolean;
        spacingMm: number;
        snap: boolean;
        style: 'lines' | 'dots';
    };
    bitmaps: {
        id: string;
        x: number;
        y: number;
        w: number;
        h: number;
        rotation?: number;
        img?: HTMLImageElement;
    }[];
    guides: { id: string; axis: 'x' | 'y'; pos: number }[];
    guidePlacement: 'x' | 'y' | null;
    guideCursor: Point | null;
}

/** Paint the static CAD/CAM scene. Interaction overlays are painted separately. */
export function drawCanvasScene(input: CanvasSceneInput): void {
    const {
        ctx,
        width: w,
        height: h,
        loops,
        hasBounds,
        preview,
        draftPreview,
        inspectorPreview,
        theme,
        darkMode,
        selected,
        hidden,
        tabMarkers,
        tabHover,
        activeTabDrag,
        selectedTab,
        camera: cam,
        marquee,
        draft,
        grid,
        bitmaps,
        guides,
        guidePlacement,
        guideCursor,
    } = input;
    ctx.fillStyle = theme.bg;
    ctx.fillRect(0, 0, w, h);
    drawGuides(ctx, w, h, cam, guides, guidePlacement, guideCursor);
    drawGrid(ctx, w, h, cam, grid, theme);
    drawOriginGuides(ctx, w, h, cam, theme);
    if (!loops.length || !hasBounds) {
        ctx.fillStyle = theme.emptyText;
        ctx.font = '12px system-ui';
        ctx.fillText('gCAM canvas — drop DXF/SVG here', 16, h - 16);
        return;
    }
    const toScreen = (x: number, y: number) => ({
        x: cam.tx + x * cam.scale,
        y: cam.ty - y * cam.scale,
    });
    drawBitmaps(ctx, bitmaps, toScreen, cam);
    for (const loop of loops) {
        if (hidden.includes(loop.id)) continue;
        ctx.strokeStyle = selected.includes(loop.id)
            ? theme.selected
            : theme.vector;
        ctx.lineWidth = selected.includes(loop.id) ? 2.5 : 1.5;
        strokePoints(ctx, loop.points, toScreen);
    }
    if (inspectorPreview && inspectorPreview.points.length >= 2) {
        ctx.save();
        ctx.strokeStyle = theme.selected;
        ctx.lineWidth = 2.5;
        ctx.setLineDash([7, 5]);
        strokePoints(ctx, inspectorPreview.points, toScreen);
        ctx.restore();
    }
    drawPreviewContours(ctx, preview, draftPreview, toScreen, theme);
    drawTabs(
        ctx,
        preview,
        tabMarkers,
        tabHover,
        activeTabDrag,
        selectedTab,
        toScreen,
        cam,
        darkMode,
    );
    drawMarquee(ctx, marquee);
    if (draft && draft.length >= 2) {
        ctx.strokeStyle = theme.chain;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 4]);
        strokePoints(ctx, draft, toScreen);
        ctx.setLineDash([]);
    }
}

function drawGuides(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    cam: CanvasCamera,
    guides: CanvasSceneInput['guides'],
    placement: CanvasSceneInput['guidePlacement'],
    cursor: Point | null,
): void {
    if (guides.length) {
        ctx.strokeStyle = 'rgba(232,121,249,0.65)';
        ctx.lineWidth = 1;
        ctx.setLineDash([8, 5]);
        ctx.beginPath();
        for (const guide of guides) {
            const coordinate =
                guide.axis === 'x'
                    ? Math.round(cam.tx + guide.pos * cam.scale) + 0.5
                    : Math.round(cam.ty - guide.pos * cam.scale) + 0.5;
            if (guide.axis === 'x') {
                ctx.moveTo(coordinate, 0);
                ctx.lineTo(coordinate, h);
            } else {
                ctx.moveTo(0, coordinate);
                ctx.lineTo(w, coordinate);
            }
        }
        ctx.stroke();
        ctx.setLineDash([]);
    }
    if (!placement || !cursor) return;
    ctx.save();
    ctx.strokeStyle = 'rgba(59,130,246,0.9)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    if (placement === 'x') {
        const x = Math.round(cam.tx + cursor.x * cam.scale) + 0.5;
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
    } else {
        const y = Math.round(cam.ty - cursor.y * cam.scale) + 0.5;
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
    }
    ctx.stroke();
    ctx.restore();
}

function drawGrid(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    cam: CanvasCamera,
    grid: CanvasSceneInput['grid'],
    theme: CanvasSceneTheme,
): void {
    if (!grid.visible) return;
    const step = Math.max(4, grid.spacingMm * cam.scale);
    const ox = ((cam.tx % step) + step) % step;
    const oy = ((cam.ty % step) + step) % step;
    if (grid.style === 'dots') {
        ctx.fillStyle = theme.grid;
        ctx.beginPath();
        for (let x = ox; x < w; x += step)
            for (let y = oy; y < h; y += step) {
                ctx.moveTo(x + 1.1, y);
                ctx.arc(x, y, 1.1, 0, Math.PI * 2);
            }
        ctx.fill();
        return;
    }
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

function drawBitmaps(
    ctx: CanvasRenderingContext2D,
    bitmaps: CanvasSceneInput['bitmaps'],
    toScreen: (x: number, y: number) => Point,
    camera: CanvasCamera,
): void {
    for (const bitmap of bitmaps) {
        if (!(bitmap.img instanceof HTMLImageElement)) continue;
        const center = toScreen(
            bitmap.x + bitmap.w / 2,
            bitmap.y + bitmap.h / 2,
        );
        try {
            ctx.save();
            ctx.translate(center.x, center.y);
            ctx.rotate(-((bitmap.rotation ?? 0) * Math.PI) / 180);
            ctx.drawImage(
                bitmap.img,
                -(bitmap.w * camera.scale) / 2,
                -(bitmap.h * camera.scale) / 2,
                bitmap.w * camera.scale,
                bitmap.h * camera.scale,
            );
            ctx.restore();
        } catch {
            /* image not yet decodable — skip frame */
        }
    }
}

function drawPreviewContours(
    ctx: CanvasRenderingContext2D,
    preview: CanvasScenePreview[],
    draftPreview: Point[][],
    toScreen: (x: number, y: number) => Point,
    theme: CanvasSceneTheme,
): void {
    ctx.strokeStyle = theme.preview;
    ctx.lineWidth = 1.25;
    for (const contour of preview) {
        ctx.globalAlpha = intensityAlpha(contour.intensity);
        strokePoints(ctx, contour.points, toScreen);
    }
    ctx.globalAlpha = 1;
    if (!draftPreview.length) return;
    ctx.save();
    ctx.strokeStyle = theme.draft;
    for (const contour of draftPreview) {
        const styled = contour as Point[] & {
            _intensity?: number;
            _solidPreview?: boolean;
        };
        ctx.lineWidth = styled._solidPreview ? 0.9 : 2;
        ctx.setLineDash(styled._solidPreview ? [] : [8, 6]);
        ctx.globalAlpha = intensityAlpha(styled._intensity);
        strokePoints(ctx, contour, toScreen);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
}

function intensityAlpha(intensity: number | undefined): number {
    const value = Number(intensity);
    return Number.isFinite(value)
        ? 0.18 + Math.max(0, Math.min(1, value)) * 0.82
        : 1;
}

function drawTabs(
    ctx: CanvasRenderingContext2D,
    preview: CanvasScenePreview[],
    markers: CanvasTabMarker[],
    hover: CanvasTabHover | null,
    activeDrag: CanvasSceneInput['activeTabDrag'],
    selectedTab: CanvasTabMarker | null,
    toScreen: (x: number, y: number) => Point,
    camera: CanvasCamera,
    darkMode: boolean,
): void {
    const fill = darkMode ? '#34d399' : '#20c997';
    const stroke = darkMode ? '#065f46' : '#198754';
    for (const marker of markers) {
        const contour = preview[marker.previewIndex];
        if (!contour || contour.points.length < 2) continue;
        const diameter =
            Number(contour.toolDiameter) > 0 ? Number(contour.toolDiameter) : 6;
        const width =
            Number(contour.tabWidth) > 0 ? Number(contour.tabWidth) : 9;
        const span = getTabCenterlineSpan(
            Math.max(width, getMinimumTabWidth(diameter)),
            diameter,
        );
        const along =
            activeDrag?.marker.entryId === marker.entryId &&
            activeDrag.marker.tabIndex === marker.tabIndex
                ? activeDrag.along
                : marker.along;
        const spine = polylineSlice(
            contour.points,
            Math.max(0, along - span / 2),
            Math.min(polylineLength(contour.points), along + span / 2),
        );
        if (spine.length < 2) continue;
        const selected =
            selectedTab?.entryId === marker.entryId &&
            selectedTab.tabIndex === marker.tabIndex;
        const dragging =
            activeDrag?.marker.entryId === marker.entryId &&
            activeDrag.marker.tabIndex === marker.tabIndex;
        drawTabBody(
            ctx,
            spine.map((point) => toScreen(point.x, point.y)),
            Math.max(2.5, (diameter * camera.scale) / 2),
            fill,
            stroke,
            selected || dragging,
        );
    }
    if (hover)
        drawTabBody(
            ctx,
            hover.spine.map((point) => toScreen(point.x, point.y)),
            Math.max(2.5, (hover.toolDiameter * camera.scale) / 2),
            fill,
            stroke,
            true,
            0.86,
        );
}

function drawMarquee(
    ctx: CanvasRenderingContext2D,
    marquee: CanvasSceneInput['marquee'],
): void {
    if (!marquee) return;
    const x = Math.min(marquee.x0, marquee.x1),
        y = Math.min(marquee.y0, marquee.y1),
        w = Math.abs(marquee.x1 - marquee.x0),
        h = Math.abs(marquee.y1 - marquee.y0);
    if (![x, y, w, h].every(Number.isFinite)) return;
    ctx.fillStyle = 'rgba(96,165,250,0.12)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(96,165,250,0.9)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(x + 0.5, y + 0.5, w, h);
    ctx.setLineDash([]);
}

export function polylineSlice(
    points: Point[],
    fromDistance: number,
    toDistance: number,
): Point[] {
    if (points.length < 2) return [];
    const total = polylineLength(points);
    const from = Math.max(0, Math.min(total, fromDistance));
    const to = Math.max(from, Math.min(total, toDistance));
    const first = pointAtDistance(points, from);
    if (!first) return [];
    const result = [first];
    let walked = 0;
    for (let index = 1; index < points.length; index += 1) {
        const start = points[index - 1],
            end = points[index],
            length = Math.hypot(end.x - start.x, end.y - start.y);
        if (walked + length > from && walked + length < to && length > 0)
            result.push(end);
        walked += length;
    }
    const last = pointAtDistance(points, to);
    if (
        last &&
        Math.hypot(
            last.x - result[result.length - 1].x,
            last.y - result[result.length - 1].y,
        ) > 0.001
    )
        result.push(last);
    return result;
}

function drawTabBody(
    ctx: CanvasRenderingContext2D,
    points: Point[],
    radius: number,
    fill: string,
    stroke: string,
    hovered: boolean,
    alpha = 0.92,
): void {
    if (points.length < 2) return;
    const outline = hovered ? 1.7 : 1.25;
    const minX = Math.floor(
            Math.min(...points.map((point) => point.x)) - radius - outline - 3,
        ),
        minY = Math.floor(
            Math.min(...points.map((point) => point.y)) - radius - outline - 3,
        ),
        maxX = Math.ceil(
            Math.max(...points.map((point) => point.x)) + radius + outline + 3,
        ),
        maxY = Math.ceil(
            Math.max(...points.map((point) => point.y)) + radius + outline + 3,
        );
    const scratch = document.createElement('canvas');
    scratch.width = Math.max(1, maxX - minX);
    scratch.height = Math.max(1, maxY - minY);
    const sctx = scratch.getContext('2d');
    if (!sctx) return;
    const local = points.map((point) => ({
        x: point.x - minX,
        y: point.y - minY,
    }));
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
    strokeConcaveScreenArc(
        sctx,
        local[local.length - 1],
        local[local.length - 2],
        radius,
    );
    sctx.restore();
    ctx.save();
    if (hovered) {
        ctx.shadowColor = 'rgba(6,95,70,0.28)';
        ctx.shadowBlur = 8;
    }
    ctx.drawImage(scratch, minX, minY);
    ctx.restore();
}

function strokeScreenSpine(
    ctx: CanvasRenderingContext2D,
    points: Point[],
): void {
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let index = 1; index < points.length; index += 1)
        ctx.lineTo(points[index].x, points[index].y);
    ctx.stroke();
}
function fillScreenCircle(
    ctx: CanvasRenderingContext2D,
    center: Point,
    radius: number,
): void {
    ctx.beginPath();
    ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
    ctx.fill();
}
function strokeConcaveScreenArc(
    ctx: CanvasRenderingContext2D,
    anchor: Point,
    next: Point,
    radius: number,
): void {
    const dx = next.x - anchor.x,
        dy = next.y - anchor.y,
        length = Math.hypot(dx, dy) || 1,
        ux = dx / length,
        uy = dy / length,
        nx = -uy,
        ny = ux,
        start = Math.atan2(ny, nx),
        end = Math.atan2(-ny, -nx),
        inward = Math.atan2(uy, ux),
        tau = Math.PI * 2,
        normalized = (value: number) => ((value % tau) + tau) % tau,
        ccwSpan = (normalized(start) - normalized(end) + tau) % tau,
        ccwTarget = (normalized(start) - normalized(inward) + tau) % tau;
    ctx.beginPath();
    ctx.arc(anchor.x, anchor.y, radius, start, end, ccwTarget <= ccwSpan);
    ctx.stroke();
}
