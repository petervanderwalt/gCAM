import './clipper-shim.js';
import { CLIPPER_SCALE } from './constants.js';
import {
    closePoints,
    polygonArea,
    clonePoint,
    pointAtDistance,
    polylineLength,
    boundsOfPoints,
    dist,
} from './paths.js';
import {
    ensureVCarveReady,
    getVCarveLoadError,
    generateVCarveToolpaths,
    isVCarveReady,
    mmPointsToClipperPath,
} from './vcarve.js';

export function clipperPathFromPoints(points) {
    const path = points.slice(0, -1).map((point) => ({
        X: Math.round(point.x * CLIPPER_SCALE),
        Y: Math.round(point.y * CLIPPER_SCALE),
    }));
    return ClipperLib.JS.Clean(path, 2);
}

export function pointsFromClipperPath(path) {
    const points = path.map((point) => ({
        x: point.X / CLIPPER_SCALE,
        y: point.Y / CLIPPER_SCALE,
    }));
    return closePoints(points);
}

export function ensurePositiveOrientation(points) {
    return polygonArea(points) < 0
        ? closePoints(points.slice(0, -1).reverse())
        : points;
}

export function ensureNegativeOrientation(points) {
    return polygonArea(points) > 0
        ? closePoints(points.slice(0, -1).reverse())
        : points;
}

export function pointInPolygon(point, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
        const xi = polygon[i].x;
        const yi = polygon[i].y;
        const xj = polygon[j].x;
        const yj = polygon[j].y;
        const intersects =
            yi > point.y !== yj > point.y &&
            point.x < ((xj - xi) * (point.y - yi)) / (yj - yi || 1e-12) + xi;
        if (intersects) {
            inside = !inside;
        }
    }
    return inside;
}

export function polygonCentroid(points) {
    let signedArea = 0;
    let cx = 0;
    let cy = 0;
    for (let i = 0; i < points.length - 1; i += 1) {
        const a = points[i];
        const b = points[i + 1];
        const cross = a.x * b.y - b.x * a.y;
        signedArea += cross;
        cx += (a.x + b.x) * cross;
        cy += (a.y + b.y) * cross;
    }

    if (Math.abs(signedArea) < 1e-9) {
        return clonePoint(points[0]);
    }

    const scale = 1 / (3 * signedArea);
    return {
        x: cx * scale,
        y: cy * scale,
    };
}

export function compositePocketSeedPaths(selectedLoops) {
    const records = selectedLoops.map((loop) => ({
        loop,
        points: closePoints(loop.points),
        area: Math.abs(polygonArea(loop.points)),
    }));

    records.sort((a, b) => b.area - a.area);

    for (const record of records) {
        const sample = polygonCentroid(record.points);
        record.depth = records.reduce((depth, candidate) => {
            if (candidate === record || candidate.area <= record.area) {
                return depth;
            }
            return pointInPolygon(sample, candidate.points) ? depth + 1 : depth;
        }, 0);
    }

    const orientedPaths = records.map((record) =>
        record.depth % 2 === 0
            ? ensurePositiveOrientation(record.points)
            : ensureNegativeOrientation(record.points),
    );

    const clipper = new ClipperLib.Clipper();
    clipper.AddPaths(
        orientedPaths.map((points) => clipperPathFromPoints(points)),
        ClipperLib.PolyType.ptSubject,
        true,
    );

    const solution = new ClipperLib.Paths();
    clipper.Execute(
        ClipperLib.ClipType.ctUnion,
        solution,
        ClipperLib.PolyFillType.pftNonZero,
        ClipperLib.PolyFillType.pftNonZero,
    );

    return solution
        .map(pointsFromClipperPath)
        .filter((points) => Math.abs(polygonArea(points)) > 1);
}

export function offsetCompositePolygons(paths, delta) {
    if (!paths.length) {
        return [];
    }
    const offsetter = new ClipperLib.ClipperOffset(2, 0.25 * CLIPPER_SCALE);
    offsetter.AddPaths(
        paths.map((points) => clipperPathFromPoints(points)),
        ClipperLib.JoinType.jtRound,
        ClipperLib.EndType.etClosedPolygon,
    );
    const solution = new ClipperLib.Paths();
    offsetter.Execute(solution, delta * CLIPPER_SCALE);
    return solution
        .map(pointsFromClipperPath)
        .filter((points) => Math.abs(polygonArea(points)) > 1);
}

export function booleanPolygons(selectedLoops, operation = 'union') {
    const records = selectedLoops
        .filter((loop) => loop?.closed !== false && loop?.points?.length >= 4)
        .map((loop) => ({
            points: closePoints(loop.points),
            area: Math.abs(polygonArea(loop.points)),
        }))
        .filter((record) => record.area > 1e-6);

    if (records.length < 2) {
        return [];
    }

    // Boolean inputs represent selected filled vectors. Do not infer holes from
    // centroid nesting: overlapping shapes can have their centroid inside a peer.
    const paths = records.map((record) =>
        clipperPathFromPoints(ensurePositiveOrientation(record.points)),
    );
    const fill = ClipperLib.PolyFillType.pftNonZero;
    const execute = (clipType, subject, clip = []) => {
        const clipper = new ClipperLib.Clipper();
        clipper.AddPaths(subject, ClipperLib.PolyType.ptSubject, true);
        if (clip.length) {
            clipper.AddPaths(clip, ClipperLib.PolyType.ptClip, true);
        }
        const solution = new ClipperLib.Paths();
        clipper.Execute(clipType, solution, fill, fill);
        return solution;
    };

    let solution;
    if (operation === 'difference') {
        solution = execute(
            ClipperLib.ClipType.ctDifference,
            [paths[0]],
            paths.slice(1),
        );
    } else if (operation === 'intersection') {
        solution = [paths[0]];
        for (const path of paths.slice(1)) {
            solution = execute(ClipperLib.ClipType.ctIntersection, solution, [
                path,
            ]);
            if (!solution.length) {
                break;
            }
        }
    } else if (operation === 'xor') {
        solution = execute(ClipperLib.ClipType.ctXor, paths);
    } else {
        solution = execute(ClipperLib.ClipType.ctUnion, paths);
    }

    return solution
        .map(pointsFromClipperPath)
        .filter((points) => Math.abs(polygonArea(points)) > 1e-6);
}

export function createToolpathFromLoops(selectedLoops, config, options = {}) {
    if (config.operation === 'vcarve') {
        throw new Error('V-Carve toolpaths must be built asynchronously.');
    }
    return createToolpathSkeleton(selectedLoops, config, options);
}

export async function createToolpathFromLoopsAsync(
    selectedLoops,
    config,
    options = {},
) {
    const toolpath = createToolpathSkeleton(selectedLoops, config, options);

    if (config.operation !== 'vcarve') {
        return toolpath;
    }

    const compositeSelection = compositePocketSeedPaths(selectedLoops);
    const vCarvePassDepth = Math.max(0.01, config.cutDepth);
    const motionPaths = await generateVCarveToolpaths(
        compositeSelection.map(mmPointsToClipperPath),
        {
            cutterAngle: config.cutterAngle,
            passDepth: vCarvePassDepth,
            maxDepth: config.cutDepth,
            onProgress: options.onProgress,
        },
    );

    toolpath.motionPaths = motionPaths;
    toolpath.previewContours = motionPaths
        .map((path) => path.points.map(({ x, y }) => ({ x, y })))
        .filter((points) => points.length >= 2);

    return toolpath;
}

function createToolpathSkeleton(selectedLoops, config, options = {}) {
    const reportProgress = options.onProgress || (() => {});
    const previewContours = [];
    const sourceLoops = [];
    // Shift the loop centerline by the trochoid radius so its inner sweep still
    // reaches the nominal profile boundary.
    const trochoidEngagementPercent = Math.min(
        40,
        Math.max(2, Number(config.trochoidEngagementPercent) || 10),
    );
    const trochoidRadius = config.trochoidEnabled
        ? Math.max(
              0,
              config.toolDiameter * (trochoidEngagementPercent / 100),
          )
        : 0;
    reportProgress(10, 'Preparing geometry');
    const isRasterOp =
        config.operation === 'laser-raster' ||
        config.operation === 'wavy-raster';
    const compositeSelection = isRasterOp
        ? []
        : compositePocketSeedPaths(selectedLoops);
    reportProgress(32, 'Unioning vectors');

    for (const loop of selectedLoops) {
        if (
            config.operation === 'engrave' ||
            config.operation === 'chamfer' ||
            config.operation === 'laser-cut'
        ) {
            if (loop.points) previewContours.push(loop.points.map(clonePoint));
        }
        if (
            config.operation === 'laser-raster' ||
            config.operation === 'wavy-raster' ||
            config.operation === 'halftone'
        ) {
            // for bitmap, loop is the bitmap bounds rect
            if (!loop.isBitmap) {
                if (config.operation !== 'halftone')
                    console.warn(
                        `[${config.operation}] skipping non-bitmap loop ${loop.id} isBitmap=${loop.isBitmap}`,
                    );
                continue;
            }
            const b = loop.bounds ||
                (loop.points ? boundsOfPoints(loop.points) : null) || {
                    minX: 0,
                    minY: 0,
                    maxX: 10,
                    maxY: 10,
                };
            if (
                !b ||
                !Number.isFinite(b.minX) ||
                !Number.isFinite(b.maxY) ||
                !Number.isFinite(b.maxX) ||
                !Number.isFinite(b.minY)
            )
                continue;
            if (config.operation === 'halftone') {
                // halftone preview as circles per pixel — size based on luma will be done in GCode, preview shows all possible dot locations as circles
                const res = Math.max(
                    2,
                    Math.min(100, Number(config.halftoneResolution) || 25),
                );
                const w = b.maxX - b.minX,
                    h = b.maxY - b.minY;
                const cols = Math.round(res * (w / Math.max(w, h)));
                const rows = Math.round(res * (h / Math.max(w, h)));
                const sx = w / cols,
                    sy = h / rows;
                const rPreview = Math.min(sx, sy) * 0.4;
                for (let r = 0; r < rows; r++) {
                    for (let c = 0; c < cols; c++) {
                        const x = b.minX + (c + 0.5) * sx;
                        const y = b.minY + (r + 0.5) * sy;
                        // generate circle preview (16 segments)
                        const pts = [];
                        for (let i = 0; i <= 16; i++) {
                            const a = (i / 16) * Math.PI * 2;
                            pts.push({
                                x: x + Math.cos(a) * rPreview,
                                y: y + Math.sin(a) * rPreview,
                            });
                        }
                        previewContours.push(pts);
                    }
                }
            } else {
                const spot =
                    config.operation === 'wavy-raster'
                        ? config.wavySpot || 2
                        : config.laserSpot || 0.2;
                const h = Math.max(0.1, b.maxY - b.minY);
                if (!Number.isFinite(h) || h <= 0) continue;
                const rows = Math.max(1, Math.ceil(h / spot));
                for (let r = 0; r < rows; r++) {
                    const y = b.minY + (r + 0.5) * spot;
                    if (y < b.minY || y > b.maxY) continue;
                    previewContours.push([
                        { x: b.minX, y },
                        { x: b.maxX, y },
                    ]);
                }
            }
        }
        sourceLoops.push(loop);
    }
    // for raster ops, ensure we have at least one preview contour even if above skipped
    if (
        (config.operation === 'laser-raster' ||
            config.operation === 'wavy-raster' ||
            config.operation === 'halftone') &&
        !previewContours.length
    ) {
        // fallback: use first loop's bounds
        const fb = selectedLoops[0]?.bounds || {
            minX: 0,
            minY: 0,
            maxX: 10,
            maxY: 10,
        };
        previewContours.push([
            { x: fb.minX, y: fb.minY },
            { x: fb.maxX, y: fb.minY },
        ]);
    }

    if (config.operation === 'profile-outside') {
        const radius = config.toolRadius + trochoidRadius;
        previewContours.push(
            ...offsetCompositePolygons(compositeSelection, radius),
        );
        reportProgress(78, 'Offsetting outside profile');
    } else if (config.operation === 'profile-inside') {
        const radius = config.toolRadius + trochoidRadius;
        previewContours.push(
            ...offsetCompositePolygons(compositeSelection, -radius),
        );
        reportProgress(78, 'Offsetting inside profile');
    }

    // Match CAMCANVAS's trochoidal preview: sample orbit centers along the
    // contour, orient each orbit to the local tangent, and use the same
    // radius-based pitch as the emitted motion.
    if (
        trochoidRadius > 0 &&
        (config.operation === 'profile-outside' ||
            config.operation === 'profile-inside')
    ) {
        const sourceContours = previewContours.slice();
        for (const contour of sourceContours) {
            if (contour.length < 2) continue;
            const total = polylineLength(contour);
            const orbitCount = Math.max(
                1,
                Math.ceil(total / Math.max(trochoidRadius * 0.7, 0.25)),
            );
            for (let orbit = 0; orbit <= orbitCount; orbit += 1) {
                const along = (total * orbit) / orbitCount;
                const center = pointAtDistance(contour, along);
                const before = pointAtDistance(
                    contour,
                    Math.max(0, along - trochoidRadius),
                );
                const after = pointAtDistance(
                    contour,
                    Math.min(total, along + trochoidRadius),
                );
                const tangentLength =
                    Math.hypot(after.x - before.x, after.y - before.y) || 1;
                const tx = (after.x - before.x) / tangentLength;
                const ty = (after.y - before.y) / tangentLength;
                const nx = -ty;
                const ny = tx;
                const circle = [];
                for (let step = 0; step <= 18; step += 1) {
                    const angle = (step / 18) * Math.PI * 2;
                    circle.push({
                        x:
                            center.x +
                            (nx * Math.cos(angle) + tx * Math.sin(angle)) *
                                trochoidRadius,
                        y:
                            center.y +
                            (ny * Math.cos(angle) + ty * Math.sin(angle)) *
                                trochoidRadius,
                    });
                }
                previewContours.push(circle);
            }
        }
    }

    if (config.operation === 'pocket') {
        const stepOver =
            config.toolDiameter * (1 - config.overlapPercent / 100);
        const first = offsetCompositePolygons(
            compositeSelection,
            -config.toolRadius,
        );
        previewContours.push(...first);
        let current = first;
        let iteration = 0;
        while (current.length) {
            iteration += 1;
            reportProgress(
                Math.min(84, 40 + iteration * 8),
                'Calculating pocket passes',
            );
            const next = offsetCompositePolygons(current, -stepOver);
            if (!next.length) {
                break;
            }
            previewContours.push(...next);
            current = next;
        }
    }

    const cutDepth = Math.max(0.01, config.cutDepth);
    const passDepth = Math.max(0.01, config.passDepth);
    const passDepths = [];
    let currentDepth = passDepth;
    while (currentDepth < cutDepth) {
        passDepths.push(-Number(currentDepth.toFixed(4)));
        currentDepth += passDepth;
    }
    passDepths.push(-Number(cutDepth.toFixed(4)));

    const operationLabel =
        {
            'profile-outside': 'Profile Outside',
            'profile-inside': 'Profile Inside',
            engrave: 'Engrave',
            chamfer: 'Chamfer',
            pocket: 'Pocket',
            vcarve: 'V-Carve',
            'laser-cut': 'Laser Cut',
            'laser-raster': 'Laser Raster',
            'wavy-raster': 'Wavy',
        }[config.operation] || config.operation;

    const label =
        options.label ||
        `${operationLabel} (${selectedLoops.length} vector${selectedLoops.length === 1 ? '' : 's'})`;
    const chamferWidth =
        config.operation === 'chamfer' && Number.isFinite(config.cutterAngle)
            ? 2 * cutDepth * Math.tan((config.cutterAngle * Math.PI) / 360)
            : null;
    const trochoidMeta =
        config.trochoidEnabled &&
        (config.operation === 'profile-outside' ||
            config.operation === 'profile-inside')
            ? ` - trochoid ${formatNumber(trochoidEngagementPercent)}% engagement`
            : '';
    const cardMeta =
        config.operation === 'vcarve'
            ? `${operationLabel} - T${config.toolNumber} - ${formatNumber(config.cutterAngle)}deg - ${formatNumber(cutDepth)}mm max depth - single pass`
            : config.operation === 'chamfer'
              ? `${operationLabel} - T${config.toolNumber} - ${formatNumber(config.cutterAngle)}deg - ${formatNumber(cutDepth)}mm deep - ${passDepth.toFixed(2)}mm/pass - ${passDepths.length} passes${Number.isFinite(chamferWidth) ? ` - ${formatNumber(chamferWidth)}mm top width` : ''}`
              : `${operationLabel} - T${config.toolNumber} - ${config.toolDiameter.toFixed(1)}mm - ${cutDepth.toFixed(2)}mm deep - ${passDepth.toFixed(2)}mm/pass - ${passDepths.length} passes${trochoidMeta}`;

    reportProgress(96, 'Finalizing toolpath');

    // carry laser/wavy params forward for GCode
    const extra = {};
    if (
        config.operation === 'laser-raster' ||
        config.operation === 'laser-cut' ||
        config.operation === 'wavy-raster' ||
        config.operation === 'halftone'
    ) {
        extra.laserFeed = config.laserFeed || config.feedRate;
        extra.laserPower = config.laserPower || 1000;
        extra.laserSMin = config.laserSMin || 0;
        extra.laserSMax = config.laserSMax || 1000;
        extra.laserSpot = config.laserSpot || 0.2;
        extra.laserGamma = config.laserGamma || 1;
        extra.laserOverscan = Math.max(0, Number(config.laserOverscan) || 0);
        extra.wavyFeed = config.wavyFeed || config.feedRate;
        extra.wavySpot = config.wavySpot || 2;
        extra.wavyMinDepth = config.wavyMinDepth || 0;
        extra.wavyMaxDepth = config.wavyMaxDepth || 3;
        // keep source entities for bitmap raster access
        extra._sourceEntities = options.sourceEntities || null;
    }
    return {
        id: options.id || crypto.randomUUID(),
        label,
        operation: config.operation,
        operationLabel,
        cardMeta:
            config.operation === 'laser-raster'
                ? `Laser Raster - ${selectedLoops.length} bitmaps - spot ${extra.laserSpot}mm`
                : config.operation === 'wavy-raster'
                  ? `Wavy - ${selectedLoops.length} bitmaps - ${extra.wavyMinDepth}→${extra.wavyMaxDepth}mm`
                  : config.operation === 'laser-cut'
                    ? `Laser Cut - ${selectedLoops.length} vectors`
                    : cardMeta,
        toolDiameter: config.toolDiameter,
        toolRadius: config.toolRadius,
        cutterAngle: config.cutterAngle,
        overlapPercent: config.overlapPercent,
        cutDepth,
        passDepth,
        passDepths,
        trochoidEnabled: Boolean(config.trochoidEnabled),
        trochoidRadius,
        trochoidEngagementPercent,
        tabWidth: config.tabWidth,
        tabHeight: config.tabHeight,
        safeZ: config.safeZ,
        feedRate: config.feedRate,
        plungeRate: config.plungeRate,
        spindle: config.spindle,
        toolNumber: config.toolNumber,
        libraryToolId: config.libraryToolId || null,
        libraryToolName: config.libraryToolName || '',
        libraryToolVendor: config.libraryToolVendor || '',
        libraryToolImage: config.libraryToolImage || '',
        libraryToolUrl: config.libraryToolUrl || '',
        libraryToolDescription: config.libraryToolDescription || '',
        previewContours,
        motionPaths: [],
        sourceLoops,
        tabs: [],
        ...extra,
    };
}

export function nearestPointOnPolyline(points, target) {
    let best = null;
    let accumulated = 0;
    for (let i = 1; i < points.length; i += 1) {
        const a = points[i - 1];
        const b = points[i];
        const abx = b.x - a.x;
        const aby = b.y - a.y;
        const lengthSq = abx * abx + aby * aby;
        if (lengthSq === 0) {
            continue;
        }
        const t = Math.max(
            0,
            Math.min(
                1,
                ((target.x - a.x) * abx + (target.y - a.y) * aby) / lengthSq,
            ),
        );
        const point = { x: a.x + abx * t, y: a.y + aby * t };
        const distance = dist(point, target);
        const segmentLength = Math.sqrt(lengthSq);
        if (!best || distance < best.distance) {
            best = {
                point,
                distance,
                along: accumulated + segmentLength * t,
            };
        }
        accumulated += segmentLength;
    }
    return best;
}

export function buildTabMarker(contour, alongDistance, width, transform) {
    const half = width / 2;
    const total = polylineLength(contour);
    const startDistance = Math.max(0, alongDistance - half);
    const endDistance = Math.min(total, alongDistance + half);
    const aPoint = pointAtDistance(contour, startDistance);
    const bPoint = pointAtDistance(contour, endDistance);
    const centerPoint = pointAtDistance(contour, alongDistance);
    const spine = slicePolyline(contour, startDistance, endDistance);
    return {
        a: transform(aPoint),
        b: transform(bPoint),
        center: transform(centerPoint),
        spine: spine.map(transform),
        worldA: aPoint,
        worldB: bPoint,
        worldCenter: centerPoint,
        worldSpine: spine,
    };
}

export function getMinimumTabWidth(toolDiameter) {
    return toolDiameter * 1.5;
}

export function getTabCenterlineSpan(tabWidth, toolDiameter) {
    return tabWidth + toolDiameter;
}

export function operationUsesTabs(toolpath) {
    return (
        toolpath.operation === 'profile-outside' ||
        toolpath.operation === 'profile-inside' ||
        toolpath.operation === 'laser-cut'
    );
}

export function usesVCarve(operation) {
    return operation === 'vcarve';
}

export function isVCarveEngineReady() {
    return isVCarveReady();
}

export function ensureVCarveEngineReady() {
    return ensureVCarveReady();
}

export function getVCarveEngineLoadError() {
    return getVCarveLoadError();
}

export function tabTopDepth(toolpath) {
    return -Math.max(0, toolpath.cutDepth - toolpath.tabHeight);
}

export function buildGcode({
    toolpaths,
    fileName,
    forcePolylineArcs,
    onProgress = () => {},
}) {
    for (const toolpath of toolpaths) {
        const values = [
            ['Z Safe', toolpath.safeZ],
            ['Feed Rate', toolpath.feedRate],
            ['Plunge Rate', toolpath.plungeRate],
            ['Spindle RPM', toolpath.spindle],
            ['Tool diameter', toolpath.toolDiameter],
        ];
        const invalidValue = values.find(
            ([, value]) =>
                !Number.isFinite(Number(value)) || Number(value) <= 0,
        );
        if (invalidValue) {
            throw new Error(
                `${invalidValue[0]} must be greater than zero for ${toolpath.label || 'each toolpath'}.`,
            );
        }
        if (
            (toolpath.operation === 'vcarve' ||
                toolpath.operation === 'chamfer') &&
            (!Number.isFinite(Number(toolpath.cutterAngle)) ||
                Number(toolpath.cutterAngle) <= 0 ||
                Number(toolpath.cutterAngle) >= 180)
        ) {
            throw new Error(
                `V-bit angle must be between 1 and 179 degrees for ${toolpath.label || 'each toolpath'}.`,
            );
        }
        if (
            toolpath.operation !== 'vcarve' &&
            toolpath.operation !== 'laser-raster' &&
            toolpath.operation !== 'laser-cut' &&
            toolpath.operation !== 'wavy-raster'
        ) {
            const passDepth = Number(toolpath.passDepth);
            const cutDepth = Number(toolpath.cutDepth);
            if (
                !Number.isFinite(passDepth) ||
                passDepth <= 0 ||
                passDepth > cutDepth
            ) {
                throw new Error(
                    `Pass depth must be greater than zero and no deeper than final depth for ${toolpath.label || 'each toolpath'}.`,
                );
            }
            if (operationUsesTabs(toolpath)) {
                const tabHeight = Number(toolpath.tabHeight);
                if (
                    !Number.isFinite(tabHeight) ||
                    tabHeight < 0 ||
                    tabHeight >= cutDepth
                ) {
                    throw new Error(
                        `Tab height must be zero or greater and less than final depth for ${toolpath.label || 'each toolpath'}.`,
                    );
                }
                if ((toolpath.tabs || []).length) {
                    const tabWidth = Number(toolpath.tabWidth);
                    if (
                        !Number.isFinite(tabWidth) ||
                        tabWidth < 3 ||
                        tabWidth > 50
                    ) {
                        throw new Error(
                            `Tab width must be between 3 and 50 mm for ${toolpath.label || 'each toolpath'}.`,
                        );
                    }
                }
            }
            if (toolpath.trochoidEnabled) {
                if (
                    toolpath.operation !== 'profile-outside' &&
                    toolpath.operation !== 'profile-inside'
                ) {
                    throw new Error(
                        `Trochoidal cutting is only supported for inside and outside profiles (${toolpath.label || 'each toolpath'}).`,
                    );
                }
                const engagement = Number(toolpath.trochoidEngagementPercent);
                const radius = Number(toolpath.trochoidRadius);
                if (
                    (!Number.isFinite(engagement) ||
                        engagement < 2 ||
                        engagement > 40) &&
                    (!Number.isFinite(radius) ||
                        radius <= 0 ||
                        radius > Number(toolpath.toolDiameter) * 0.4)
                ) {
                    throw new Error(
                        `Trochoidal engagement must be between 2% and 40% for ${toolpath.label || 'each toolpath'}.`,
                    );
                }
            }
        }
    }
    const lines = [
        '(gCAM GRBL output)',
        `(${fileName || 'untitled.dxf'})`,
        'G21',
        'G90',
        'G17',
    ];

    const totalSteps = Math.max(
        1,
        toolpaths.reduce((count, toolpath) => {
            if (toolpath.operation === 'vcarve') {
                return count + Math.max(1, (toolpath.motionPaths || []).length);
            }
            return (
                count +
                Math.max(
                    1,
                    toolpath.passDepths.length *
                        Math.max(1, toolpath.previewContours.length),
                )
            );
        }, 0),
    );
    let completedSteps = 0;
    let currentToolNumber = null;
    let spindleRunning = false;
    let currentSpindle = null;
    const reportProgress = (label) => {
        completedSteps += 1;
        onProgress(
            Math.min(99, Math.round((completedSteps / totalSteps) * 100)),
            label,
        );
    };

    for (const toolpath of toolpaths) {
        const safeZ = toolpath.safeZ;
        const feed = toolpath.feedRate;
        const plunge = toolpath.plungeRate;
        const spindle = toolpath.spindle;
        const toolNumber = Number.isFinite(toolpath.toolNumber)
            ? Math.max(1, Math.round(toolpath.toolNumber))
            : null;
        lines.push(`(${toolpath.operationLabel} - ${toolpath.label})`);
        const requiresToolChange =
            toolNumber && toolNumber !== currentToolNumber;
        if (requiresToolChange) {
            lines.push(`G0 Z${formatNumber(safeZ)}`);
            if (spindleRunning) {
                lines.push('M5');
                spindleRunning = false;
            }
            lines.push(`(${buildToolChangeComment(toolpath, toolNumber)})`);
            lines.push(`T${toolNumber}`);
            lines.push('M6');
            currentToolNumber = toolNumber;
        }

        if (toolpath.operation === 'vcarve') {
            emitVCarveMoves(lines, toolpath, feed, plunge, safeZ, {
                spindle,
                spindleState: {
                    running: spindleRunning,
                    speed: currentSpindle,
                },
            });
            spindleRunning = true;
            currentSpindle = spindle;
            reportProgress(`Writing ${toolpath.operationLabel}`);
            lines.push(`G0 Z${formatNumber(safeZ)}`);
            continue;
        }

        if (toolpath.operation === 'laser-cut') {
            // Laser cut: M4 once, G0 travel, G1 F S cut (no Z)
            if (!spindleRunning || currentSpindle !== toolpath.laserPower) {
                if (spindleRunning) lines.push('M5');
                lines.push(`M4 S0`);
                spindleRunning = true;
                currentSpindle = toolpath.laserPower;
            }
            for (const contour of toolpath.previewContours) {
                if (!contour.length) continue;
                const start = contour[0];
                lines.push(
                    `G0 X${formatNumber(start.x)} Y${formatNumber(start.y)}`,
                );
                lines.push(
                    `G1 F${formatNumber(toolpath.laserFeed || feed)} S${Math.round(toolpath.laserPower || 1000)}`,
                );
                for (let i = 1; i < contour.length; i++) {
                    const p = contour[i];
                    lines.push(
                        `G1 X${formatNumber(p.x)} Y${formatNumber(p.y)}`,
                    );
                }
            }
            reportProgress(`Writing ${toolpath.operationLabel}`);
            continue;
        }
        if (
            toolpath.operation === 'laser-raster' ||
            toolpath.operation === 'wavy-raster' ||
            toolpath.operation === 'halftone'
        ) {
            const isWavy = toolpath.operation === 'wavy-raster';
            const isHalftone = toolpath.operation === 'halftone';
            const isWavyHalftone = isWavy || isHalftone;
            console.log(
                `[${toolpath.operation} GCode] toolpath ${toolpath.id} sourceLoops`,
                toolpath.sourceLoops.map((l) => ({
                    id: l.id,
                    isBitmap: l.isBitmap,
                    bounds: l.bounds,
                })),
                `_sourceEntities`,
                toolpath._sourceEntities?.length,
            );
            // bitmap raster: need image data from source entity — try multiple sources (worker vs main)
            let bitmapEnt = null;
            // try _sourceEntities first (if passed from main)
            const tryFind = (entities) => {
                if (!entities) return null;
                for (const e of entities)
                    if (e?.type === 'BITMAP' && e._imageData) return e;
                return null;
            };
            bitmapEnt = tryFind(toolpath._sourceEntities);
            if (!bitmapEnt) {
                const srcIdx =
                    toolpath.sourceLoops?.[0]?.sourceEntityIndexes?.[0];
                const ent =
                    srcIdx != null
                        ? toolpath._sourceEntities?.[srcIdx] || null
                        : null;
                if (ent?.type === 'BITMAP' && ent._imageData) bitmapEnt = ent;
            }
            if (!bitmapEnt) {
                // fallback: find BITMAP in global state if available (main thread)
                try {
                    const globalEnts =
                        (typeof window !== 'undefined' &&
                            window.GCAM_STATE?.entities) ||
                        (typeof self !== 'undefined' &&
                            self.GCAM_STATE?.entities) ||
                        null;
                    if (globalEnts) bitmapEnt = tryFind(globalEnts);
                } catch {}
            }
            if (!bitmapEnt) {
                // last fallback: try to find any BITMAP in toolpath sourceLoops via global state
                for (const l of toolpath.sourceLoops || []) {
                    const ei = l.sourceEntityIndexes?.[0];
                    // try global state
                    try {
                        const ge =
                            (typeof window !== 'undefined'
                                ? window.GCAM_STATE?.entities?.[ei]
                                : null) || null;
                        if (ge?.type === 'BITMAP' && ge._imageData) {
                            bitmapEnt = ge;
                            break;
                        }
                    } catch {}
                    const e2 =
                        ei != null ? toolpath._sourceEntities?.[ei] : null;
                    if (e2?.type === 'BITMAP' && e2._imageData) {
                        bitmapEnt = e2;
                        break;
                    }
                }
            }
            if (!bitmapEnt || !bitmapEnt._imageData) {
                // still no data — try to use previewContours as fallback (draw scan lines without image sampling, use uniform power)
                if (
                    toolpath.previewContours &&
                    toolpath.previewContours.length
                ) {
                    // fallback: just emit preview contours as G1 moves
                    for (const contour of toolpath.previewContours) {
                        if (!contour.length) continue;
                        const s = contour[0];
                        lines.push(
                            `G0 X${formatNumber(s.x)} Y${formatNumber(s.y)}`,
                        );
                        for (let i = 1; i < contour.length; i++) {
                            const p = contour[i];
                            if (isWavy)
                                lines.push(
                                    `G1 X${formatNumber(p.x)} Y${formatNumber(p.y)} Z${formatNumber(-toolpath.wavyMaxDepth || -3)} F${formatNumber(toolpath.wavyFeed || 1000)}`,
                                );
                            else
                                lines.push(
                                    `G1 X${formatNumber(p.x)} Y${formatNumber(p.y)} S${Math.round(toolpath.laserSMax || 1000)} F${formatNumber(toolpath.laserFeed || 3000)}`,
                                );
                        }
                    }
                    reportProgress(`Writing ${toolpath.operationLabel}`);
                    continue;
                }
                lines.push(
                    `(No bitmap data for ${toolpath.operationLabel} - image not loaded)`,
                );
                reportProgress(`Writing ${toolpath.operationLabel}`);
                continue;
            }
            // header for laser/wavy raster
            if (
                !spindleRunning ||
                (isWavy
                    ? currentSpindle !== 0
                    : currentSpindle !== toolpath.laserPower)
            ) {
                if (spindleRunning) lines.push('M5');
                if (isWavy) {
                    lines.push(`M3 S${Math.round(spindle)}`);
                    spindleRunning = true;
                    currentSpindle = 0;
                } else {
                    lines.push(`M4 S0`);
                    spindleRunning = true;
                    currentSpindle = toolpath.laserPower;
                }
            }
            // generate rasters: reuse simplelaser logic simplified — for wavy/halftone map luma to Z/hole size
            const b = bitmapEnt?.bounds ||
                toolpath.sourceLoops?.[0]?.bounds ||
                (toolpath.sourceLoops?.[0]?.points && {
                    minX: 0,
                    minY: 0,
                    maxX: 10,
                    maxY: 10,
                }) || { minX: 0, minY: 0, maxX: 10, maxY: 10 };
            if (
                !b ||
                !Number.isFinite(b.minX) ||
                !Number.isFinite(b.maxX) ||
                b.maxX <= b.minX
            ) {
                console.warn('[laser-raster] missing bounds', b, toolpath);
                lines.push(
                    `(Skipped ${toolpath.operationLabel} - missing bounds)`,
                );
                reportProgress(`Writing ${toolpath.operationLabel}`);
                continue;
            }
            // Halftone special: grid of holes sized by luma, depth via v-bit
            if (isHalftone) {
                const res = Math.max(
                    2,
                    Math.min(100, Number(toolpath.halftoneResolution) || 25),
                );
                const invert = !!toolpath.halftoneInvert;
                const w = b.maxX - b.minX,
                    h = b.maxY - b.minY;
                const cols = Math.round(res * (w / Math.max(w, h)));
                const rows = Math.round(res * (h / Math.max(w, h)));
                const sx = w / cols,
                    sy = h / rows;
                const maxHole = Math.min(sx, sy) * 0.8;
                const angleRad = ((toolpath.cutterAngle || 90) * Math.PI) / 180;
                const depthForWidth = (width) =>
                    width / 2 / Math.tan(angleRad / 2);
                const img2 = bitmapEnt._imageData;
                const iw2 = img2.width,
                    ih2 = img2.height,
                    data2 = img2.data;
                const luma2 = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;
                for (let r = 0; r < rows; r++) {
                    for (let c = 0; c < cols; c++) {
                        const x = b.minX + (c + 0.5) * sx;
                        const y = b.minY + (r + 0.5) * sy;
                        const u = Math.floor(
                            ((x - b.minX) / (b.maxX - b.minX)) * iw2,
                        );
                        const v = Math.floor(
                            ((b.maxY - y) / (b.maxY - b.minY)) * ih2,
                        );
                        const idx =
                            (Math.min(ih2 - 1, Math.max(0, v)) * iw2 +
                                Math.min(iw2 - 1, Math.max(0, u))) *
                            4;
                        const lum =
                            luma2(data2[idx], data2[idx + 1], data2[idx + 2]) /
                            255;
                        const hole = invert
                            ? maxHole * lum
                            : maxHole * (1 - lum);
                        if (hole < 0.1) continue;
                        const depth = depthForWidth(hole);
                        lines.push(
                            `G0 X${formatNumber(x)} Y${formatNumber(y)}`,
                        );
                        lines.push(
                            `G1 Z${formatNumber(-depth)} F${formatNumber(toolpath.plungeRate || feed)}`,
                        );
                        lines.push(`G0 Z${formatNumber(safeZ)}`);
                    }
                }
                reportProgress(`Writing ${toolpath.operationLabel}`);
                continue;
            }
            const spot = isWavy
                ? toolpath.wavySpot || 2
                : toolpath.laserSpot || 0.2;
            const feed = isWavy
                ? toolpath.wavyFeed || feed
                : toolpath.laserFeed || 3000;
            const img = bitmapEnt._imageData;
            const iw = img.width,
                ih = img.height,
                data = img.data;
            const luma = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;
            const overscan = Math.max(0, Number(toolpath.laserOverscan) || 0);
            const scanMinX = b.minX - overscan;
            const scanMaxX = b.maxX + overscan;
            const cols = Math.max(1, Math.ceil((scanMaxX - scanMinX) / spot));
            const rows = Math.max(1, Math.ceil((b.maxY - b.minY) / spot));
            for (let r = 0; r < rows; r++) {
                const y = b.minY + (r + 0.5) * spot;
                if (y < b.minY || y > b.maxY) continue;
                lines.push(`G0 X${formatNumber(scanMinX)} Y${formatNumber(y)}`);
                for (let c = 0; c < cols; c++) {
                    const x = scanMinX + (c + 0.5) * spot;
                    const sampleX = Math.min(b.maxX, Math.max(b.minX, x));
                    const u = Math.floor(
                        ((sampleX - b.minX) / (b.maxX - b.minX)) * iw,
                    );
                    const v = Math.floor(
                        ((b.maxY - y) / (b.maxY - b.minY)) * ih,
                    );
                    const idx =
                        (Math.min(ih - 1, Math.max(0, v)) * iw +
                            Math.min(iw - 1, Math.max(0, u))) *
                        4;
                    const lum = luma(data[idx], data[idx + 1], data[idx + 2]);
                    if (isWavy) {
                        const minD = toolpath.wavyMinDepth || 0,
                            maxD = toolpath.wavyMaxDepth || 3;
                        const z = -(minD + (1 - lum / 255) * (maxD - minD));
                        // wavy: vary Z along X, G1 Z depth (laser off, CNC)
                        if (c === 0)
                            lines.push(
                                `G1 Z${formatNumber(z)} F${formatNumber(feed)}`,
                            );
                        lines.push(
                            `G1 X${formatNumber(x)} Z${formatNumber(z)} F${formatNumber(feed)}`,
                        );
                    } else {
                        const sMin = toolpath.laserSMin || 0,
                            sMax = toolpath.laserSMax || 1000;
                        const gamma = toolpath.laserGamma || 1;
                        let v2 = lum;
                        if (gamma !== 1) v2 = 255 * Math.pow(v2 / 255, gamma);
                        const s = Math.round(
                            sMin + (1 - v2 / 255) * (sMax - sMin),
                        );
                        lines.push(
                            `G1 X${formatNumber(x)} S${s} F${formatNumber(feed)}`,
                        );
                    }
                }
            }
            reportProgress(`Writing ${toolpath.operationLabel}`);
            continue;
        }

        let startedThisToolpath = false;
        for (const depth of toolpath.passDepths) {
            for (
                let contourIndex = 0;
                contourIndex < toolpath.previewContours.length;
                contourIndex += 1
            ) {
                const contour = toolpath.previewContours[contourIndex];
                if (!contour.length) {
                    continue;
                }

                const start = getProfileStartPoint(contour, toolpath);
                lines.push(`G0 Z${formatNumber(safeZ)}`);
                lines.push(
                    `G0 X${formatNumber(start.x)} Y${formatNumber(start.y)}`,
                );
                if (
                    !startedThisToolpath ||
                    !spindleRunning ||
                    currentSpindle !== spindle
                ) {
                    lines.push(`M3 S${Math.round(spindle)}`);
                    spindleRunning = true;
                    currentSpindle = spindle;
                    startedThisToolpath = true;
                }

                const tabsForContour = operationUsesTabs(toolpath)
                    ? toolpath.tabs
                          .filter((tab) => tab.contourIndex === contourIndex)
                          .sort((a, b) => a.along - b.along)
                    : [];

                const fixedTabDepth = tabTopDepth(toolpath);
                const passUsesTabs =
                    tabsForContour.length > 0 && depth < fixedTabDepth;

                if (!passUsesTabs) {
                    lines.push(
                        `G1 Z${formatNumber(depth)} F${formatNumber(plunge)}`,
                    );
                    emitProfileContourMoves(
                        lines,
                        contour,
                        depth,
                        feed,
                        plunge,
                        forcePolylineArcs,
                        toolpath,
                    );
                    reportProgress(`Writing ${toolpath.operationLabel}`);
                    continue;
                }

                lines.push(
                    `G1 Z${formatNumber(depth)} F${formatNumber(plunge)}`,
                );
                emitContourWithTabRamps(
                    lines,
                    contour,
                    depth,
                    fixedTabDepth,
                    tabsForContour,
                    toolpath,
                    feed,
                    forcePolylineArcs,
                );
                reportProgress(`Writing ${toolpath.operationLabel}`);
            }
        }
        lines.push(`G0 Z${formatNumber(safeZ)}`);
    }

    if (spindleRunning) {
        lines.push('M5');
    }
    lines.push('M30');
    return lines.join('\n');
}

export async function buildGcodeAsync({
    toolpaths,
    fileName,
    forcePolylineArcs,
    onProgress = () => {},
}) {
    // Wrap the synchronous buildGcode in an async function that yields to the event loop
    // This allows progress updates to be sent to the main thread
    return new Promise((resolve, reject) => {
        try {
            // Run the synchronous buildGcode but with a yielding progress callback
            let lastYield = 0;
            const yieldingProgress = (percent, label) => {
                onProgress(percent, label);
                const now = performance.now();
                // Yield to event loop every ~50ms to keep worker responsive
                if (now - lastYield > 50) {
                    lastYield = now;
                    setTimeout(() => {}, 0);
                }
            };
            const result = buildGcode({
                toolpaths,
                fileName,
                forcePolylineArcs,
                onProgress: yieldingProgress,
            });
            onProgress(100, 'G-code ready');
            resolve(result);
        } catch (error) {
            reject(error);
        }
    });
}

function buildToolChangeComment(toolpath, toolNumber) {
    const parts = [`Change to tool T${toolNumber}`];
    const namedTool = (toolpath.libraryToolName || '').trim();
    if (namedTool) {
        parts.push(namedTool);
    } else if (
        (toolpath.operation === 'vcarve' || toolpath.operation === 'chamfer') &&
        Number.isFinite(toolpath.cutterAngle)
    ) {
        parts.push(`${formatNumber(toolpath.cutterAngle)}deg V-bit`);
    } else if (Number.isFinite(toolpath.toolDiameter)) {
        parts.push(`${formatNumber(toolpath.toolDiameter)}mm tool`);
    }
    return parts.join(' - ');
}

function emitVCarveMoves(lines, toolpath, feed, plunge, safeZ, options = {}) {
    const spindle = options.spindle;
    const spindleState = options.spindleState || {
        running: false,
        speed: null,
    };
    let started = false;
    for (const path of toolpath.motionPaths || []) {
        if (!path.points?.length) {
            continue;
        }
        const [start, ...rest] = path.points;
        lines.push(`G0 Z${formatNumber(safeZ)}`);
        lines.push(`G0 X${formatNumber(start.x)} Y${formatNumber(start.y)}`);
        if (
            !started ||
            !spindleState.running ||
            spindleState.speed !== spindle
        ) {
            lines.push(`M3 S${Math.round(spindle)}`);
            spindleState.running = true;
            spindleState.speed = spindle;
            started = true;
        }
        lines.push(`G1 Z${formatNumber(start.z)} F${formatNumber(plunge)}`);

        let previous = start;
        for (const point of rest) {
            const sameXY =
                Math.abs(point.x - previous.x) < 0.0001 &&
                Math.abs(point.y - previous.y) < 0.0001;
            if (sameXY) {
                const rate = point.z < previous.z ? plunge : feed;
                lines.push(
                    `G1 Z${formatNumber(point.z)} F${formatNumber(rate)}`,
                );
            } else {
                lines.push(
                    `G1 X${formatNumber(point.x)} Y${formatNumber(point.y)} Z${formatNumber(point.z)} F${formatNumber(feed)}`,
                );
            }
            previous = point;
        }
    }
}

function emitContourMoves(
    lines,
    contour,
    depth,
    feed,
    plunge,
    forcePolylineArcs,
) {
    if (contour.length < 2) {
        return;
    }
    if (
        !forcePolylineArcs &&
        tryEmitCircleArcs(lines, contour, depth, feed, plunge)
    ) {
        return;
    }
    for (let i = 1; i < contour.length; i += 1) {
        const point = contour[i];
        lines.push(
            `G1 X${formatNumber(point.x)} Y${formatNumber(point.y)} F${formatNumber(feed)}`,
        );
    }
}

function emitProfileContourMoves(
    lines,
    contour,
    depth,
    feed,
    plunge,
    forcePolylineArcs,
    toolpath,
) {
    if (toolpath.trochoidEnabled && toolpath.trochoidRadius > 0) {
        emitTrochoidalContourMoves(
            lines,
            contour,
            depth,
            feed,
            toolpath.trochoidRadius,
            null,
            forcePolylineArcs,
        );
        return;
    }
    emitContourMoves(lines, contour, depth, feed, plunge, forcePolylineArcs);
}

function emitContourWithTabRamps(
    lines,
    contour,
    cutDepth,
    tabDepth,
    tabs,
    toolpath,
    feed,
    forcePolylineArcs,
) {
    const total = polylineLength(contour);
    const rampLength = Math.max(toolpath.toolDiameter * 0.75, 0.5);
    const tabZones = tabs.map((tab) => {
        const width = Math.max(
            toolpath.tabWidth,
            getMinimumTabWidth(toolpath.toolDiameter),
        );
        const span = getTabCenterlineSpan(width, toolpath.toolDiameter);
        const start = Math.max(0, tab.along - span / 2);
        const end = Math.min(total, tab.along + span / 2);
        return {
            rampStart: Math.max(0, start - rampLength),
            start,
            end,
            rampEnd: Math.min(total, end + rampLength),
        };
    });
    const distances = new Set([0, total]);
    let walked = 0;
    for (let index = 1; index < contour.length - 1; index += 1) {
        walked += dist(contour[index - 1], contour[index]);
        distances.add(walked);
    }
    for (const zone of tabZones) {
        distances.add(zone.rampStart);
        distances.add(zone.start);
        distances.add(zone.end);
        distances.add(zone.rampEnd);
    }
    const lift = tabDepth - cutDepth;
    const depthAt = (along) =>
        tabZones.reduce((currentDepth, zone) => {
            let factor = 0;
            if (along >= zone.rampStart && along < zone.start) {
                factor =
                    (along - zone.rampStart) /
                    Math.max(0.0001, zone.start - zone.rampStart);
            } else if (along >= zone.start && along <= zone.end) {
                factor = 1;
            } else if (along > zone.end && along <= zone.rampEnd) {
                factor =
                    1 -
                    (along - zone.end) /
                        Math.max(0.0001, zone.rampEnd - zone.end);
            }
            return Math.max(currentDepth, cutDepth + lift * factor);
        }, cutDepth);
    if (toolpath.trochoidEnabled && toolpath.trochoidRadius > 0) {
        emitTrochoidalContourMoves(
            lines,
            contour,
            cutDepth,
            feed,
            toolpath.trochoidRadius,
            depthAt,
            forcePolylineArcs,
        );
        return;
    }
    const points = Array.from(distances).sort((a, b) => a - b);
    for (const along of points.slice(1)) {
        const point = pointAtDistance(contour, along);
        lines.push(
            `G1 X${formatNumber(point.x)} Y${formatNumber(point.y)} Z${formatNumber(depthAt(along))} F${formatNumber(feed)}`,
        );
    }
}

function emitTrochoidalContourMoves(
    lines,
    contour,
    depth,
    feed,
    radius,
    depthAt = null,
    forcePolylineArcs = false,
) {
    const total = polylineLength(contour);
    const advance = Math.max(radius * 0.7, 0.25);
    const samples = Math.max(1, Math.ceil(total / advance));
    const stepsPerLoop = 16;
    const zAt = (along) => (depthAt ? depthAt(along) : depth);

    for (let index = 0; index <= samples; index += 1) {
        const along = (total * index) / samples;
        const nextAlong = Math.min(total, (total * (index + 1)) / samples);
        const before = pointAtDistance(contour, Math.max(0, along - advance));
        const after = pointAtDistance(
            contour,
            Math.min(total, along + advance),
        );
        const center = pointAtDistance(contour, along);
        const tangentLength =
            Math.hypot(after.x - before.x, after.y - before.y) || 1;
        const tx = (after.x - before.x) / tangentLength;
        const ty = (after.y - before.y) / tangentLength;
        const nx = -(after.y - before.y) / tangentLength;
        const ny = (after.x - before.x) / tangentLength;

        const start = { x: center.x + nx * radius, y: center.y + ny * radius };
        const opposite = {
            x: center.x - nx * radius,
            y: center.y - ny * radius,
        };
        const midAlong = along + (nextAlong - along) / 2;

        if (index > 0) {
            lines.push(
                `G1 X${formatNumber(start.x)} Y${formatNumber(start.y)} Z${formatNumber(zAt(along))} F${formatNumber(feed)}`,
            );
        }

        if (!forcePolylineArcs) {
            // Two half arcs reliably express a complete trochoidal circle to GRBL.
            lines.push(
                `G3 X${formatNumber(opposite.x)} Y${formatNumber(opposite.y)} Z${formatNumber(zAt(midAlong))} I${formatNumber(-nx * radius)} J${formatNumber(-ny * radius)} F${formatNumber(feed)}`,
            );
            lines.push(
                `G3 X${formatNumber(start.x)} Y${formatNumber(start.y)} Z${formatNumber(zAt(nextAlong))} I${formatNumber(nx * radius)} J${formatNumber(ny * radius)} F${formatNumber(feed)}`,
            );
            continue;
        }

        for (let step = index === 0 ? 1 : 0; step <= stepsPerLoop; step += 1) {
            const progress = step / stepsPerLoop;
            const phase = progress * Math.PI * 2;
            const point = {
                x:
                    center.x +
                    (nx * Math.cos(phase) + tx * Math.sin(phase)) * radius,
                y:
                    center.y +
                    (ny * Math.cos(phase) + ty * Math.sin(phase)) * radius,
            };
            const z = zAt(along + (nextAlong - along) * progress);
            lines.push(
                `G1 X${formatNumber(point.x)} Y${formatNumber(point.y)} Z${formatNumber(z)} F${formatNumber(feed)}`,
            );
        }
    }
}

function getProfileStartPoint(contour, toolpath) {
    if (
        !toolpath.trochoidEnabled ||
        toolpath.trochoidRadius <= 0 ||
        contour.length < 2
    ) {
        return contour[0];
    }
    const start = contour[0];
    const next = contour[1];
    const length = Math.hypot(next.x - start.x, next.y - start.y) || 1;
    return {
        x: start.x - ((next.y - start.y) / length) * toolpath.trochoidRadius,
        y: start.y + ((next.x - start.x) / length) * toolpath.trochoidRadius,
    };
}

function tryEmitCircleArcs(lines, contour, depth, feed, plunge) {
    if (contour.length < 16) {
        return false;
    }
    const bounds = boundsOfPoints(contour);
    const cx = (bounds.minX + bounds.maxX) / 2;
    const cy = (bounds.minY + bounds.maxY) / 2;
    const radius = dist(contour[0], { x: cx, y: cy });
    const maxError = contour.reduce(
        (error, point) =>
            Math.max(error, Math.abs(dist(point, { x: cx, y: cy }) - radius)),
        0,
    );
    if (maxError > 0.05) {
        return false;
    }
    const start = contour[0];
    const half = pointAtDistance(contour, polylineLength(contour) / 2);
    lines.push(`G1 Z${formatNumber(depth)} F${formatNumber(plunge)}`);
    lines.push(
        `G2 X${formatNumber(half.x)} Y${formatNumber(half.y)} I${formatNumber(cx - start.x)} J${formatNumber(cy - start.y)} F${formatNumber(feed)}`,
    );
    lines.push(
        `G2 X${formatNumber(start.x)} Y${formatNumber(start.y)} I${formatNumber(cx - half.x)} J${formatNumber(cy - half.y)} F${formatNumber(feed)}`,
    );
    return true;
}

function slicePolyline(points, fromDistance, toDistance) {
    const sliced = [pointAtDistance(points, fromDistance)];
    let walked = 0;
    for (let i = 1; i < points.length; i += 1) {
        const a = points[i - 1];
        const b = points[i];
        const segmentLength = dist(a, b);
        const nextWalk = walked + segmentLength;
        if (nextWalk > fromDistance && nextWalk < toDistance) {
            sliced.push(clonePoint(b));
        }
        walked = nextWalk;
    }
    sliced.push(pointAtDistance(points, toDistance));
    return sliced;
}

export function formatNumber(value) {
    return Number(value)
        .toFixed(4)
        .replace(/\.?0+$/, '');
}
