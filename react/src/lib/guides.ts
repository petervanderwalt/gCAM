export interface Guide {
    id: string;
    /** 'x' = vertical line at x=pos; 'y' = horizontal line at y=pos. */
    axis: 'x' | 'y';
    pos: number;
}

export interface SnapPoint {
    x: number;
    y: number;
}

/** Snap a point to the nearest guide within tolerance (mm). */
export function snapToGuides(
    point: SnapPoint,
    guides: Guide[],
    tolerance = 1,
): SnapPoint {
    let { x, y } = point;
    let bestX = tolerance;
    let bestY = tolerance;
    for (const guide of guides) {
        if (guide.axis === 'x') {
            const d = Math.abs(point.x - guide.pos);
            if (d < bestX) {
                bestX = d;
                x = guide.pos;
            }
        } else {
            const d = Math.abs(point.y - guide.pos);
            if (d < bestY) {
                bestY = d;
                y = guide.pos;
            }
        }
    }
    return { x, y };
}
