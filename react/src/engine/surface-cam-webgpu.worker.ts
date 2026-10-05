/// <reference lib="webworker" />
/* WebGPU cutter-contact height computation. Worker lifetime is one request. */
import { getSurfaceDispatchShape } from './surface-cam-gpu-utils';
import { raceSurfaceGpuWork } from './surface-cam-cancel';

const shader = /* wgsl */ `
struct Params {
  columns: u32,
  rows: u32,
  radiusCells: i32,
  cutterKind: u32,
  cellSize: f32,
  minX: f32,
  minY: f32,
  radiusMm: f32,
  allowance: f32,
  _pad0: f32,
  _pad1: f32,
  _pad2: f32,
  dispatchWidth: u32,
  _pad3: u32,
  _pad4: u32,
  _pad5: u32,
};
@group(0) @binding(0) var<storage, read> heights: array<f32>;
@group(0) @binding(1) var<storage, read> covered: array<u32>;
@group(0) @binding(2) var<storage, read_write> output: array<f32>;
@group(0) @binding(3) var<uniform> params: Params;
@group(0) @binding(4) var<storage, read> sampleRows: array<u32>;

fn at(x: i32, y: i32) -> f32 {
  if (x < 0 || y < 0 || x >= i32(params.columns) || y >= i32(params.rows)) { return -3.402823e+38; }
  let index = u32(y) * params.columns + u32(x);
  if (covered[index] == 0u) { return -3.402823e+38; }
  return heights[index];
}

@compute @workgroup_size(128)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  let index = id.x + id.y * params.dispatchWidth;
  let count = params.columns * arrayLength(&sampleRows);
  if (index >= count) { return; }
  let column = i32(index % params.columns);
  let row = i32(sampleRows[index / params.columns]);
  let gridIndex = u32(row) * params.columns + u32(column);
  if (covered[gridIndex] == 0u) { output[index] = -3.402823e+38; return; }
  var contact = -3.402823e+38;
  let halfCell = params.cellSize * 0.5;
  for (var dy = -params.radiusCells; dy <= params.radiusCells; dy = dy + 1) {
    for (var dx = -params.radiusCells; dx <= params.radiusCells; dx = dx + 1) {
      // Match the CPU reference's conservative square-cell footprint, not a
      // bilinear center sample. The half-cell diagonal matters near mesh edges
      // and narrow overhangs: omitting those cells could lower the tool below
      // the draped upper envelope.
      let cellOffset = abs(vec2<f32>(f32(dx), f32(dy))) * params.cellSize;
      let radial = length(max(cellOffset - vec2<f32>(halfCell), vec2<f32>(0.0)));
      if (radial > params.radiusMm) { continue; }
      let z = at(column + dx, row + dy);
      if (z < -3.0e+38) { continue; }
      var rise = 0.0;
      if (params.cutterKind == 1u) {
        rise = params.radiusMm - sqrt(max(0.0, params.radiusMm * params.radiusMm - radial * radial));
      }
      // Z represents the ball tip: its surface rises relative to the tip as
      // radius increases, so the compensated tip height is target Z - rise.
      contact = max(contact, z - rise);
    }
  }
  if (contact > -3.0e+38) { output[index] = contact + params.allowance; }
  else { output[index] = -3.402823e+38; }
}
`;

self.onmessage = async (event: MessageEvent) => {
const { id, field, cutter, diameterMm, allowanceMm, sampleRows } = event.data;
    let device: GPUDevice | null = null;
    const buffers: GPUBuffer[] = [];
    try {
        const gpu = (self.navigator as unknown as { gpu?: any }).gpu;
        if (!gpu) throw new Error('WebGPU is unavailable in this browser. 3D CAM needs a WebGPU-capable browser and secure context.');
        const adapter = await gpu.requestAdapter();
        if (!adapter) throw new Error('CPU_FALLBACK: No WebGPU adapter is available on this device.');
        const gpuDevice = await adapter.requestDevice();
        device = gpuDevice;
        const deviceLost = gpuDevice.lost;
        const count = field.columns * sampleRows.length;
        const byteLength = count * Float32Array.BYTES_PER_ELEMENT;
        const gridByteLength = field.columns * field.rows * Float32Array.BYTES_PER_ELEMENT;
        if (gridByteLength > gpuDevice.limits.maxBufferSize || gridByteLength > gpuDevice.limits.maxStorageBufferBindingSize ||
            byteLength > gpuDevice.limits.maxBufferSize || byteLength > gpuDevice.limits.maxStorageBufferBindingSize)
            throw new Error('The mesh resolution exceeds this GPU’s buffer limit. Increase the machining grid size.');
        const heights = new Float32Array(field.heights);
        for (let i = 0; i < heights.length; i += 1) if (!field.covered[i]) heights[i] = -3.402823e+38;
        const covered = new Uint32Array(field.covered);
        const params = new ArrayBuffer(64);
        const view = new DataView(params);
        view.setUint32(0, field.columns, true);
        view.setUint32(4, field.rows, true);
        view.setInt32(8, Math.ceil((diameterMm / 2 + field.cellSize / 2 * Math.SQRT2) / field.cellSize), true);
        view.setUint32(12, cutter === 'flat' ? 0 : 1, true);
        view.setFloat32(16, field.cellSize, true);
        view.setFloat32(20, field.bounds.minX, true);
        view.setFloat32(24, field.bounds.minY, true);
        view.setFloat32(28, diameterMm / 2, true);
        view.setFloat32(32, allowanceMm, true);
        const dispatch = getSurfaceDispatchShape(count, gpuDevice.limits.maxComputeWorkgroupsPerDimension);
        const { workgroupsX: dispatchX, workgroupsY: dispatchY, dispatchWidth } = dispatch;
        view.setUint32(48, dispatchWidth, true);
        const inputBuffer = (data: Float32Array | Uint32Array | Uint8Array) => {
            const buffer = gpuDevice.createBuffer({ size: data.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
            buffers.push(buffer);
            gpuDevice.queue.writeBuffer(buffer, 0, data);
            return buffer;
        };
        const heightBuffer = inputBuffer(heights);
        const coveredBuffer = inputBuffer(covered);
        const sampleRowBuffer = inputBuffer(new Uint32Array(sampleRows));
        const outputBuffer = gpuDevice.createBuffer({ size: byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
        buffers.push(outputBuffer);
        const paramsBuffer = gpuDevice.createBuffer({
            size: params.byteLength,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        buffers.push(paramsBuffer);
        gpuDevice.queue.writeBuffer(paramsBuffer, 0, params);
        const readBuffer = gpuDevice.createBuffer({ size: byteLength, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
        buffers.push(readBuffer);
        const module = gpuDevice.createShaderModule({ code: shader });
        const pipeline = await raceSurfaceGpuWork<GPUComputePipeline>(
            gpuDevice.createComputePipelineAsync({ layout: 'auto', compute: { module, entryPoint: 'main' } }),
            deviceLost,
        );
        const bindGroup = gpuDevice.createBindGroup({
            layout: pipeline.getBindGroupLayout(0),
            entries: [heightBuffer, coveredBuffer, outputBuffer, paramsBuffer, sampleRowBuffer].map((buffer, binding) => ({ binding, resource: { buffer } })),
        });
        const encoder = gpuDevice.createCommandEncoder();
        const pass = encoder.beginComputePass();
        pass.setPipeline(pipeline);
        pass.setBindGroup(0, bindGroup);
        pass.dispatchWorkgroups(dispatchX, dispatchY);
        pass.end();
        encoder.copyBufferToBuffer(outputBuffer, 0, readBuffer, 0, byteLength);
        gpuDevice.queue.submit([encoder.finish()]);
        await raceSurfaceGpuWork(readBuffer.mapAsync(GPUMapMode.READ), deviceLost);
        const result = new Float32Array(readBuffer.getMappedRange().slice(0));
        readBuffer.unmap();
        self.postMessage({ id, result }, [result.buffer]);
    } catch (error) {
        self.postMessage({ id, error: error instanceof Error ? error.message : 'WebGPU surface calculation failed.' });
    } finally {
        for (const buffer of buffers) buffer.destroy();
        device?.destroy();
    }
};

export {};
