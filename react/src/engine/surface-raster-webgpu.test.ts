import { parseStl, rasterizeTopSurface } from './surface-cam';
// @ts-expect-error Node typings are intentionally excluded from the browser app tsconfig.
import { readFileSync } from 'node:fs';

// Opt-in integration test: run in a browser with a real WebGPU adapter and the
// supplied non-trivial STL fixture. It exists to keep the GPU example from
// silently drifting away from the deterministic CPU reference.
const fixturePath = (
    globalThis as unknown as {
        process?: { env?: Record<string, string | undefined> };
    }
).process?.env?.GCAM_SURFACE_STL_FIXTURE;
const webGpuFixtureTest = fixturePath ? test : test.skip;

webGpuFixtureTest(
    'WebGPU raster worker matches the CPU raster reference for the supplied STL',
    async () => {
        const bytes = readFileSync(fixturePath!);
        const buffer = bytes.buffer.slice(
            bytes.byteOffset,
            bytes.byteOffset + bytes.byteLength,
        ) as ArrayBuffer;
        const mesh = parseStl(buffer, 'webgpu-raster-reference.stl');
        const resolutionMm = 0.5;
        const cpu = rasterizeTopSurface(mesh, resolutionMm);
        const vertices = new Float32Array(mesh.vertices);
        const id = 'surface-raster-webgpu-fixture';

        const gpu = new Worker(
            new URL('./surface-raster-webgpu.worker.ts', import.meta.url),
            { type: 'module' },
        );
        try {
            const actual = await new Promise<
                import('./surface-cam').HeightField
            >((resolve, reject) => {
                gpu.onmessage = (
                    event: MessageEvent<{
                        id: string;
                        field?: import('./surface-cam').HeightField;
                        error?: string;
                    }>,
                ) => {
                    if (event.data.id !== id) return;
                    if (event.data.error) reject(new Error(event.data.error));
                    else if (event.data.field) resolve(event.data.field);
                    else
                        reject(
                            new Error(
                                'WebGPU raster worker returned no field.',
                            ),
                        );
                };
                gpu.onerror = (event) =>
                    reject(
                        new Error(
                            event.message || 'WebGPU raster worker failed.',
                        ),
                    );
                gpu.postMessage(
                    {
                        id,
                        vertices,
                        bounds: mesh.bounds,
                        sourceName: mesh.sourceName,
                        resolutionMm,
                    },
                    [vertices.buffer],
                );
            });

            expect(actual.columns).toBe(cpu.columns);
            expect(actual.rows).toBe(cpu.rows);
            expect(actual.covered).toEqual(cpu.covered);
            for (let index = 0; index < cpu.heights.length; index += 1) {
                if (!cpu.covered[index])
                    expect(Number.isNaN(actual.heights[index])).toBe(true);
                else
                    expect(actual.heights[index]).toBeCloseTo(
                        cpu.heights[index],
                        4,
                    );
            }
        } finally {
            gpu.terminate();
        }
    },
);
