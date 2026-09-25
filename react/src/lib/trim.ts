export interface Point {
    x: number;
    y: number;
}

export interface TrimResult {
    before: Point[];
    after: Point[];
    segmentIndex: number;
    distance: number;
}

function closestOnSegment(a: Point, b: Point, p: Point) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length2 = dx * dx + dy * dy;
    const t = length2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length2)) : 0;
    const point = { x: a.x + dx * t, y: a.y + dy * t };
    return { point, distance: Math.hypot(p.x - point.x, p.y - point.y) };
}

/** Remove the segment nearest the click and preserve the remaining geometry. */
export function trimNearestSegment(points: Point[], click: Point, tolerance = Infinity): TrimResult | null {
    if (points.length < 2) return null;
    let best: TrimResult | null = null;
    for (let i = 0; i < points.length - 1; i += 1) {
        const hit = closestOnSegment(points[i], points[i + 1], click);
        if (!best || hit.distance < best.distance) {
            best = { before: [], after: [], segmentIndex: i, distance: hit.distance };
        }
    }
    if (!best || best.distance > tolerance) return null;
    const i = best.segmentIndex;
    best.before = points.slice(0, i + 1);
    best.after = points.slice(i + 1);
    return best;
}
