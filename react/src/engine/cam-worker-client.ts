/**
 * Purpose: Implementation module for cam-worker-client in the engine domain.
 */
import {
    isWorkerError,
    isWorkerProgress,
    type CamWorkerMessage,
    type CamWorkerProgress,
    type BuildGcodeRequest,
    type BuildToolpathRequest,
    type SerializedCamLoop,
    type SerializedCamToolpath,
} from './cam-worker-protocol';

let workerRef: Worker | null = null;
let requestId = 0;

interface PendingRequest<T> {
    resolve: (value: T) => void;
    reject: (reason: Error) => void;
    onProgress?: (progress: CamWorkerProgress) => void;
}

const pendingRequests = new Map<number, PendingRequest<unknown>>();
type RequestWithoutId =
    | Omit<BuildToolpathRequest, 'id'>
    | Omit<BuildGcodeRequest, 'id'>;

function getWorker(): Worker {
    if (workerRef) return workerRef;
    workerRef = new Worker(new URL('./cam-worker.ts', import.meta.url), {
        type: 'module',
    });
    workerRef.addEventListener('message', handleWorkerMessage);
    workerRef.addEventListener('error', (event) => {
        rejectAllPending(new Error(event.message || 'CAM worker failed.'));
    });
    return workerRef;
}

function handleWorkerMessage(event: MessageEvent<CamWorkerMessage>) {
    const message = event.data;
    const pending = pendingRequests.get(message.id);
    if (!pending) return;
    if (isWorkerProgress(message)) {
        pending.onProgress?.(message.progress);
        return;
    }
    pendingRequests.delete(message.id);
    if (isWorkerError(message)) {
        const error = new Error(message.error);
        if (message.stack) error.stack = message.stack;
        pending.reject(error);
        return;
    }
    pending.resolve(message.result);
}

function rejectAllPending(error: Error) {
    for (const pending of pendingRequests.values()) pending.reject(error);
    pendingRequests.clear();
}

function postWorkerRequest<T>(
    request: RequestWithoutId,
    onProgress?: (progress: CamWorkerProgress) => void,
): { promise: Promise<T>; cancel: () => void } {
    const worker = getWorker();
    const id = ++requestId;
    let settled = false;
    const promise = new Promise<T>((resolve, reject) => {
        pendingRequests.set(id, {
            resolve: (value) => {
                settled = true;
                resolve(value as T);
            },
            reject: (error) => {
                settled = true;
                reject(error);
            },
            onProgress,
        });
        worker.postMessage({ ...request, id });
    });
    return {
        promise,
        cancel: () => {
            if (settled || !pendingRequests.has(id)) return;
            pendingRequests.delete(id);
            worker.postMessage({
                id: ++requestId,
                type: 'cancel',
                targetId: id,
            });
        },
    };
}

export type SerializedLoop = SerializedCamLoop;
export type SerializedToolpath = SerializedCamToolpath;

function serializeLoop(loop: SerializedLoop): SerializedLoop {
    return {
        id: loop.id,
        points: loop.points.map((point) => ({ x: point.x, y: point.y })),
        isBitmap: loop.isBitmap ?? false,
        bounds: loop.bounds ? { ...loop.bounds } : undefined,
    };
}

export function createToolpathInWorker(
    selectedLoops: SerializedLoop[],
    config: Record<string, unknown>,
    options: {
        id?: string;
        label?: string;
        onProgress?: (progress: CamWorkerProgress) => void;
    } = {},
): Promise<SerializedToolpath> {
    return postWorkerRequest<SerializedToolpath>(
        {
            type: 'build-toolpath',
            selectedLoops: selectedLoops.map(serializeLoop),
            config: { ...config },
            toolpathOptions: { id: options.id, label: options.label },
        },
        options.onProgress,
    ).promise;
}

export function buildGcodeInWorker(params: {
    toolpaths: SerializedToolpath[];
    fileName: string;
    forcePolylineArcs: boolean;
    onProgress?: (progress: CamWorkerProgress) => void;
}): Promise<string> {
    return postWorkerRequest<string>(
        {
            type: 'build-gcode',
            toolpaths: params.toolpaths,
            fileName: params.fileName,
            forcePolylineArcs: params.forcePolylineArcs,
        },
        params.onProgress,
    ).promise;
}

export function terminateWorker() {
    if (!workerRef) return;
    workerRef.terminate();
    workerRef = null;
    rejectAllPending(new Error('Worker terminated.'));
}
