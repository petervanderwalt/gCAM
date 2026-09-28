/**
 * Purpose: Implementation module for paths in the engine domain.
 */
// Compatibility façade for the former geometry monolith. New code should import
// the specific `src/geometry/*` domain it needs; existing callers can migrate
// incrementally without changing their public contract.
export {
    applyMatrixToPoint,
    createMatrix,
    multiplyMatrices,
    parseSvgCoordinateList,
    parseSvgPoints,
    parseSvgTransform,
    sampleEllipsePoints,
} from '../geometry/matrix.js';
export {
    almostEqual,
    clamp,
    clonePoint,
    closePoints,
    dist,
    normalizeAngleDeg,
    pointAtDistance,
    pointKey,
    polylineLength,
} from '../geometry/primitives.js';
export {
    mirrorEntityY,
    transformEntity,
    translateEntity,
} from '../geometry/transforms.js';
export {
    entityToSegment,
    polylineSegmentFromPoints,
} from '../geometry/segments.js';
export { buildLoops } from '../geometry/loops.js';
export {
    boundsOfEntities,
    boundsOfPoints,
    createLoopPath2D,
    mergeBounds,
    polygonArea,
} from '../geometry/bounds.js';
export {
    evaluateSplinePoint,
    splineEndpointTangent,
    splineParameterAtDistance,
    splineTangentAt,
    trimSplineEndpoint,
} from '../geometry/splines.js';
