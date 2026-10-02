import { cutterContactHeight, type HeightField, type SurfacePathOptions } from './surface-cam';
import { isSurfaceGpuFallbackError, surfaceCamAbortError, throwIfSurfaceCamAborted } from './surface-cam-cancel';

export interface SurfaceComputeProgress {
    percent: number;
    label: string;
}

export interface SurfaceContactResult {
    heights: Float32Array;
    backend: 'webgpu' | 'cpu';
}


/** Exact CPU reference implementation used when this browser has no GPU adapter. */
export async function computeSurfaceContactHeightsCpu(
    field: HeightField,
    options: Pick<SurfacePathOptions, 'cutter' | 'toolDiameterMm' | 'stockToLeaveMm'>,
    onProgress?: (progress: SurfaceComputeProgress) => void,
    signal?: AbortSignal,
): Promise<Float32Array> {
    throwIfSurfaceCamAborted(signal);
    const radiusCells = Math.ceil(options.toolDiameterMm / 2 / field.cellSize);
    const workEstimate = field.columns * field.rows * (radiusCells * 2 + 1) ** 2;
    if (workEstimate > 60_000_000)
        throw new Error('WebGPU is unavailable and this model exceeds the safe CPU fallback limit. Increase machining resolution or use a smaller cutter.');
    const output = new Float32Array(field.columns * field.rows);
    output.fill(Number.NaN);
    const allowance = options.stockToLeaveMm ?? 0;
    for (let row = 0; row < field.rows; row += 1) {
        throwIfSurfaceCamAborted(signal);
        for (let column = 0; column < field.columns; column += 1) {
            const index = row * field.columns + column;
            if (!field.covered[index]) continue;
            const x = field.bounds.minX + column * field.cellSize;
            const y = field.bounds.minY + row * field.cellSize;
            output[index] = cutterContactHeight(
                field,
                x,
                y,
                options.cutter,
                options.toolDiameterMm,
                allowance,
            );
        }
        if (row % 4 === 3 || row === field.rows - 1) {
            onProgress?.({
                percent: Math.round(((row + 1) / field.rows) * 100),
                label: 'WebGPU unavailable; exact CPU contact calculation (slower)',
            });
            await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
        }
    }
    throwIfSurfaceCamAborted(signal);
    return output;
}

/** Prefer WebGPU; use the same exact CPU reference when no adapter is available. */
export function computeSurfaceContactHeights(
    field: HeightField,
    options: Pick<SurfacePathOptions, 'cutter' | 'toolDiameterMm' | 'stockToLeaveMm'>,
    onProgress?: (progress: SurfaceComputeProgress) => void,
    signal?: AbortSignal,
): Promise<SurfaceContactResult> {
    return new Promise((resolve, reject) => {
        try { throwIfSurfaceCamAborted(signal); } catch (error) { reject(error); return; }
        const runCpuFallback = (reason: string) => {
            onProgress?.({ percent: 5, label: `WebGPU unavailable (${reason}); switching to exact CPU reference` });
            void computeSurfaceContactHeightsCpu(field, options, onProgress, signal).then(
                (heights) => resolve({ heights, backend: 'cpu' }),
                reject,
            );
        };
        if (typeof navigator === 'undefined' || !('gpu' in navigator)) {
            runCpuFallback('no WebGPU support');
            return;
        }
        const worker = new Worker(new URL('./surface-cam-webgpu.worker.ts', import.meta.url), { type: 'module' });
        const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const timeout = window.setTimeout(() => {
            cleanup();
            reject(new Error('WebGPU surface calculation timed out. Reduce model size or increase resolution.'));
        }, 120_000);
        const cleanup = () => {
            window.clearTimeout(timeout);
            signal?.removeEventListener('abort', abort);
            worker.terminate();
        };
        const abort = () => {
            cleanup();
            reject(surfaceCamAbortError());
        };
        signal?.addEventListener('abort', abort, { once: true });
        worker.onmessage = (event: MessageEvent<{ id: string; result?: Float32Array; error?: string }>) => {
            if (event.data.id !== id) return;
            cleanup();
            if (event.data.error && isSurfaceGpuFallbackError(event.data.error))
                runCpuFallback(event.data.error);
            else if (event.data.error) reject(new Error(event.data.error));
            else if (event.data.result) {
                onProgress?.({ percent: 100, label: 'WebGPU cutter compensation complete' });
                const compensated = event.data.result;
                for (let index = 0; index < compensated.length; index += 1)
                    if (compensated[index] < -1e30) compensated[index] = Number.NaN;
                resolve({ heights: compensated, backend: 'webgpu' });
            } else reject(new Error('WebGPU returned no surface data.'));
        };
        worker.onerror = (event) => {
            cleanup();
            if (isSurfaceGpuFallbackError(event.message)) runCpuFallback(event.message);
            else reject(new Error(event.message || 'WebGPU worker failed.'));
        };
        onProgress?.({ percent: 5, label: 'Starting WebGPU surface calculation' });
        const heights = new Float32Array(field.heights);
        const covered = new Uint8Array(field.covered);
        worker.postMessage({
            id,
            field: {
                bounds: field.bounds,
                cellSize: field.cellSize,
                columns: field.columns,
                rows: field.rows,
                heights,
                covered,
            },
            cutter: options.cutter,
            diameterMm: options.toolDiameterMm,
            allowanceMm: options.stockToLeaveMm ?? 0,
        }, [heights.buffer, covered.buffer]);
    });
}
