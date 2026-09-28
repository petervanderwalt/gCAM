import { clamp } from './math.js';

// Origin, zero reference, and machine-axis overlays for the stock preview.
export function drawPreviewOriginAndAxes({
    ctx,
    project,
    bounds,
    width,
    height,
    stockThickness,
    dark,
}) {
    // Floating origin callout so users know where to zero the machine.
    // The worker already extends the stock to include (0,0); mark it here.
    const originTop = project(0, 0, 0);
    const lift = Math.max(
        stockThickness * 0.6,
        Math.max(width, height) * 0.08,
        5,
    );
    const originFloat = project(0, 0, lift);
    ctx.save();
    ctx.strokeStyle = dark ? 'rgba(62, 133, 199, 0.9)' : '#3E85C7';
    ctx.lineWidth = 1.2;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(originTop.x, originTop.y);
    ctx.lineTo(originFloat.x, originFloat.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(originTop.x, originTop.y, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#ef4444';
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    const label = 'Zero here';
    ctx.font = '600 11px Segoe UI, system-ui, sans-serif';
    const textWidth = ctx.measureText(label).width;
    const padX = 7;
    const pillW = textWidth + padX * 2;
    const pillH = 20;
    const pillX = originFloat.x - pillW / 2;
    const pillY = originFloat.y - pillH - 6;
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(pillX, pillY, pillW, pillH, 10);
    } else {
        ctx.rect(pillX, pillY, pillW, pillH);
    }
    ctx.fillStyle = '#3E85C7';
    ctx.fill();
    ctx.strokeStyle = dark ? 'rgba(255, 255, 255, 0.9)' : '#2c5d8b';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, pillX + padX, pillY + pillH / 2 + 0.5);
    ctx.restore();
    // X/Y direction indicators from the zero corner. They start a small
    // margin away from the origin dot so they never cover it, then run as
    // dashed lines with arrowheads + axis labels in gSender axis colors.
    const axisLen = clamp(Math.max(width, height) * 0.16, 12, 60);
    const axisMargin = clamp(axisLen * 0.22, 4, 12);
    const axisZ = Math.max(stockThickness * 0.05, 0.5);
    const drawAxisIndicator = (start, end, color, text) => {
        const p0 = project(start.x, start.y, start.z);
        const p1 = project(end.x, end.y, end.z);
        const dx = p1.x - p0.x;
        const dy = p1.y - p0.y;
        const len = Math.hypot(dx, dy);
        if (!(len > 1)) return;
        const ux = dx / len;
        const uy = dy / len;
        ctx.save();
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 4]);
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
        ctx.stroke();
        ctx.setLineDash([]);
        // Filled arrowhead oriented along the projected direction.
        const headLen = 8;
        const headHalf = 3.4;
        const bx = p1.x - ux * headLen;
        const by = p1.y - uy * headLen;
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(bx - uy * headHalf, by + ux * headHalf);
        ctx.lineTo(bx + uy * headHalf, by - ux * headHalf);
        ctx.closePath();
        ctx.fill();
        // Axis letter just past the tip with a halo for readability.
        ctx.font = '700 12px Segoe UI, system-ui, sans-serif';
        ctx.textBaseline = 'middle';
        const lx = p1.x + ux * 10;
        const ly = p1.y + uy * 10;
        ctx.lineWidth = 3;
        ctx.strokeStyle = dark ? '#0b1220' : '#e8e8e8';
        ctx.strokeText(text, lx - 4, ly);
        ctx.fillStyle = color;
        ctx.fillText(text, lx - 4, ly);
        ctx.restore();
    };
    drawAxisIndicator(
        { x: axisMargin, y: 0, z: axisZ },
        { x: axisMargin + axisLen, y: 0, z: axisZ },
        '#df3b3b',
        'X',
    );
    drawAxisIndicator(
        { x: 0, y: axisMargin, z: axisZ },
        { x: 0, y: axisMargin + axisLen, z: axisZ },
        '#06b881',
        'Y',
    );
}
