import { movedFrom, worldAtEvent } from './helpers';
import type { CanvasMouseEvent, CanvasPointerControllerProps } from './types';

export function placeGuide(
    event: CanvasMouseEvent,
    deps: CanvasPointerControllerProps,
    down: { x: number; y: number } | null,
    marquee: unknown,
): boolean {
    const axis = deps.viewRef.current.guidePlacement;
    if (!axis || !down || marquee || movedFrom(event, down, 6)) return false;
    const canvas = deps.canvasRef.current;
    if (canvas) {
        const point = worldAtEvent(event, canvas, deps.cameraRef.current);
        deps.onPlaceGuide(axis, axis === 'x' ? point.x : point.y);
    }
    deps.forceTick();
    return true;
}
