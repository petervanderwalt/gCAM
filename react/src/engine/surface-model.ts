import {
    orientSurfaceMesh,
    parseObj,
    parseStl,
    rasterizeTopSurface,
    type SurfaceMesh,
} from './surface-cam';

export interface StoredSurfaceMesh {
    vertices: number[];
    bounds: SurfaceMesh['bounds'];
    sourceName: string;
    sourceUnitScaleMm: number;
    /** Source-space vector selected as the machine's +Z setup direction. */
    machineUp?: [number, number, number];
}

export interface SetupAngles {
    azimuthDeg: number;
    elevationDeg: number;
}

/** Convert an editable setup direction to the source-space vector that becomes machine +Z. */
export function setupAnglesToMachineUp(
    azimuthDeg: number,
    elevationDeg: number,
): [number, number, number] {
    const azimuth = (azimuthDeg * Math.PI) / 180;
    const elevation = (elevationDeg * Math.PI) / 180;
    const horizontal = Math.cos(elevation);
    return [
        Math.sin(azimuth) * horizontal,
        Math.cos(azimuth) * horizontal,
        Math.sin(elevation),
    ];
}

/** Recover stable azimuth/elevation controls from a stored source-space setup direction. */
export function machineUpToSetupAngles(
    machineUp: [number, number, number],
): SetupAngles {
    const length = Math.hypot(...machineUp) || 1;
    const [x, y, z] = machineUp.map((value) => value / length);
    return {
        azimuthDeg: Math.round((Math.atan2(x, y) * 180) / Math.PI),
        elevationDeg: Math.round(
            (Math.asin(Math.max(-1, Math.min(1, z))) * 180) / Math.PI,
        ),
    };
}

/** Place imported geometry at native model size; raster-image sizing is inappropriate for physical STL units. */
export function initialSurfacePlacement(
    bounds: StoredSurfaceMesh['bounds'],
    centerX: number,
    centerY: number,
) {
    const wMm = bounds.maxX - bounds.minX;
    const hMm = bounds.maxY - bounds.minY;
    return { x: centerX - wMm / 2, y: centerY - hMm / 2, wMm, hMm };
}

const setupRequiredPreview =
    'data:image/svg+xml;charset=utf-8,' +
    encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="160" viewBox="0 0 320 160"><rect width="320" height="160" fill="#e2e8f0"/><path d="M24 116h272" stroke="#94a3b8" stroke-width="2" stroke-dasharray="6 6"/><text x="160" y="72" text-anchor="middle" fill="#334155" font-family="sans-serif" font-size="15">Choose a machining setup direction</text><text x="160" y="94" text-anchor="middle" fill="#64748b" font-family="sans-serif" font-size="12">Current view has no top-down surface</text></svg>',
    );

/** STL has no standard unit metadata; import UI makes the assumption explicit. */
export async function readSurfaceMeshFile(
    file: File,
    units: 'mm' | 'inch',
): Promise<StoredSurfaceMesh> {
    const mesh = /\.obj$/i.test(file.name)
        ? parseObj(await file.text(), file.name)
        : parseStl(await file.arrayBuffer(), file.name);
    const unitScale = units === 'inch' ? 25.4 : 1;
    const vertices = Array.from(mesh.vertices, (value) => value * unitScale);
    const bounds = {
        minX: mesh.bounds.minX * unitScale,
        minY: mesh.bounds.minY * unitScale,
        minZ: mesh.bounds.minZ * unitScale,
        maxX: mesh.bounds.maxX * unitScale,
        maxY: mesh.bounds.maxY * unitScale,
        maxZ: mesh.bounds.maxZ * unitScale,
    };
    return {
        vertices,
        bounds,
        sourceName: file.name,
        sourceUnitScaleMm: unitScale,
    };
}

/** A useful flat 2D preview: top-view height mapped to a neutral shaded relief. */
export function renderHeightmapDataUrl(mesh: StoredSurfaceMesh): {
    dataUrl: string;
    pixelW: number;
    pixelH: number;
    machinableTopDown: boolean;
    machineUp: [number, number, number];
    orientedBounds: SurfaceMesh['bounds'];
} {
    const sourceMesh: SurfaceMesh = {
        vertices: new Float32Array(mesh.vertices),
        bounds: mesh.bounds,
        sourceName: mesh.sourceName,
    };
    const machineUp = mesh.machineUp ?? [0, 0, 1];
    const orientedMesh = orientSurfaceMesh(sourceMesh, machineUp);
    const width = orientedMesh.bounds.maxX - orientedMesh.bounds.minX;
    const height = orientedMesh.bounds.maxY - orientedMesh.bounds.minY;
    if (width <= 1e-9 || height <= 1e-9) {
        return {
            dataUrl: setupRequiredPreview,
            pixelW: 320,
            pixelH: 160,
            machinableTopDown: false,
            machineUp,
            orientedBounds: orientedMesh.bounds,
        };
    }
    const longest = Math.max(width, height);
    const field = rasterizeTopSurface(orientedMesh, longest / 320);
    if (!field.covered.some(Boolean)) {
        return {
            dataUrl: setupRequiredPreview,
            pixelW: 320,
            pixelH: 160,
            machinableTopDown: false,
            machineUp,
            orientedBounds: orientedMesh.bounds,
        };
    }
    const canvas = document.createElement('canvas');
    canvas.width = field.columns;
    canvas.height = field.rows;
    const context = canvas.getContext('2d');
    if (!context)
        throw new Error('Canvas 2D is unavailable for STL heightmap preview.');
    const image = context.createImageData(field.columns, field.rows);
    let low = Infinity;
    let high = -Infinity;
    for (let i = 0; i < field.heights.length; i += 1) {
        if (!field.covered[i]) continue;
        low = Math.min(low, field.heights[i]);
        high = Math.max(high, field.heights[i]);
    }
    const range = Math.max(1e-6, high - low);
    for (let row = 0; row < field.rows; row += 1) {
        for (let column = 0; column < field.columns; column += 1) {
            const index = row * field.columns + column;
            const offset =
                ((field.rows - 1 - row) * field.columns + column) * 4;
            if (!field.covered[index]) continue;
            const left =
                field.heights[row * field.columns + Math.max(0, column - 1)];
            const right =
                field.heights[
                    row * field.columns +
                        Math.min(field.columns - 1, column + 1)
                ];
            const below =
                field.heights[Math.max(0, row - 1) * field.columns + column];
            const above =
                field.heights[
                    Math.min(field.rows - 1, row + 1) * field.columns + column
                ];
            const dx =
                Number.isFinite(left) && Number.isFinite(right)
                    ? left - right
                    : 0;
            const dy =
                Number.isFinite(below) && Number.isFinite(above)
                    ? below - above
                    : 0;
            const shade = Math.max(
                0,
                Math.min(1, 0.78 + (dx + dy) / Math.max(range * 20, 1)),
            );
            const height = (field.heights[index] - low) / range;
            const value = Math.round(70 + height * 125 * shade);
            image.data[offset] = value;
            image.data[offset + 1] = Math.round(value * 0.98);
            image.data[offset + 2] = Math.round(value * 0.9);
            image.data[offset + 3] = 255;
        }
    }
    context.putImageData(image, 0, 0);
    return {
        dataUrl: canvas.toDataURL('image/png'),
        pixelW: field.columns,
        pixelH: field.rows,
        machinableTopDown: true,
        machineUp,
        orientedBounds: orientedMesh.bounds,
    };
}

/** Apply the editable canvas bitmap transform to the retained CAM mesh. */
export function transformStoredSurfaceMesh(bitmap: {
    x: number;
    y: number;
    w: number;
    h: number;
    rotation?: number;
    surfaceMesh?: StoredSurfaceMesh;
}): SurfaceMesh | null {
    const stored = bitmap.surfaceMesh;
    if (!stored || bitmap.w <= 0 || bitmap.h <= 0) return null;
    const source: SurfaceMesh = {
        vertices: new Float32Array(stored.vertices),
        bounds: stored.bounds,
        sourceName: stored.sourceName,
    };
    const oriented = orientSurfaceMesh(source, stored.machineUp ?? [0, 0, 1]);
    const original = oriented.vertices;
    const { bounds } = oriented;
    const scaleX = bitmap.w / (bounds.maxX - bounds.minX);
    const scaleY = bitmap.h / (bounds.maxY - bounds.minY);
    const scaleZ = Math.sqrt(scaleX * scaleY);
    const radians = ((bitmap.rotation ?? 0) * Math.PI) / 180;
    const cosine = Math.cos(radians);
    const sine = Math.sin(radians);
    const centerX = bitmap.x + bitmap.w / 2;
    const centerY = bitmap.y + bitmap.h / 2;
    const vertices = new Float32Array(original.length);
    for (let i = 0; i < original.length; i += 3) {
        const localX = bitmap.x + (original[i] - bounds.minX) * scaleX;
        const localY = bitmap.y + (original[i + 1] - bounds.minY) * scaleY;
        const dx = localX - centerX;
        const dy = localY - centerY;
        vertices[i] = centerX + dx * cosine - dy * sine;
        vertices[i + 1] = centerY + dx * sine + dy * cosine;
        vertices[i + 2] = (original[i + 2] - bounds.maxZ) * scaleZ;
    }
    const outputBounds = {
        minX: Infinity,
        minY: Infinity,
        minZ: Infinity,
        maxX: -Infinity,
        maxY: -Infinity,
        maxZ: -Infinity,
    };
    for (let i = 0; i < vertices.length; i += 3) {
        outputBounds.minX = Math.min(outputBounds.minX, vertices[i]);
        outputBounds.maxX = Math.max(outputBounds.maxX, vertices[i]);
        outputBounds.minY = Math.min(outputBounds.minY, vertices[i + 1]);
        outputBounds.maxY = Math.max(outputBounds.maxY, vertices[i + 1]);
        outputBounds.minZ = Math.min(outputBounds.minZ, vertices[i + 2]);
        outputBounds.maxZ = Math.max(outputBounds.maxZ, vertices[i + 2]);
    }
    return {
        vertices,
        bounds: outputBounds,
        sourceName: stored.sourceName,
    };
}
