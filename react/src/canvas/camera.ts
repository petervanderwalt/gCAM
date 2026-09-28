export interface CanvasCamera {
    scale: number;
    tx: number;
    ty: number;
}

export interface CanvasBounds {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
}

export function fitCamera(
    bounds: CanvasBounds,
    width: number,
    height: number,
): CanvasCamera {
    const spanX = Math.max(1e-6, bounds.maxX - bounds.minX);
    const spanY = Math.max(1e-6, bounds.maxY - bounds.minY);
    const padding = 24;
    const scale = Math.min(
        (width - padding * 2) / spanX,
        (height - padding * 2) / spanY,
    );
    return {
        scale,
        tx: width / 2 - ((bounds.minX + bounds.maxX) / 2) * scale,
        ty: height / 2 + ((bounds.minY + bounds.maxY) / 2) * scale,
    };
}
