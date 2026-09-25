import { useEffect, useRef, useState } from 'react';
import { CutPreview3D } from '../engine/cut-preview-3d.js';

interface PreviewInstance {
    build(toolpaths: Record<string, unknown>[]): void;
    resize(): void;
    setTheme(dark: boolean): void;
    setPlaybackSpeed(speed: number): void;
    togglePlayback(): void;
    resetPlayback(opts?: { render?: boolean }): void;
    replay(): void;
    resetCamera(top?: boolean): void;
    onPlaybackChange?: ((playback: { running?: boolean; speed?: number }) => void) | null;
}

export interface PreviewControls {
    empty: boolean;
    running: boolean;
    simulate: () => void;
    iso: () => void;
    top: () => void;
}

/**
 * 3D stock-removal preview (ported engine). Builds from the toolpath stack;
 * playback state mirrors back for the controls.
 */
export function CutPreview3DView({
    toolpaths,
    darkMode,
    onControlsChange,
}: {
    toolpaths: Record<string, unknown>[];
    darkMode: boolean;
    onControlsChange?: (controls: PreviewControls | null) => void;
}) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const statusRef = useRef<HTMLDivElement>(null);
    const instanceRef = useRef<PreviewInstance | null>(null);
    const [running, setRunning] = useState(false);
    const [empty, setEmpty] = useState(toolpaths.length === 0);
    const buildTimer = useRef<number | null>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        const status = statusRef.current;
        if (!canvas || !status) return;
        const instance = new CutPreview3D(
            canvas,
            status,
        ) as unknown as PreviewInstance;
        instance.onPlaybackChange = (playback: { running?: boolean; speed?: number }) => {
            setRunning(Boolean(playback?.running));
        };
        instanceRef.current = instance;
        instance.setTheme(darkMode);
        const ro = new ResizeObserver(() => instance.resize());
        if (canvas.parentElement) ro.observe(canvas.parentElement);
        return () => {
            ro.disconnect();
            try {
                (
                    instance as unknown as { worker?: Worker }
                ).worker?.terminate();
            } catch {
                /* ignore */
            }
            instanceRef.current = null;
        };
    }, []);

    useEffect(() => {
        instanceRef.current?.setTheme(darkMode);
    }, [darkMode]);

    useEffect(() => {
        setEmpty(toolpaths.length === 0);
        if (buildTimer.current) window.clearTimeout(buildTimer.current);
        buildTimer.current = window.setTimeout(() => {
            instanceRef.current?.build(toolpaths);
        }, 150);
        return () => {
            if (buildTimer.current) window.clearTimeout(buildTimer.current);
        };
    }, [toolpaths]);

    // Refs mirror the latest callback/props so the controls effect below
    // only depends on primitives. Depending on object/array props here caused
    // an infinite render loop: notify parent → parent re-renders with fresh
    // prop identity → effect re-runs → notify again (main thread saturation).
    const controlsCallbackRef = useRef(onControlsChange);
    controlsCallbackRef.current = onControlsChange;

    useEffect(() => {
        controlsCallbackRef.current?.({
            empty,
            running,
            simulate: () => {
                const instance = instanceRef.current;
                if (!instance) return;
                instance.resetPlayback();
                instance.setPlaybackSpeed(100);
                instance.togglePlayback();
            },
            iso: () => instanceRef.current?.resetCamera(false),
            top: () => instanceRef.current?.resetCamera(true),
        });
    }, [empty, running]);

    useEffect(
        () => () => controlsCallbackRef.current?.(null),
        [],
    );

    return (
        <div
            className={`relative h-full flex flex-col rounded border overflow-hidden ${
                darkMode
                    ? 'border-robin-900 bg-[#0b1220]'
                    : 'border-slate-300 bg-white'
            }`}
        >
            <div className="flex-1 min-h-0">
                <canvas ref={canvasRef} className="w-full h-full block" />
            </div>
            <div
                ref={statusRef}
                className={`px-2 py-1 text-xs border-t ${
                    darkMode
                        ? 'text-slate-400 border-robin-900'
                        : 'text-slate-500 border-slate-200'
                }`}
            >
                Add a toolpath to simulate stock removal.
            </div>
        </div>
    );
}
