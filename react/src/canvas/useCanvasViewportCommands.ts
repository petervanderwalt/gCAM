import {
    useEffect,
    useRef,
    type MutableRefObject,
    type RefObject,
} from 'react';
import { fitCamera } from './camera';
import type { CanvasViewState } from './stageViewState';
import type { Camera } from './types';

interface ViewportCommand {
    type: 'fit' | 'zoomIn' | 'zoomOut';
    token: number;
}

interface CanvasViewportCommandOptions {
    canvasRef: RefObject<HTMLCanvasElement>;
    cameraRef: MutableRefObject<Camera>;
    viewRef: MutableRefObject<CanvasViewState>;
    bounds: CanvasViewState['bounds'];
    loopCount: number;
    preserveViewToken?: number;
    viewportCommand?: ViewportCommand;
    repaint: () => void;
}

// Camera mutations live beside their React synchronization rules so the stage
// component remains responsible only for composing the canvas surface.
export function useCanvasViewportCommands({
    canvasRef,
    cameraRef,
    viewRef,
    bounds,
    loopCount,
    preserveViewToken,
    viewportCommand,
    repaint,
}: CanvasViewportCommandOptions) {
    const preserveViewTokenRef = useRef(preserveViewToken ?? 0);
    const repaintRef = useRef(repaint);
    repaintRef.current = repaint;
    const zoomBy = (factor: number, cx?: number, cy?: number) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const px = cx ?? rect.width / 2;
        const py = cy ?? rect.height / 2;
        const camera = cameraRef.current;
        const next = Math.min(500, Math.max(0.01, camera.scale * factor));
        const wx = (px - camera.tx) / camera.scale;
        const wy = (camera.ty - py) / camera.scale;
        cameraRef.current = {
            scale: next,
            tx: px - wx * next,
            ty: py + wy * next,
        };
        repaint();
    };
    const fitToBounds = () => {
        const canvas = canvasRef.current;
        const viewBounds = viewRef.current.bounds;
        const rect = canvas?.parentElement?.getBoundingClientRect();
        if (!canvas || !viewBounds || !rect) return;
        cameraRef.current = fitCamera(viewBounds, rect.width, rect.height);
        repaint();
    };

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !bounds) return;
        if (preserveViewTokenRef.current !== (preserveViewToken ?? 0)) {
            preserveViewTokenRef.current = preserveViewToken ?? 0;
            repaintRef.current();
            return;
        }
        const rect = canvas.parentElement?.getBoundingClientRect();
        if (!rect) return;
        cameraRef.current = fitCamera(bounds, rect.width, rect.height);
        repaintRef.current();
    }, [bounds, loopCount, preserveViewToken, canvasRef, cameraRef]);

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
        fitToBounds();
    }, [viewportCommand?.token]);

    return { fitToBounds, zoomBy };
}
