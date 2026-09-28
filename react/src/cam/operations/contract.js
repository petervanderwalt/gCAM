/**
 * A CAM operation is deliberately data-free: it receives shared geometry and
 * emitter services from cam-ops instead of importing the application layer.
 * That keeps an operation runnable in both the main thread and CAM worker.
 */
export function defineOperation(operation) {
    return operation;
}

export function buildPassDepths(cutDepth, passDepth) {
    const finalDepth = Math.max(0.01, cutDepth);
    const depthPerPass = Math.max(0.01, passDepth);
    const depths = [];
    let currentDepth = depthPerPass;
    while (currentDepth < finalDepth) {
        depths.push(-Number(currentDepth.toFixed(4)));
        currentDepth += depthPerPass;
    }
    depths.push(-Number(finalDepth.toFixed(4)));
    return depths;
}

export const OPERATION_LABELS = {
    'profile-outside': 'Profile Outside',
    'profile-inside': 'Profile Inside',
    pocket: 'Pocket',
    engrave: 'Engrave',
    chamfer: 'Chamfer',
    vcarve: 'V-Carve',
    'texture-fill': 'Texture Fill',
    'laser-cut': 'Laser Cut',
    'laser-raster': 'Laser Raster',
    'wavy-raster': 'Wavy',
    halftone: 'Halftone',
};
