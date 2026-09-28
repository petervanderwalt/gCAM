/**
 * Purpose: Implementation module for helpers in the canvas domain.
 */
import type { Camera } from '../types';
import type { CanvasMouseEvent, Point } from './types';

export function worldAtEvent(
    event: CanvasMouseEvent,
    canvas: HTMLCanvasElement,
    camera: Camera,
): Point {
    const rect = canvas.getBoundingClientRect();
    return {
        x: (event.clientX - rect.left - camera.tx) / camera.scale,
        y: (camera.ty - (event.clientY - rect.top)) / camera.scale,
    };
}

export function screenAtEvent(
    event: CanvasMouseEvent,
    canvas: HTMLCanvasElement,
): Point {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

export function movedFrom(
    event: CanvasMouseEvent,
    origin: Point | null,
    tolerance: number,
): boolean {
    return (
        !!origin &&
        Math.hypot(event.clientX - origin.x, event.clientY - origin.y) >=
            tolerance
    );
}
