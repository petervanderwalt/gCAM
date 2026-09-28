import { clamp } from './math.js';

export function previewSampleAt(data, index) {
    const offset = index * 6;
    const samples = data?.sampleData;
    if (!samples || offset + 5 >= samples.length) return null;
    return {
        x: samples[offset],
        y: samples[offset + 1],
        z: samples[offset + 2],
        cutter: samples[offset + 3],
        trochoidRadius: samples[offset + 4],
        angle: samples[offset + 5],
        vbit: Boolean(data.sampleKinds?.[index]),
    };
}

// Paint the physical cutter envelope into the incremental playback heightmap.
export function paintCutterSample(grid, sample, geometry) {
    if (sample.z >= -0.0001) return;
    const { bounds, columns, rows, cellX, cellY } = geometry;
    const tangent = Math.tan((sample.angle * Math.PI) / 360);
    const depth = -sample.z;
    const radius = sample.vbit
        ? Math.max(
              depth * tangent + sample.trochoidRadius,
              Math.max(cellX, cellY) * 0.68,
          )
        : Math.max(
              sample.cutter / 2 + sample.trochoidRadius,
              Math.max(cellX, cellY) * 0.68,
          );
    const minColumn = clamp(
        Math.floor((sample.x - radius - bounds.minX) / cellX),
        0,
        columns - 1,
    );
    const maxColumn = clamp(
        Math.ceil((sample.x + radius - bounds.minX) / cellX),
        0,
        columns - 1,
    );
    const minRow = clamp(
        Math.floor((sample.y - radius - bounds.minY) / cellY),
        0,
        rows - 1,
    );
    const maxRow = clamp(
        Math.ceil((sample.y + radius - bounds.minY) / cellY),
        0,
        rows - 1,
    );
    for (let row = minRow; row <= maxRow; row += 1) {
        const y = bounds.minY + row * cellY;
        for (let column = minColumn; column <= maxColumn; column += 1) {
            const x = bounds.minX + column * cellX;
            const radial = Math.hypot(x - sample.x, y - sample.y);
            if (radial > radius) continue;
            const z = sample.vbit
                ? Math.min(0, sample.z + radial / tangent)
                : sample.z;
            grid[row * columns + column] = Math.min(
                grid[row * columns + column],
                z,
            );
        }
    }
}
