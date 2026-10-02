import { computeSurfaceContactHeightsCpu } from './surface-cam-webgpu';
import { rasterizeTopSurface, type HeightField } from './surface-cam';
import { getSurfaceDispatchShape } from './surface-cam-gpu-utils';
import { isSurfaceGpuFallbackError, raceSurfaceGpuWork } from './surface-cam-cancel';

test('tiles a linear cell workload across bounded two-dimensional WebGPU dispatch', () => {
    expect(getSurfaceDispatchShape(129, 2)).toEqual({ workgroupsX: 2, workgroupsY: 1, dispatchWidth: 256 });
    expect(getSurfaceDispatchShape(1024, 4)).toEqual({ workgroupsX: 4, workgroupsY: 2, dispatchWidth: 512 });
    expect(() => getSurfaceDispatchShape(1025, 2)).toThrow(/dispatch limits/);
});

test('routes a lost GPU device into the deterministic CPU fallback', () => {
    expect(isSurfaceGpuFallbackError('CPU_FALLBACK: WebGPU device lost (destroyed).')).toBe(true);
    expect(isSurfaceGpuFallbackError('CPU_FALLBACK: No WebGPU adapter is available on this device.')).toBe(true);
    expect(isSurfaceGpuFallbackError('WebGPU shader validation failed.')).toBe(false);
});

test('interrupts pending GPU work when the adapter reports device loss', async () => {
    const deviceLost = Promise.resolve({ reason: 'destroyed', message: 'test loss' });
    const pendingGpuWork = new Promise<number>(() => {});
    await expect(raceSurfaceGpuWork(pendingGpuWork, deviceLost))
        .rejects.toThrow('CPU_FALLBACK: WebGPU device lost (destroyed: test loss).');
});

test('CPU fallback matches the reference cutter envelope and keeps a flat ball-tip at Z0', async () => {
    const mesh = {
        vertices: new Float32Array([
            0, 0, 0, 1, 0, 0, 1, 1, 0,
            0, 0, 0, 1, 1, 0, 0, 1, 0,
        ]),
        bounds: { minX: 0, minY: 0, minZ: 0, maxX: 1, maxY: 1, maxZ: 0 },
        sourceName: 'flat.stl',
    };
    const field = rasterizeTopSurface(mesh, 0.25);
    const contact = await computeSurfaceContactHeightsCpu(field, {
        cutter: 'ballnose', toolDiameterMm: 0.5,
    });
    expect(contact[2 * field.columns + 2]).toBeCloseTo(0);
    expect(Number.isNaN(contact[0])).toBe(false);
});

test('conservatively includes a high covered cell whose square grazes the cutter at a mesh edge', async () => {
    const columns = 3;
    const rows = 3;
    const covered = new Uint8Array(columns * rows);
    const heights = new Float32Array(columns * rows);
    // At query cell (0, 1), the elevated neighbor's center is 0.25 mm away,
    // but its 0.25 mm-wide square begins only 0.125 mm away. A 0.4 mm flat
    // endmill must account for that cell to stay above the draped envelope.
    covered[columns + 0] = 1;
    covered[columns + 1] = 1;
    heights[columns + 1] = 3;
    const field: HeightField = {
        bounds: { minX: 0, minY: 0, minZ: 0, maxX: 0.5, maxY: 0.5, maxZ: 3 },
        cellSize: 0.25,
        columns,
        rows,
        heights,
        covered,
    };
    const result = await computeSurfaceContactHeightsCpu(field, {
        cutter: 'flat', toolDiameterMm: 0.4,
    });
    expect(result[columns]).toBe(3);
});

test('CPU surface contact calculation stops promptly when its signal is aborted', async () => {
    const mesh = {
        vertices: new Float32Array([
            0, 0, 0, 10, 0, 0, 10, 10, 0,
            0, 0, 0, 10, 10, 0, 0, 10, 0,
        ]),
        bounds: { minX: 0, minY: 0, minZ: 0, maxX: 10, maxY: 10, maxZ: 0 },
        sourceName: 'flat.stl',
    };
    const field = rasterizeTopSurface(mesh, 0.25);
    const controller = new AbortController();
    await expect(computeSurfaceContactHeightsCpu(field, {
        cutter: 'flat', toolDiameterMm: 0.5,
    }, (progress) => {
        if (progress.percent > 0) controller.abort();
    }, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
});
