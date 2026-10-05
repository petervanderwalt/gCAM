import { computeSurfaceContactHeightsCpu } from './surface-cam-webgpu';
import {
    rasterPathRows,
    rasterizeTopSurface,
    type HeightField,
} from './surface-cam';
import { getSurfaceDispatchShape } from './surface-cam-gpu-utils';
import {
    isSurfaceGpuFallbackError,
    raceSurfaceGpuWork,
} from './surface-cam-cancel';

test('tiles a linear cell workload across bounded two-dimensional WebGPU dispatch', () => {
    expect(getSurfaceDispatchShape(129, 2)).toEqual({
        workgroupsX: 2,
        workgroupsY: 1,
        dispatchWidth: 256,
    });
    expect(getSurfaceDispatchShape(1024, 4)).toEqual({
        workgroupsX: 4,
        workgroupsY: 2,
        dispatchWidth: 512,
    });
    expect(() => getSurfaceDispatchShape(1025, 2)).toThrow(/dispatch limits/);
});

test('routes a lost GPU device into the deterministic CPU fallback', () => {
    expect(
        isSurfaceGpuFallbackError(
            'CPU_FALLBACK: WebGPU device lost (destroyed).',
        ),
    ).toBe(true);
    expect(
        isSurfaceGpuFallbackError(
            'CPU_FALLBACK: No WebGPU adapter is available on this device.',
        ),
    ).toBe(true);
    expect(isSurfaceGpuFallbackError('WebGPU shader validation failed.')).toBe(
        false,
    );
});

test('interrupts pending GPU work when the adapter reports device loss', async () => {
    const deviceLost = Promise.resolve({
        reason: 'destroyed',
        message: 'test loss',
    });
    const pendingGpuWork = new Promise<number>(() => {});
    await expect(
        raceSurfaceGpuWork(pendingGpuWork, deviceLost),
    ).rejects.toThrow(
        'CPU_FALLBACK: WebGPU device lost (destroyed: test loss).',
    );
});

test('CPU fallback matches the reference cutter envelope and keeps a flat ball-tip at Z0', async () => {
    const mesh = {
        vertices: new Float32Array([
            0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 0, 0, 1, 1, 0, 0, 1, 0,
        ]),
        bounds: { minX: 0, minY: 0, minZ: 0, maxX: 1, maxY: 1, maxZ: 0 },
        sourceName: 'flat.stl',
    };
    const field = rasterizeTopSurface(mesh, 0.25);
    const contact = await computeSurfaceContactHeightsCpu(field, {
        cutter: 'ballnose',
        toolDiameterMm: 0.5,
    });
    expect(contact[2 * field.columns + 2]).toBeCloseTo(0);
    expect(Number.isNaN(contact[0])).toBe(false);
});

test('CPU raster-path contact sampling computes only requested pass rows and includes the last edge row', async () => {
    const mesh = {
        vertices: new Float32Array([
            0, 0, 0, 2, 0, -2, 2, 2, -2, 0, 0, 0, 2, 2, -2, 0, 2, 0,
        ]),
        bounds: { minX: 0, minY: 0, minZ: -2, maxX: 2, maxY: 2, maxZ: 0 },
        sourceName: 'ramp.stl',
    };
    const field = rasterizeTopSurface(mesh, 0.25);
    const options = {
        cutter: 'flat' as const,
        toolDiameterMm: 0.5,
        stepoverMm: 0.5,
    };
    const full = await computeSurfaceContactHeightsCpu(field, options);
    const sampled = await computeSurfaceContactHeightsCpu(
        field,
        options,
        undefined,
        undefined,
        true,
    );
    const rowStep = Math.floor(options.stepoverMm / field.cellSize);
    const rows = rasterPathRows(field.rows, rowStep);
    expect(rows.length).toBeLessThan(field.rows);
    expect(rows[rows.length - 1]).toBe(field.rows - 1);
    expect(sampled.length).toBe(rows.length * field.columns);
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
        const row = rows[rowIndex];
        for (let column = 0; column < field.columns; column += 1) {
            const fullIndex = row * field.columns + column;
            const sampledIndex = rowIndex * field.columns + column;
            expect(sampled[sampledIndex]).toBeCloseTo(full[fullIndex]);
        }
    }
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
        cutter: 'flat',
        toolDiameterMm: 0.4,
    });
    expect(result[columns]).toBe(3);
});

test('CPU surface contact calculation stops promptly when its signal is aborted', async () => {
    const mesh = {
        vertices: new Float32Array([
            0, 0, 0, 10, 0, 0, 10, 10, 0, 0, 0, 0, 10, 10, 0, 0, 10, 0,
        ]),
        bounds: { minX: 0, minY: 0, minZ: 0, maxX: 10, maxY: 10, maxZ: 0 },
        sourceName: 'flat.stl',
    };
    const field = rasterizeTopSurface(mesh, 0.25);
    const controller = new AbortController();
    await expect(
        computeSurfaceContactHeightsCpu(
            field,
            {
                cutter: 'flat',
                toolDiameterMm: 0.5,
            },
            (progress) => {
                if (progress.percent > 0) controller.abort();
            },
            controller.signal,
        ),
    ).rejects.toMatchObject({ name: 'AbortError' });
});
