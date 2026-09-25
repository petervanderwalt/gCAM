import { useEffect, useRef } from 'react';
import { GcodeViewer3D } from '../engine/gcode-viewer-3d.js';

interface ViewerInstance {
    build(gcode: string): void;
    resize(): void;
    setTheme(dark: boolean): void;
    resetCamera(top?: boolean): void;
    dispose(): void;
}

/**
 * gSender-inspired G-code toolpath viewer: worker parses G-code,
 * three.js draws color-coded G0/G1/G2/G3 segments with grid + zero callout.
 */
export function GcodeViewer3DView({
    gcode,
    darkMode,
}: {
    gcode: string;
    darkMode: boolean;
}) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const statusRef = useRef<HTMLDivElement>(null);
    const instanceRef = useRef<ViewerInstance | null>(null);
    const buildTimer = useRef<number | null>(null);
    const lastBuiltRef = useRef<string | null>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        const status = statusRef.current;
        if (!canvas || !status) return;
        const instance = new GcodeViewer3D(
            canvas,
            status,
        ) as unknown as ViewerInstance;
        instanceRef.current = instance;
        instance.setTheme(darkMode);
        const ro = new ResizeObserver(() => instance.resize());
        if (canvas.parentElement) ro.observe(canvas.parentElement);
        return () => {
            ro.disconnect();
            try {
                instance.dispose();
            } catch {
                /* ignore */
            }
            instanceRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        instanceRef.current?.setTheme(darkMode);
    }, [darkMode]);

    useEffect(() => {
        if (buildTimer.current) window.clearTimeout(buildTimer.current);
        // Settle delay so slider drags / rapid edits parse once, and skip
        // re-parses when the program text is unchanged across renders.
        buildTimer.current = window.setTimeout(() => {
            if (lastBuiltRef.current === gcode) return;
            lastBuiltRef.current = gcode;
            instanceRef.current?.build(gcode);
        }, 600);
        return () => {
            if (buildTimer.current) window.clearTimeout(buildTimer.current);
        };
    }, [gcode]);

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
                Add a toolpath to preview G-code.
            </div>
        </div>
    );
}
