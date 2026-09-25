// Worker-side height-field construction. Keeping cutter sampling and raster
// painting here prevents complex jobs from blocking canvas interaction.

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
let latestBuildVersion = 0;

function boundsFor(toolpaths) {
    const points = [];
    for (const toolpath of toolpaths) {
        for (const contour of toolpath.previewContours || [])
            points.push(...contour);
        for (const path of toolpath.motionPaths || [])
            points.push(...(path.points || []));
    }
    if (!points.length) return null;
    let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
    for (const point of points) {
        if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
        minX = Math.min(minX, point.x);
        minY = Math.min(minY, point.y);
        maxX = Math.max(maxX, point.x);
        maxY = Math.max(maxY, point.y);
    }
    if (!Number.isFinite(minX)) return null;
    // The stock is laid out from the machine origin as well as around the
    // programmed geometry. This keeps zero-coordinate work inside the stock
    // when all toolpath coordinates are positive (or all are negative).
    return {
        minX: Math.min(minX, 0),
        minY: Math.min(minY, 0),
        maxX: Math.max(maxX, 0),
        maxY: Math.max(maxY, 0),
    };
}

function tabDepth(toolpath, contour, along, cutDepth) {
    const contourIndex = toolpath.previewContours.indexOf(contour);
    const tabs = (toolpath.tabs || []).filter(
        (tab) => tab.contourIndex === contourIndex,
    );
    if (!tabs.length || !toolpath.tabHeight) return cutDepth;
    const total = contour.reduce(
        (sum, point, index) =>
            index ? sum + dist(contour[index - 1], point) : sum,
        0,
    );
    const cutter = toolpath.toolDiameter || 1;
    const ramp = Math.max(cutter * 0.75, 0.5);
    const width = Math.max(toolpath.tabWidth || 0, cutter * 1.5);
    const span = width + cutter;
    const top = -Math.max(0, (toolpath.cutDepth || 0) - toolpath.tabHeight);
    if (cutDepth >= top) return cutDepth;
    let result = cutDepth;
    for (const tab of tabs) {
        const start = Math.max(0, tab.along - span / 2);
        const end = Math.min(total, tab.along + span / 2);
        const rampStart = Math.max(0, start - ramp);
        const rampEnd = Math.min(total, end + ramp);
        let factor = 0;
        if (along >= start && along <= end) factor = 1;
        else if (along >= rampStart && along < start)
            factor = (along - rampStart) / Math.max(0.001, start - rampStart);
        else if (along > end && along <= rampEnd)
            factor = 1 - (along - end) / Math.max(0.001, rampEnd - end);
        result = Math.max(result, cutDepth + (top - cutDepth) * factor);
    }
    return result;
}

function addContourSamples(target, toolpath, contour, depth, step, metadata) {
    let travelled = 0;
    for (let index = 1; index < contour.length; index += 1) {
        const a = contour[index - 1],
            b = contour[index];
        const length = dist(a, b);
        const count = Math.max(1, Math.ceil(length / step));
        for (let sample = 0; sample <= count; sample += 1) {
            const ratio = sample / count;
            target.push({
                x: a.x + (b.x - a.x) * ratio,
                y: a.y + (b.y - a.y) * ratio,
                z: tabDepth(
                    toolpath,
                    contour,
                    travelled + length * ratio,
                    depth,
                ),
                ...metadata,
            });
        }
        travelled += length;
    }
}

function addMotionSamples(target, points, step, metadata) {
    for (let index = 1; index < points.length; index += 1) {
        const a = points[index - 1],
            b = points[index],
            length = dist(a, b);
        const count = Math.max(1, Math.ceil(length / step));
        for (let sample = 0; sample <= count; sample += 1) {
            const ratio = sample / count;
            target.push({
                x: a.x + (b.x - a.x) * ratio,
                y: a.y + (b.y - a.y) * ratio,
                z: (a.z || 0) + ((b.z || 0) - (a.z || 0)) * ratio,
                ...metadata,
            });
        }
    }
}

function paintSampleInto(grid, sample, geometry) {
    if (sample.z >= -0.0001) return;
    const { bounds, columns, rows, cellX, cellY } = geometry;
    const tangent = Math.tan((sample.angle * Math.PI) / 180 / 2);
    // A V-bit cuts a cone, not a slot: the footprint grows with tip depth
    // (surface half-width = depth * tan(half-angle)). Using the body diameter
    // here modelled it as a flat endmill, so v-carves rendered as thin slots
    // instead of grooves that widen as the bit plunges deeper.
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

const yieldWorker = () => new Promise((resolve) => setTimeout(resolve, 0));

async function build(version, toolpaths) {
    const bounds = boundsFor(toolpaths);
    if (!bounds) {
        self.postMessage({ type: 'empty', version });
        return;
    }
    const maxDiameter = Math.max(
        1,
        ...toolpaths.map((path) => Number(path.toolDiameter) || 1),
    );
    const padding = Math.max(8, maxDiameter * 1.5);
    bounds.minX -= padding;
    bounds.minY -= padding;
    bounds.maxX += padding;
    bounds.maxY += padding;
    const width = Math.max(1, bounds.maxX - bounds.minX),
        height = Math.max(1, bounds.maxY - bounds.minY);
    const minCutter = Math.max(
        0.2,
        Math.min(...toolpaths.map((path) => Number(path.toolDiameter) || 1)),
    );
    const cell = Math.max(
        0.1,
        Math.min(minCutter * 0.16, Math.max(width, height) / 960),
    );
    let columns = Math.min(2048, Math.max(56, Math.ceil(width / cell) + 1));
    let rows = Math.min(2048, Math.max(56, Math.ceil(height / cell) + 1));
    const maxCells = 2400000;
    if (columns * rows > maxCells) {
        const reduction = Math.sqrt((columns * rows) / maxCells);
        columns = Math.max(56, Math.floor(columns / reduction));
        rows = Math.max(56, Math.floor(rows / reduction));
    }
    const cellX = width / (columns - 1),
        cellY = height / (rows - 1);
    // This is a visual replay, not the machining source of truth. Sampling at
    // roughly one fifth of the smallest cutter keeps the cut continuous while
    // avoiding millions of redundant replay stamps for long toolpaths.
    const step = Math.max(Math.max(cellX, cellY) * 0.85, minCutter * 0.18);
    const samples = [];
    for (const toolpath of toolpaths) {
        const cutter = Math.max(0.1, Number(toolpath.toolDiameter) || 1);
        const metadata = {
            cutter,
            trochoidRadius: toolpath.trochoidEnabled
                ? Math.max(0, Number(toolpath.trochoidRadius) || 0)
                : 0,
            // CAM uses `vcarve` as its operation id. Keep the legacy spelling as
            // compatibility for saved projects created before the id was aligned.
            vbit:
                toolpath.operation === 'vcarve' ||
                toolpath.operation === 'v-carve' ||
                toolpath.operation === 'chamfer',
            angle: clamp(Number(toolpath.cutterAngle) || 90, 10, 170),
        };
        if (toolpath.motionPaths?.length) {
            for (const path of toolpath.motionPaths)
                addMotionSamples(samples, path.points || [], step, metadata);
        } else {
            for (const depth of toolpath.passDepths || []) {
                for (const contour of toolpath.previewContours || [])
                    addContourSamples(
                        samples,
                        toolpath,
                        contour,
                        depth,
                        step,
                        metadata,
                    );
            }
        }
    }
    if (version !== latestBuildVersion) return;
    self.postMessage({
        type: 'progress',
        version,
        progress: 0,
        total: samples.length,
    });
    const grid = new Float32Array(columns * rows);
    const geometry = { bounds, columns, rows, cellX, cellY };
    for (let index = 0; index < samples.length; index += 1) {
        paintSampleInto(grid, samples[index], geometry);
        if (index % 750 === 0) {
            if (version !== latestBuildVersion) return;
            self.postMessage({
                type: 'progress',
                version,
                progress: Math.round(
                    (index / Math.max(1, samples.length)) * 100,
                ),
                total: samples.length,
            });
            await yieldWorker();
        }
    }
    if (version !== latestBuildVersion) return;
    let minZ = 0;
    for (const value of grid) minZ = Math.min(minZ, value);
    const sampleData = new Float32Array(samples.length * 6);
    const sampleKinds = new Uint8Array(samples.length);
    for (let index = 0; index < samples.length; index += 1) {
        const sample = samples[index],
            offset = index * 6;
        sampleData[offset] = sample.x;
        sampleData[offset + 1] = sample.y;
        sampleData[offset + 2] = sample.z;
        sampleData[offset + 3] = sample.cutter;
        sampleData[offset + 4] = sample.trochoidRadius;
        sampleData[offset + 5] = sample.angle;
        sampleKinds[index] = sample.vbit ? 1 : 0;
    }
    self.postMessage(
        {
            type: 'complete',
            version,
            bounds,
            grid: grid.buffer,
            sampleData: sampleData.buffer,
            sampleKinds: sampleKinds.buffer,
            columns,
            rows,
            cellX,
            cellY,
            maxDepth: Math.max(1, -minZ),
        },
        [grid.buffer, sampleData.buffer, sampleKinds.buffer],
    );
}

self.addEventListener('message', ({ data }) => {
    if (data?.type !== 'build') return;
    latestBuildVersion = data.version;
    build(data.version, data.toolpaths || []).catch((error) => {
        if (data.version === latestBuildVersion)
            self.postMessage({
                type: 'error',
                version: data.version,
                message: error?.message || '3D simulation failed.',
            });
    });
});
