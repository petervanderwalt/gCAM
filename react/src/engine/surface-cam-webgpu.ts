import { cutterContactHeight, rasterPathRows, type HeightField, type SurfacePathOptions } from './surface-cam';
import { isSurfaceGpuFallbackError, surfaceCamAbortError, throwIfSurfaceCamAborted } from './surface-cam-cancel';

export interface SurfaceComputeProgress {
    percent: number;
    label: string;
}

export interface SurfaceContactResult {
    heights: Float32Array;
    backend: 'webgpu' | 'cpu';
    sampleRows?: number[];
}

type SurfaceContactOptions = Pick<SurfacePathOptions, 'cutter' | 'toolDiameterMm' | 'stockToLeaveMm'> &
    Partial<Pick<SurfacePathOptions, 'stepoverMm'>>;


/** Exact CPU reference implementation used when this browser has no GPU adapter. */
export async function computeSurfaceContactHeightsCpu(
    field: HeightField,
    options: SurfaceContactOptions,
    onProgress?: (progress: SurfaceComputeProgress) => void,
    signal?: AbortSignal,
    rasterPathRowsOnly = false,
): Promise<Float32Array> {
    throwIfSurfaceCamAborted(signal);
    const rowStep = rasterPathRowsOnly ? Math.max(1, Math.floor((options.stepoverMm ?? field.cellSize) / field.cellSize + 1e-9)) : 1;
    const rows = rasterPathRows(field.rows, rowStep);
    const radiusCells = Math.ceil(options.toolDiameterMm / 2 / field.cellSize);
    const workEstimate = field.columns * rows.length * (radiusCells * 2 + 1) ** 2;
    if (workEstimate > 60_000_000)
        throw new Error('WebGPU is unavailable and this model exceeds the safe CPU fallback limit. Increase machining resolution or use a smaller cutter.');
    const output = new Float32Array(field.columns * (rasterPathRowsOnly ? rows.length : field.rows));
    output.fill(Number.NaN);
    const allowance = options.stockToLeaveMm ?? 0;
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
        throwIfSurfaceCamAborted(signal);
        const row = rows[rowIndex];
        for (let column = 0; column < field.columns; column += 1) {
            const gridIndex = row * field.columns + column;
            if (!field.covered[gridIndex]) continue;
            const outputIndex = rasterPathRowsOnly ? rowIndex * field.columns + column : gridIndex;
            const x = field.bounds.minX + column * field.cellSize;
            const y = field.bounds.minY + row * field.cellSize;
            output[outputIndex] = cutterContactHeight(
                field,
                x,
                y,
                options.cutter,
                options.toolDiameterMm,
                allowance,
            );
        }
        if (rowIndex % 4 === 3 || rowIndex === rows.length - 1) {
            onProgress?.({
                percent: Math.round(((rowIndex + 1) / rows.length) * 100),
                label: rasterPathRowsOnly
                    ? 'WebGPU unavailable; exact CPU raster-path sampling (slower)'
                    : 'WebGPU unavailable; exact CPU contact calculation (slower)',
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
    options: SurfaceContactOptions,
    onProgress?: (progress: SurfaceComputeProgress) => void,
    signal?: AbortSignal,
    rasterPathRowsOnly = false,
): Promise<SurfaceContactResult> {
    return new Promise((resolve, reject) => {
        try { throwIfSurfaceCamAborted(signal); } catch (error) { reject(error); return; }
        const runCpuFallback = (reason: string) => {
            onProgress?.({ percent: 5, label: `WebGPU unavailable (${reason}); switching to exact CPU reference` });
            const sampleRows = rasterPathRowsOnly
                ? rasterPathRows(field.rows, Math.max(1, Math.floor((options.stepoverMm ?? field.cellSize) / field.cellSize + 1e-9)))
                : undefined;
            void computeSurfaceContactHeightsCpu(field, options, onProgress, signal, rasterPathRowsOnly).then(
                (heights) => resolve({ heights, backend: 'cpu', sampleRows }),
                reject,
            );
        };
        if (typeof navigator === 'undefined' || !('gpu' in navigator)) {
            runCpuFallback('no WebGPU support');
            return;
        }
        const sampleRows = rasterPathRowsOnly
            ? rasterPathRows(field.rows, Math.max(1, Math.floor((options.stepoverMm ?? field.cellSize) / field.cellSize + 1e-9)))
            : Array.from({ length: field.rows }, (_, row) => row);
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
                onProgress?.({ percent: 100, label: rasterPathRowsOnly ? 'WebGPU raster-path sampling complete' : 'WebGPU cutter compensation complete' });
                const compensated = event.data.result;
                for (let index = 0; index < compensated.length; index += 1)
                    if (compensated[index] < -1e30) compensated[index] = Number.NaN;
                resolve({ heights: compensated, backend: 'webgpu', sampleRows: rasterPathRowsOnly ? sampleRows : undefined });
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
        const sampleRowData = new Uint32Array(sampleRows);
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
            sampleRows: sampleRowData,
            compactRows: rasterPathRowsOnly,
        }, [heights.buffer, covered.buffer, sampleRowData.buffer]);
    });
}
