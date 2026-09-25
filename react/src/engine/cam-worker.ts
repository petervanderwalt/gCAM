import * as CamOps from './cam-ops.js';

let clipperReadyPromise: Promise<void> | null = null;

async function ensureClipper(): Promise<void> {
    if (globalThis.ClipperLib) {
        return;
    }
    if (clipperReadyPromise) {
        return clipperReadyPromise;
    }
    // In the worker, we need to load ClipperLib from the public folder
    // We'll use the clipper-shim which sets up ClipperLib globally
    await import('./clipper-shim.js');
    // Give it a moment to initialize
    await new Promise((resolve) => setTimeout(resolve, 0));
    if (!globalThis.ClipperLib) {
        throw new Error('ClipperLib failed to initialize in worker');
    }
}

function postProgress(id: number, percent: number, label: string) {
    self.postMessage({
        id,
        progress: { percent, label },
    });
}

interface BuildToolpathPayload {
    id: number;
    type: 'build-toolpath';
    selectedLoops: any[];
    config: any;
    toolpathOptions: any;
}

interface BuildGcodePayload {
    id: number;
    type: 'build-gcode';
    toolpaths: any[];
    fileName: string;
    forcePolylineArcs: boolean;
}

type WorkerPayload = BuildToolpathPayload | BuildGcodePayload;

function isBuildToolpath(
    payload: WorkerPayload,
): payload is BuildToolpathPayload {
    return payload.type === 'build-toolpath';
}

function isBuildGcode(payload: WorkerPayload): payload is BuildGcodePayload {
    return payload.type === 'build-gcode';
}

self.onmessage = async (event: MessageEvent<WorkerPayload>) => {
    const data = event.data;
    if (!data) return;

    try {
        await ensureClipper();

        if (isBuildToolpath(data)) {
            const { id, selectedLoops, config, toolpathOptions } = data;
            postProgress(id, 8, 'Preparing toolpath');
            const options: any = {
                ...(toolpathOptions || {}),
                onProgress: (percent: number, label: string) => {
                    postProgress(id, percent, label);
                },
            };
            // @ts-ignore - onProgress signature mismatch due to JS default parameter
            const result = await CamOps.createToolpathFromLoopsAsync(
                selectedLoops || [],
                config || [],
                options,
            );
            postProgress(id, 100, 'Toolpath ready');
            self.postMessage({ id, result });
            return;
        }

        if (isBuildGcode(data)) {
            const { id, toolpaths, fileName, forcePolylineArcs } = data;
            postProgress(id, 5, 'Preparing G-code');
            const options: any = {
                toolpaths: toolpaths || [],
                fileName,
                forcePolylineArcs,
                onProgress: (percent: number, label: string) => {
                    postProgress(id, percent, label);
                },
            };
            // @ts-ignore - onProgress signature mismatch due to JS default parameter
            const result = await CamOps.buildGcodeAsync(options);
            postProgress(id, 100, 'G-code ready');
            self.postMessage({ id, result });
            return;
        }

        // This should never happen due to type narrowing, but TypeScript needs it
        const _exhaustive: never = data;
        throw new Error(`Unknown CAM worker request: ${_exhaustive}`);
    } catch (error) {
        console.error(
            `[cam-worker] ${error instanceof Error ? error.message : String(error)}`,
            error instanceof Error ? error.stack : '',
        );
        self.postMessage({
            id: data.id,
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : null,
        });
    }
};
