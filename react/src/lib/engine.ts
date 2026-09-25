import {
    booleanPolygons,
    buildGcode as buildRealGcode,
    buildGcodeAsync,
    createToolpathFromLoops,
    createToolpathFromLoopsAsync,
    offsetCompositePolygons,
} from '../engine/cam-ops.js';
import { boundsOfPoints } from '../engine/paths.js';
import {
    createToolpathInWorker,
    buildGcodeInWorker,
    terminateWorker,
} from '../engine/cam-worker-client.ts';

export type Operation =
    | 'profile-outside'
    | 'profile-inside'
    | 'pocket'
    | 'engrave'
    | 'chamfer'
    | 'vcarve'
    | 'laser-cut'
    | 'laser-raster'
    | 'wavy-raster'
    | 'halftone';

export interface PlacedTab {
    contourIndex: number;
    along: number;
}

export interface ProfileArgs {
    loops: { id?: string; points: { x: number; y: number }[] }[];
    operation: Operation;
    toolDiameter: number;
    cutDepth: number;
    cutterAngle?: number;
    laserFeed?: number;
    laserPower?: number;
    laserSpot?: number;
    laserSMin?: number;
    laserSMax?: number;
    laserGamma?: number;
    laserOverscan?: number;
    wavySpot?: number;
    wavyMinDepth?: number;
    wavyMaxDepth?: number;
    wavyFeed?: number;
    halftoneResolution?: number;
    halftoneInvert?: boolean;
    /** Emit G2/G3 arcs for circles (default) or G1-only polylines. */
    arcs?: boolean;
    feedRate?: number;
    plungeRate?: number;
    spindle?: number;
    safeZ?: number;
    passDepth?: number;
    trochoidEnabled?: boolean;
    trochoidEngagementPercent?: number;
    overlapPercent?: number;
    tabWidth?: number;
    tabHeight?: number;
    toolNumber?: number;
    tabs?: PlacedTab[];
    fileName?: string;
}

export interface ToolpathResult {
    gcode: string;
    previewContours: { x: number; y: number }[][];
    label: string;
    toolpath: Record<string, unknown>;
}

/**
 * Real toolpath pipeline: Clipper offset/pocket via cam-ops plus the real
 * GRBL emitter. Returns preview contours for canvas overlay.
 */
export interface RasterBitmap {
    imageData: {
        width: number;
        height: number;
        data: ArrayLike<number>;
    };
    bounds: { minX: number; minY: number; maxX: number; maxY: number };
}

/**
 * Shared toolpath config defaults (cam-ops requires finite toolRadius,
 * overlapPercent, tabWidth/tabHeight and toolNumber). Used by both the
 * sync and worker build paths so they behave identically.
 */
function makeBase(
    operation: Operation,
    c: {
        toolDiameter: number;
        cutDepth: number;
        cutterAngle?: number;
        laserFeed?: number;
        laserPower?: number;
        laserSpot?: number;
        laserSMin?: number;
        laserSMax?: number;
        laserGamma?: number;
        laserOverscan?: number;
        wavySpot?: number;
        wavyMinDepth?: number;
        wavyMaxDepth?: number;
        wavyFeed?: number;
        halftoneResolution?: number;
        halftoneInvert?: boolean;
        feedRate?: number;
        plungeRate?: number;
        spindle?: number;
        safeZ?: number;
        passDepth?: number;
        trochoidEnabled?: boolean;
        trochoidEngagementPercent?: number;
        overlapPercent?: number;
        tabWidth?: number;
        tabHeight?: number;
        toolNumber?: number;
    },
) {
    const {
        toolDiameter,
        cutDepth,
        cutterAngle = 90,
        laserFeed = 3000,
        laserPower = 1000,
        laserSpot = 0.2,
        laserSMin = 0,
        laserSMax = 1000,
        laserGamma = 1,
        laserOverscan = 2,
        wavySpot = 2,
        wavyMinDepth = 0,
        wavyMaxDepth = 3,
        wavyFeed,
        halftoneResolution = 50,
        halftoneInvert = false,
        feedRate = 1800,
        plungeRate = 600,
        spindle = 18000,
        safeZ = 5,
        passDepth,
        trochoidEnabled = false,
        trochoidEngagementPercent = 10,
        overlapPercent = 40,
        tabWidth = 9,
        tabHeight = Math.min(9, cutDepth / 2),
        toolNumber = 1,
    } = c;
    return {
        operation,
        toolDiameter,
        toolRadius: toolDiameter / 2,
        cutterAngle,
        overlapPercent,
        cutDepth,
        passDepth: passDepth ?? cutDepth,
        trochoidEnabled,
        trochoidRadius: trochoidEnabled
            ? Math.max(0, toolDiameter * (trochoidEngagementPercent / 100))
            : 0,
        trochoidEngagementPercent,
        tabWidth,
        tabHeight,
        safeZ,
        feedRate:
            operation === 'laser-cut' || operation === 'laser-raster'
                ? laserFeed
                : feedRate,
        plungeRate,
        spindle,
        toolNumber: Math.max(1, Math.round(toolNumber)),
        laserFeed,
        laserPower,
        laserSpot,
        laserSMin,
        laserSMax,
        laserGamma,
        laserOverscan,
        wavySpot,
        wavyMinDepth,
        wavyMaxDepth,
        wavyFeed: wavyFeed ?? feedRate,
        halftoneResolution,
        halftoneInvert,
    };
}

export function buildToolpathGcode({
    loops,
    operation,
    toolDiameter,
    cutDepth,
    cutterAngle = 90,
    laserFeed = 3000,
    laserPower = 1000,
    laserSpot = 0.2,
    laserSMin = 0,
    laserSMax = 1000,
    laserGamma = 1,
    laserOverscan = 2,
    wavySpot = 2,
    wavyMinDepth = 0,
    wavyMaxDepth = 3,
    wavyFeed,
    halftoneResolution = 50,
    halftoneInvert = false,
    arcs = true,
    tabs = [],
    fileName,
    trochoidEnabled = false,
    trochoidEngagementPercent = 10,
    feedRate = 1800,
    plungeRate = 600,
    spindle = 18000,
    safeZ = 5,
    passDepth,
    overlapPercent,
    tabWidth,
    tabHeight,
    toolNumber,
    bitmap,
}: ProfileArgs & { bitmap?: RasterBitmap }): Promise<ToolpathResult> {
    if (!loops.length) return Promise.reject(new Error('No vectors selected.'));
    if (operation === 'laser-raster' && !bitmap)
        return Promise.reject(
            new Error('Laser Raster needs a bitmap — import an image first.'),
        );
    if (operation === 'wavy-raster' && !bitmap)
        return Promise.reject(
            new Error('Wavy needs a bitmap — import an image first.'),
        );
    if (operation === 'halftone' && !bitmap)
        return Promise.reject(
            new Error('Halftone needs a bitmap — import an image first.'),
        );
    if (!(toolDiameter > 0))
        return Promise.reject(
            new Error('Tool diameter must be greater than zero.'),
        );
    if (!(cutDepth > 0))
        return Promise.reject(
            new Error('Cut depth must be greater than zero.'),
        );
    const base = makeBase(operation, {
        toolDiameter,
        cutDepth,
        cutterAngle,
        laserFeed,
        laserPower,
        laserSpot,
        laserSMin,
        laserSMax,
        laserGamma,
        laserOverscan,
        wavySpot,
        wavyMinDepth,
        wavyMaxDepth,
        wavyFeed,
        halftoneResolution,
        halftoneInvert,
        feedRate,
        plungeRate,
        spindle,
        safeZ,
        passDepth,
        trochoidEnabled,
        trochoidEngagementPercent,
        overlapPercent,
        tabWidth,
        tabHeight,
        toolNumber,
    });
    // Raster ops sample bitmap pixels: flag the loop and hand the entity over.
    const raster =
        (operation === 'laser-raster' ||
            operation === 'wavy-raster' ||
            operation === 'halftone') &&
        bitmap
            ? {
                  loops: loops.map((loop) => ({
                      ...loop,
                      isBitmap: true,
                      bounds: bitmap.bounds,
                  })),
                  options: {
                      sourceEntities: [
                          {
                              type: 'BITMAP',
                              _imageData: bitmap.imageData,
                              bounds: bitmap.bounds,
                          },
                      ],
                  },
              }
            : { loops, options: {} };
    const withTabs = <T extends object>(toolpath: T): T => {
        (toolpath as { tabs?: PlacedTab[] }).tabs = tabs.map((t) => ({
            ...t,
        }));
        // Halftone reads these off the toolpath at emit time.
        (toolpath as { halftoneResolution?: number }).halftoneResolution =
            halftoneResolution;
        (toolpath as { halftoneInvert?: boolean }).halftoneInvert =
            halftoneInvert;
        return toolpath;
    };
    if (operation === 'vcarve') {
        return createToolpathFromLoopsAsync(raster.loops, base).then(
            (toolpath) => finishToolpath(fileName, withTabs(toolpath), arcs),
        );
    }
    try {
        return Promise.resolve(
            finishToolpath(
                fileName,
                withTabs(
                    createToolpathFromLoops(raster.loops, base, raster.options),
                ),
                arcs,
            ),
        );
    } catch (e) {
        return Promise.reject(e);
    }
}

function finishToolpath(
    fileName: string | undefined,
    toolpath: {
        previewContours: { x: number; y: number }[][];
        label: string;
    },
    arcs = true,
): ToolpathResult {
    const gcode = buildRealGcode({
        toolpaths: [toolpath],
        fileName: fileName || 'gcam',
        forcePolylineArcs: !arcs,
    });
    return {
        gcode,
        previewContours: toolpath.previewContours,
        label: toolpath.label,
        toolpath: toolpath as unknown as Record<string, unknown>,
    };
}

export type BooleanOperation = 'union' | 'difference' | 'intersection' | 'xor';

/** Boolean-combine loop point sets via Clipper. Throws when <2 inputs. */
export function applyBoolean(
    loops: { points: { x: number; y: number }[] }[],
    operation: BooleanOperation,
): { points: { x: number; y: number }[] }[] {
    const results: { x: number; y: number }[][] = booleanPolygons(
        loops,
        operation,
    );
    if (!results.length) throw new Error('Boolean produced no geometry.');
    return results.map((points) => ({ points }));
}

/** Offset loop geometry outward (+) or inward (−) by mm via Clipper. */
export function offsetLoops(
    loops: { points: { x: number; y: number }[] }[],
    delta: number,
): { points: { x: number; y: number }[] }[] {
    if (!Number.isFinite(delta) || delta === 0)
        throw new Error('Offset must be a non-zero number.');
    const results: { x: number; y: number }[][] = offsetCompositePolygons(
        loops.map((l) => l.points),
        delta,
    );
    if (!results.length) throw new Error('Offset produced no geometry.');
    return results.map((points) => ({ points }));
}

/** Combine stored toolpaths into one GRBL program, like legacy Step 3. */
export function combineToolpaths(
    toolpaths: Record<string, unknown>[],
    fileName = 'gcam',
    arcs = true,
): string {
    if (!toolpaths.length) return '';
    return buildRealGcode({
        toolpaths: toolpaths as never,
        fileName,
        forcePolylineArcs: !arcs,
    });
}

/** Async version that offloads toolpath computation to a Web Worker. */
export async function buildToolpathGcodeAsync(
    args: ProfileArgs & {
        bitmap?: RasterBitmap;
        onProgress?: (percent: number, label: string) => void;
    },
): Promise<ToolpathResult> {
    const {
        loops,
        operation,
        arcs = true,
        fileName,
        bitmap,
        onProgress,
        halftoneResolution = 50,
        halftoneInvert = false,
        tabs = [],
        ...config
    } = args;

    if (!loops.length) throw new Error('No vectors selected.');
    if (operation === 'laser-raster' && !bitmap)
        throw new Error('Laser Raster needs a bitmap — import an image first.');
    if (operation === 'wavy-raster' && !bitmap)
        throw new Error('Wavy needs a bitmap — import an image first.');
    if (operation === 'halftone' && !bitmap)
        throw new Error('Halftone needs a bitmap — import an image first.');
    if (!(config.toolDiameter > 0))
        throw new Error('Tool diameter must be greater than zero.');
    if (!(config.cutDepth > 0))
        throw new Error('Cut depth must be greater than zero.');

    // Prepare raster data for bitmap operations
    const raster =
        (operation === 'laser-raster' ||
            operation === 'wavy-raster' ||
            operation === 'halftone') &&
        bitmap
            ? {
                  loops: loops.map((loop) => ({
                      ...loop,
                      isBitmap: true,
                      bounds: bitmap.bounds,
                  })),
                  options: {
                      sourceEntities: [
                          {
                              type: 'BITMAP',
                              _imageData: bitmap.imageData,
                              bounds: bitmap.bounds,
                          },
                      ],
                  },
              }
            : { loops, options: {} };

    // Wrap onProgress to match worker client signature
    const workerProgress = onProgress
        ? (p: { percent: number; label: string }) =>
              onProgress(p.percent, p.label)
        : undefined;

    const base = makeBase(operation, config);

    const toolpath = await createToolpathInWorker(
        raster.loops,
        { ...base, ...raster.options },
        { onProgress: workerProgress },
    );

    // Apply tabs after worker returns
    if (tabs.length) {
        toolpath.tabs = tabs.map((t) => ({ ...t }));
    }
    if (operation === 'halftone') {
        toolpath.halftoneResolution = halftoneResolution;
        toolpath.halftoneInvert = halftoneInvert;
    }

    // Build G-code in worker
    const gcode = await buildGcodeInWorker({
        toolpaths: [toolpath],
        fileName: fileName || 'gcam',
        forcePolylineArcs: !arcs,
        onProgress: workerProgress,
    });

    return {
        gcode,
        previewContours: toolpath.previewContours,
        label: toolpath.label,
        toolpath: toolpath as unknown as Record<string, unknown>,
    };
}

/** Async version of combineToolpaths that offloads to Web Worker. */
export async function combineToolpathsAsync(
    toolpaths: Record<string, unknown>[],
    fileName = 'gcam',
    arcs = true,
    onProgress?: (percent: number, label: string) => void,
): Promise<string> {
    if (!toolpaths.length) return '';
    const workerProgress = onProgress
        ? (p: { percent: number; label: string }) =>
              onProgress(p.percent, p.label)
        : undefined;
    return buildGcodeInWorker({
        toolpaths: toolpaths as any[],
        fileName,
        forcePolylineArcs: !arcs,
        onProgress: workerProgress,
    });
}

/** Terminate the CAM worker (call on app unload). */
export { terminateWorker };
export function buildProfileGcode(
    args: Omit<ProfileArgs, 'operation'>,
): Promise<string> {
    return buildToolpathGcode({ ...args, operation: 'profile-outside' }).then(
        (r) => r.gcode,
    );
}

export function loopBounds(loops: ProfileArgs['loops']) {
    if (!loops.length) return null;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const loop of loops) {
        if (loop.points.length < 2) continue;
        const b = boundsOfPoints(loop.points);
        minX = Math.min(minX, b.minX);
        minY = Math.min(minY, b.minY);
        maxX = Math.max(maxX, b.maxX);
        maxY = Math.max(maxY, b.maxY);
    }
    return Number.isFinite(minX) ? { minX, minY, maxX, maxY } : null;
}
