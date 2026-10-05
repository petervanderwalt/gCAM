/// <reference lib="webworker" />
import { getSurfaceDispatchShape } from './surface-cam-gpu-utils';
import type { SurfaceBounds } from './surface-cam';
import { raceSurfaceGpuWork } from './surface-cam-cancel';

const shader = /* wgsl */ `
struct Params {
  columns: u32,
  rows: u32,
  triangleCount: u32,
  dispatchWidth: u32,
  cellSize: f32,
  minX: f32,
  minY: f32,
};
@group(0) @binding(0) var<storage, read> vertices: array<f32>;
@group(0) @binding(1) var<storage, read_write> heights: array<f32>;
@group(0) @binding(2) var<storage, read_write> covered: array<u32>;
@group(0) @binding(3) var<uniform> params: Params;

const EMPTY: f32 = -3.402823e+38;

fn insideBox(x: f32, y: f32, left: f32, bottom: f32, right: f32, top: f32) -> bool {
  return x >= left - 1.0e-6 && x <= right + 1.0e-6 && y >= bottom - 1.0e-6 && y <= top + 1.0e-6;
}

fn heightAt(x: f32, y: f32, ax: f32, ay: f32, az: f32, bx: f32, by: f32, bz: f32, cx: f32, cy: f32, cz: f32) -> f32 {
  let acx = cx - ax; let acy = cy - ay;
  let abx = bx - ax; let aby = by - ay;
  let denominator = acx * aby - abx * acy;
  if (abs(denominator) < 1.0e-12) { return EMPTY; }
  let dx = x - ax; let dy = y - ay;
  let u = (dx * aby - abx * dy) / denominator;
  let v = (acx * dy - dx * acy) / denominator;
  if (u < -1.0e-6 || v < -1.0e-6 || u + v > 1.000001) { return EMPTY; }
  return az + u * (cz - az) + v * (bz - az);
}

fn segmentRectMaximum(ax: f32, ay: f32, az: f32, bx: f32, by: f32, bz: f32, left: f32, bottom: f32, right: f32, top: f32) -> f32 {
  var maximum = EMPTY;
  let dx = bx - ax; let dy = by - ay;
  for (var edge = 0u; edge < 4u; edge = edge + 1u) {
    let vertical = edge < 2u;
    let boundary = select(select(bottom, top, edge == 3u), select(left, right, edge == 1u), vertical);
    let delta = select(dy, dx, vertical);
    if (abs(delta) < 1.0e-12) { continue; }
    let origin = select(ay, ax, vertical);
    let t = (boundary - origin) / delta;
    if (t < -1.0e-6 || t > 1.000001) { continue; }
    let x = ax + t * dx; let y = ay + t * dy;
    let within = select(x >= left - 1.0e-6 && x <= right + 1.0e-6, y >= bottom - 1.0e-6 && y <= top + 1.0e-6, vertical);
    if (within) { maximum = max(maximum, az + t * (bz - az)); }
  }
  return maximum;
}

fn triangleCellMaximum(ax: f32, ay: f32, az: f32, bx: f32, by: f32, bz: f32, cx: f32, cy: f32, cz: f32, left: f32, bottom: f32, right: f32, top: f32) -> f32 {
  var maximum = EMPTY;
  if (insideBox(ax, ay, left, bottom, right, top)) { maximum = max(maximum, az); }
  if (insideBox(bx, by, left, bottom, right, top)) { maximum = max(maximum, bz); }
  if (insideBox(cx, cy, left, bottom, right, top)) { maximum = max(maximum, cz); }
  maximum = max(maximum, heightAt(left, bottom, ax, ay, az, bx, by, bz, cx, cy, cz));
  maximum = max(maximum, heightAt(right, bottom, ax, ay, az, bx, by, bz, cx, cy, cz));
  maximum = max(maximum, heightAt(right, top, ax, ay, az, bx, by, bz, cx, cy, cz));
  maximum = max(maximum, heightAt(left, top, ax, ay, az, bx, by, bz, cx, cy, cz));
  maximum = max(maximum, segmentRectMaximum(ax, ay, az, bx, by, bz, left, bottom, right, top));
  maximum = max(maximum, segmentRectMaximum(bx, by, bz, cx, cy, cz, left, bottom, right, top));
  maximum = max(maximum, segmentRectMaximum(cx, cy, cz, ax, ay, az, left, bottom, right, top));
  return maximum;
}

@compute @workgroup_size(128)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  let cell = id.x + id.y * params.dispatchWidth;
  let cellCount = params.columns * params.rows;
  if (cell >= cellCount) { return; }
  let column = cell % params.columns;
  let row = cell / params.columns;
  let px = params.minX + f32(column) * params.cellSize;
  let py = params.minY + f32(row) * params.cellSize;
  let halfCell = params.cellSize * 0.5;
  let left = px - halfCell; let right = px + halfCell;
  let bottom = py - halfCell; let top = py + halfCell;
  var highest = EMPTY;
  for (var triangle = 0u; triangle < params.triangleCount; triangle = triangle + 1u) {
    let offset = triangle * 9u;
    let ax = vertices[offset]; let ay = vertices[offset + 1u]; let az = vertices[offset + 2u];
    let bx = vertices[offset + 3u]; let by = vertices[offset + 4u]; let bz = vertices[offset + 5u];
    let cx = vertices[offset + 6u]; let cy = vertices[offset + 7u]; let cz = vertices[offset + 8u];
    // Use geometry, not the STL's winding/normals: inverted meshes and
    // downward-facing overhang undersides still contribute to the envelope,
    // while max-Z selection keeps the cutter on the top-down accessible side.
    if (right < min(ax, min(bx, cx)) || left > max(ax, max(bx, cx)) || top < min(ay, min(by, cy)) || bottom > max(ay, max(by, cy))) { continue; }
    let z = triangleCellMaximum(ax, ay, az, bx, by, bz, cx, cy, cz, left, bottom, right, top);
    highest = max(highest, z);
  }
  heights[cell] = highest;
  covered[cell] = select(0u, 1u, highest > -3.0e+38);
}
`;

self.onmessage = async (
    event: MessageEvent<{
        id: string;
        vertices: Float32Array;
        bounds: SurfaceBounds;
        sourceName: string;
        resolutionMm: number;
    }>,
) => {
    const { id, vertices, bounds, sourceName, resolutionMm } = event.data;
    let device: GPUDevice | null = null;
    const buffers: GPUBuffer[] = [];
    try {
        const gpu = (self.navigator as unknown as { gpu?: any }).gpu;
        if (!gpu) throw new Error('WebGPU is unavailable in this browser.');
        const adapter = await gpu.requestAdapter();
        if (!adapter)
            throw new Error(
                'CPU_FALLBACK: No WebGPU adapter is available on this device.',
            );
        const gpuDevice = await adapter.requestDevice();
        device = gpuDevice;
        const deviceLost = gpuDevice.lost;
        const columns =
            Math.ceil((bounds.maxX - bounds.minX) / resolutionMm) + 1;
        const rows = Math.ceil((bounds.maxY - bounds.minY) / resolutionMm) + 1;
        const cellCount = columns * rows;
        if (
            !Number.isSafeInteger(cellCount) ||
            cellCount <= 0 ||
            cellCount > 4_000_000
        )
            throw new Error(
                'CPU_FALLBACK: GPU surface raster is limited to 4 million cells; increase machining resolution.',
            );
        if (cellCount * (vertices.length / 9) > 500_000_000)
            throw new Error(
                'CPU_FALLBACK: GPU surface raster workload is too large; increase machining resolution or simplify the STL.',
            );
        const cellBytes = cellCount * 4;
        const meshBytes = vertices.byteLength;
        const maxBinding = Math.min(
            gpuDevice.limits.maxBufferSize,
            gpuDevice.limits.maxStorageBufferBindingSize,
        );
        if (cellBytes > maxBinding || meshBytes > maxBinding)
            throw new Error(
                'CPU_FALLBACK: The STL or requested height field exceeds this GPU’s storage-buffer limit. Increase resolution.',
            );
        const dispatch = getSurfaceDispatchShape(
            cellCount,
            gpuDevice.limits.maxComputeWorkgroupsPerDimension,
        );
        const create = (
            size: number,
            usage: GPUBufferUsageFlags,
            initial?: Float32Array | Uint8Array,
        ) => {
            const buffer = gpuDevice.createBuffer({ size, usage });
            buffers.push(buffer);
            if (initial) gpuDevice.queue.writeBuffer(buffer, 0, initial);
            return buffer;
        };
        const vertexBuffer = create(
            meshBytes,
            GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
            vertices,
        );
        const heightBuffer = create(
            cellBytes,
            GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
        );
        const coveredBuffer = create(
            cellBytes,
            GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
        );
        const paramData = new ArrayBuffer(32);
        const params = new DataView(paramData);
        params.setUint32(0, columns, true);
        params.setUint32(4, rows, true);
        params.setUint32(8, vertices.length / 9, true);
        params.setUint32(12, dispatch.dispatchWidth, true);
        params.setFloat32(16, resolutionMm, true);
        params.setFloat32(20, bounds.minX, true);
        params.setFloat32(24, bounds.minY, true);
        const paramBuffer = create(
            32,
            GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            new Uint8Array(paramData),
        );
        const heightRead = create(
            cellBytes,
            GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
        );
        const coveredRead = create(
            cellBytes,
            GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
        );
        const module = gpuDevice.createShaderModule({ code: shader });
        const pipeline = await raceSurfaceGpuWork<GPUComputePipeline>(
            gpuDevice.createComputePipelineAsync({
                layout: 'auto',
                compute: { module, entryPoint: 'main' },
            }),
            deviceLost,
        );
        const bindGroup = gpuDevice.createBindGroup({
            layout: pipeline.getBindGroupLayout(0),
            entries: [
                vertexBuffer,
                heightBuffer,
                coveredBuffer,
                paramBuffer,
            ].map((buffer, binding) => ({ binding, resource: { buffer } })),
        });
        const encoder = gpuDevice.createCommandEncoder();
        const pass = encoder.beginComputePass();
        pass.setPipeline(pipeline);
        pass.setBindGroup(0, bindGroup);
        pass.dispatchWorkgroups(dispatch.workgroupsX, dispatch.workgroupsY);
        pass.end();
        encoder.copyBufferToBuffer(heightBuffer, 0, heightRead, 0, cellBytes);
        encoder.copyBufferToBuffer(coveredBuffer, 0, coveredRead, 0, cellBytes);
        gpuDevice.queue.submit([encoder.finish()]);
        await raceSurfaceGpuWork(
            Promise.all([
                heightRead.mapAsync(GPUMapMode.READ),
                coveredRead.mapAsync(GPUMapMode.READ),
            ]),
            deviceLost,
        );
        const heights = new Float32Array(heightRead.getMappedRange().slice(0));
        const covered = new Uint8Array(cellCount);
        const rawCovered = new Uint32Array(coveredRead.getMappedRange());
        for (let index = 0; index < cellCount; index += 1)
            covered[index] = rawCovered[index] ? 1 : 0;
        heightRead.unmap();
        coveredRead.unmap();
        for (let index = 0; index < cellCount; index += 1) {
            if (!covered[index]) heights[index] = Number.NaN;
        }
        const field = {
            bounds,
            cellSize: resolutionMm,
            columns,
            rows,
            heights,
            covered,
        };
        self.postMessage({ id, field }, [heights.buffer, covered.buffer]);
    } catch (error) {
        self.postMessage({
            id,
            error:
                error instanceof Error
                    ? error.message
                    : 'WebGPU surface raster failed.',
        });
    } finally {
        for (const buffer of buffers) buffer.destroy();
        device?.destroy();
    }
};

export {};
