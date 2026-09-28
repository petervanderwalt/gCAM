/**
 * Purpose: Implementation module for rulers in the canvas domain.
 */
import { displayValue, type UnitSystem } from '../lib/units';
import type { CanvasCamera } from './camera';

export const RULER_SIZE = 20;

interface RulerTheme {
    rulerLabel: string;
    rulerTick: string;
    rulerTickMinor: string;
}

function isNearMultiple(value: number, step: number): boolean {
    const remainder = Math.abs(value % step);
    const epsilon = step * 1e-4;
    return remainder < epsilon || Math.abs(remainder - step) < epsilon;
}

function formatLabel(value: number): string {
    return String(
        Math.abs(value) >= 100
            ? Math.round(value)
            : Math.round(value * 100) / 100,
    );
}

export function drawRulerTicks(
    ctx: CanvasRenderingContext2D,
    camera: CanvasCamera,
    axis: 'x' | 'y',
    width: number,
    height: number,
    minorStep: number,
    majorStep: number,
    theme: RulerTheme,
    gutter: number,
    units: UnitSystem,
): void {
    const toScreen =
        axis === 'x'
            ? (value: number) => camera.tx + value * camera.scale
            : (value: number) => camera.ty - value * camera.scale;
    const low =
        axis === 'x'
            ? (gutter - camera.tx) / camera.scale
            : (camera.ty - height) / camera.scale;
    const high =
        axis === 'x'
            ? (width - camera.tx) / camera.scale
            : (camera.ty - gutter) / camera.scale;
    const epsilon = minorStep * 1e-6;
    ctx.font = '10px system-ui';
    ctx.fillStyle = theme.rulerLabel;
    ctx.textBaseline = axis === 'x' ? 'top' : 'middle';
    ctx.textAlign = axis === 'x' ? 'center' : 'right';
    for (
        let value = Math.floor(Math.min(low, high) / minorStep) * minorStep,
            guard = 0;
        value <= Math.max(low, high) + epsilon && guard < 2000;
        value += minorStep, guard += 1
    ) {
        const snapped = Math.abs(value) < epsilon ? 0 : value;
        const screen = Math.round(toScreen(snapped)) + 0.5;
        if (
            screen < gutter ||
            (axis === 'x' && screen > width) ||
            (axis === 'y' && screen > height)
        )
            continue;
        const major = isNearMultiple(snapped, majorStep);
        ctx.strokeStyle = major ? theme.rulerTick : theme.rulerTickMinor;
        ctx.beginPath();
        if (axis === 'x') {
            ctx.moveTo(screen, height);
            ctx.lineTo(screen, height - (major ? 11 : 5));
        } else {
            ctx.moveTo(width, screen);
            ctx.lineTo(width - (major ? 11 : 5), screen);
        }
        ctx.stroke();
        if (major)
            ctx.fillText(
                formatLabel(displayValue(snapped, units, 3)),
                axis === 'x' ? screen : width - 13,
                axis === 'x' ? 2 : screen,
            );
    }
}
