/** Surface height cut by a ball cutter whose programmed Z is the ball tip. */
export function ballTipCutterSurfaceZ(tipZ, radialDistance, radius) {
    if (
        ![tipZ, radialDistance, radius].every(Number.isFinite) ||
        radius <= 0 ||
        radialDistance < 0
    )
        throw new Error(
            'Ball cutter contact requires finite coordinates and a positive radius.',
        );
    if (radialDistance >= radius) return Infinity;
    return (
        tipZ +
        radius -
        Math.sqrt(
            Math.max(0, radius * radius - radialDistance * radialDistance),
        )
    );
}
