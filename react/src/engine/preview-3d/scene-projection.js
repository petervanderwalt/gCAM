/**
 * Purpose: Implementation module for scene-projection in the engine domain.
 */
// The preview is painted onto a 2D canvas. This is the single affine
// projection used by both stock and toolpath overlays, so camera interaction
// can share exactly the same coordinate system.
export function createPreviewProjection(rect, view, baseScale) {
    const cos = Math.cos(view.yaw);
    const sin = Math.sin(view.yaw);
    const cosPitch = Math.cos(view.pitch);
    const sinPitch = Math.sin(view.pitch);
    return (x, y, z) => {
        const xx = x - view.targetX;
        const yy = view.targetY - y;
        const rotatedX = xx * cos - yy * sin;
        const rotatedY = xx * sin + yy * cos;
        return {
            x: rect.width / 2 + rotatedX * baseScale,
            y:
                rect.height / 2 +
                (rotatedY * cosPitch - z * sinPitch) * baseScale,
        };
    };
}
