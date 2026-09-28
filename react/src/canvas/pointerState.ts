/**
 * Purpose: Implementation module for pointerState in the canvas domain.
 */
import type { CanvasCamera } from './camera';

export type ScreenPoint = { x: number; y: number };

/** Browser-coordinate decisions shared by all canvas pointer state machines. */
export function toWorldPoint(
    client: ScreenPoint,
    rect: Pick<DOMRect, 'left' | 'top'>,
    camera: CanvasCamera,
): ScreenPoint {
    return {
        x: (client.x - rect.left - camera.tx) / camera.scale,
        y: (camera.ty - (client.y - rect.top)) / camera.scale,
    };
}

export function hasPointerMoved(
    from: ScreenPoint | null,
    to: ScreenPoint,
    threshold: number,
): boolean {
    return Boolean(
        from && Math.hypot(to.x - from.x, to.y - from.y) >= threshold,
    );
}

export function startsPan(button: number, altKey: boolean): boolean {
    return button === 1 || button === 2 || altKey;
}
