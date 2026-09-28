/**
 * Purpose: Implementation module for worker-input in the engine domain.
 */
function pointForWorker(point) {
    const x = Number(point?.x);
    const y = Number(point?.y);
    const z = Number(point?.z ?? 0);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
        throw new Error('3D preview contains an invalid toolpath coordinate.');
    }
    return { x, y, z };
}

// Keep the worker boundary explicitly structured-cloneable. Toolpaths contain
// geometry class instances in the editor, which cannot cross the worker seam.
export function previewWorkerToolpaths(toolpaths) {
    return (toolpaths || []).map((toolpath) => ({
        previewContours: (toolpath.previewContours || []).map((contour) =>
            contour.map(pointForWorker),
        ),
        motionPaths: (toolpath.motionPaths || []).map((path) => ({
            points: (path.points || []).map(pointForWorker),
        })),
        tabs: (toolpath.tabs || []).map((tab) => ({
            contourIndex: Number(tab.contourIndex) || 0,
            along: Number(tab.along) || 0,
        })),
        passDepths: (toolpath.passDepths || [])
            .map(Number)
            .filter(Number.isFinite),
        toolDiameter: Number(toolpath.toolDiameter) || 0,
        trochoidEnabled: Boolean(toolpath.trochoidEnabled),
        trochoidRadius: Number(toolpath.trochoidRadius) || 0,
        operation: toolpath.operation || '',
        cutterAngle: Number(toolpath.cutterAngle) || 0,
        tabHeight: Number(toolpath.tabHeight) || 0,
        tabWidth: Number(toolpath.tabWidth) || 0,
        cutDepth: Number(toolpath.cutDepth) || 0,
    }));
}
