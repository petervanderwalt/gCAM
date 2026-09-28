import type { CanvasCamera } from './camera';

type Point = { x: number; y: number };

interface OriginTheme {
    originX: string;
    originY: string;
    originDot: string;
    originLabel: string;
}

export function drawOriginGuides(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    camera: CanvasCamera,
    theme: OriginTheme,
): void {
    const x = Math.round(camera.tx) + 0.5;
    const y = Math.round(camera.ty) + 0.5;
    ctx.save();
    ctx.setLineDash([]);
    ctx.lineWidth = 1.5;
    if (y >= 0 && y <= height) {
        ctx.strokeStyle = theme.originX;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
    }
    if (x >= 0 && x <= width) {
        ctx.strokeStyle = theme.originY;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
    }
    if (x >= 0 && x <= width && y >= 0 && y <= height) {
        ctx.fillStyle = theme.originDot;
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = theme.originLabel;
        ctx.font = '12px system-ui';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'top';
        ctx.fillText('X0, Y0', x - 8, y + 8);
    }
    ctx.restore();
}

export function strokePoints(
    ctx: CanvasRenderingContext2D,
    points: Point[],
    toScreen: (x: number, y: number) => Point,
): void {
    if (points.length < 2) return;
    ctx.beginPath();
    points.forEach((point, index) => {
        if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
        const screen = toScreen(point.x, point.y);
        if (index === 0) ctx.moveTo(screen.x, screen.y);
        else ctx.lineTo(screen.x, screen.y);
    });
    ctx.stroke();
}
