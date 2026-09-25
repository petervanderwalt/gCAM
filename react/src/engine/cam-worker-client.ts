const CAM_WORKER_VERSION = '20260824-worker1';

let workerRef: Worker | null = null;
let requestId = 0;
const pendingRequests = new Map<
    number,
    {
        resolve: (value: any) => void;
        reject: (reason: Error) => void;
        onProgress?: (progress: { percent: number; label: string }) => void;
    }
>();

function getWorker(): Worker {
    if (workerRef) {
        return workerRef;
    }
    // Use Vite's worker import syntax
    workerRef = new Worker(new URL('./cam-worker.ts', import.meta.url), {
        type: 'module',
    });
    workerRef.addEventListener('message', handleWorkerMessage);
    workerRef.addEventListener('error', (event) => {
        const error = new Error(event.message || 'CAM worker failed.');
        rejectAllPending(error);
    });
    return workerRef;
}

function handleWorkerMessage(event: MessageEvent) {
    const { id, result, error, progress } = event.data || {};
    const pending = pendingRequests.get(id);
    if (!pending) {
        return;
    }

    if (progress) {
        pending.onProgress?.(progress);
        return;
    }

    pendingRequests.delete(id);

    if (error) {
        const err = new Error(error);
        if (event.data?.stack) err.stack = event.data.stack;
        console.error(
            `[cam-worker-client] worker error: ${error}`,
            event.data?.stack || '',
        );
        pending.reject(err);
        return;
    }

    pending.resolve(result);
}

function rejectAllPending(error: Error) {
    for (const pending of pendingRequests.values()) {
        pending.reject(error);
    }
    pendingRequests.clear();
}

function postWorkerRequest<T>(
    type: string,
    payload: Record<string, any>,
    options: {
        onProgress?: (progress: { percent: number; label: string }) => void;
    } = {},
): Promise<T> {
    const worker = getWorker();
    const id = ++requestId;
    return new Promise((resolve, reject) => {
        pendingRequests.set(id, {
            resolve,
            reject,
            onProgress: options.onProgress,
        });
        worker.postMessage({ id, type, ...payload });
    });
}

export interface SerializedLoop {
    id?: string;
    points: { x: number; y: number }[];
    isBitmap?: boolean;
    bounds?: { minX: number; minY: number; maxX: number; maxY: number };
}

export interface SerializedToolpath {
    id: string;
    label: string;
    operation: string;
    toolDiameter: number;
    toolRadius: number;
    cutDepth: number;
    passDepth: number;
    trochoidEnabled: boolean;
    trochoidRadius: number;
    trochoidEngagementPercent: number;
    tabWidth: number;
    tabHeight: number;
    safeZ: number;
    feedRate: number;
    plungeRate: number;
    spindle: number;
    previewContours: { x: number; y: number }[][];
    motionPaths: {
        safeToClose: boolean;
        points: { x: number; y: number; z: number }[];
    }[];
    tabs: {
        contourIndex: number;
        along: number;
        point: { x: number; y: number } | null;
    }[];
}

function serializeLoop(loop: SerializedLoop): SerializedLoop {
    return {
        id: loop.id,
        points: loop.points.map((point) => ({ x: point.x, y: point.y })),
        isBitmap: loop.isBitmap ?? false,
        bounds: loop.bounds ?? undefined,
    };
}

export function createToolpathInWorker(
    selectedLoops: SerializedLoop[],
    config: Record<string, any>,
    options: {
        id?: string;
        label?: string;
        onProgress?: (progress: { percent: number; label: string }) => void;
    } = {},
): Promise<any> {
    return postWorkerRequest(
        'build-toolpath',
        {
            selectedLoops: selectedLoops.map(serializeLoop),
            config: { ...config },
            toolpathOptions: {
                id: options.id,
                label: options.label,
            },
        },
        { onProgress: options.onProgress },
    );
}

export function buildGcodeInWorker(params: {
    toolpaths: SerializedToolpath[];
    fileName: string;
    forcePolylineArcs: boolean;
    onProgress?: (progress: { percent: number; label: string }) => void;
}): Promise<string> {
    return postWorkerRequest(
        'build-gcode',
        {
            toolpaths: params.toolpaths,
            fileName: params.fileName,
            forcePolylineArcs: params.forcePolylineArcs,
        },
        { onProgress: params.onProgress },
    );
}

export function terminateWorker() {
    if (workerRef) {
        workerRef.terminate();
        workerRef = null;
        rejectAllPending(new Error('Worker terminated'));
    }
}
