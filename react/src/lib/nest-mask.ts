/** Conservative contour masks for nesting. Holes stay reserved for their parent part. */
import type { NestLoop } from './nest';

export interface NestMask {
    width: number;
    height: number;
    rows: Uint32Array[];
}

export function rotateNestPoint(
    x: number,
    y: number,
    width: number,
    height: number,
    turns: number,
) {
    switch (turns) {
        case 1:
            return { x: height - y, y: x };
        case 2:
            return { x: width - x, y: height - y };
        case 3:
            return { x: y, y: width - x };
        default: {
            const angle = (turns * Math.PI) / 2,
                c = Math.cos(angle),
                s = Math.sin(angle);
            const minX = Math.min(
                0,
                width * c,
                -height * s,
                width * c - height * s,
            );
            const minY = Math.min(
                0,
                width * s,
                height * c,
                width * s + height * c,
            );
            return { x: x * c - y * s - minX, y: x * s + y * c - minY };
        }
    }
}

export function contourMask(
    loops: NestLoop[],
    width: number,
    height: number,
    cell: number,
    padding: number,
): NestMask {
    const w = Math.max(1, Math.ceil(width / cell - 1e-9));
    const h = Math.max(1, Math.ceil(height / cell - 1e-9));
    const ranges: [number, number][][] = Array.from({ length: h }, () => []);
    const fill = (row: number, left: number, right: number) => {
        if (row < 0 || row >= h) return;
        ranges[row].push([
            Math.max(0, Math.floor(left / cell)),
            Math.min(w - 1, Math.ceil(right / cell - 1e-9) - 1),
        ]);
    };
    for (const { points } of loops) {
        for (let row = 0; row < h; row++) {
            const y = (row + 0.5) * cell;
            const crossings: number[] = [];
            for (let i = 0; i < points.length; i++) {
                const a = points[i],
                    b = points[(i + 1) % points.length];
                if (a.y > y !== b.y > y)
                    crossings.push(
                        a.x + ((y - a.y) * (b.x - a.x)) / (b.y - a.y),
                    );
                // Cover every cell touched by an edge, including narrow and diagonal features.
                if (
                    Math.max(a.y, b.y) < row * cell ||
                    Math.min(a.y, b.y) > (row + 1) * cell
                )
                    continue;
                if (a.y === b.y)
                    fill(row, Math.min(a.x, b.x), Math.max(a.x, b.x));
                else {
                    const t0 = Math.max(
                        0,
                        Math.min(1, (row * cell - a.y) / (b.y - a.y)),
                    );
                    const t1 = Math.max(
                        0,
                        Math.min(1, ((row + 1) * cell - a.y) / (b.y - a.y)),
                    );
                    const x0 = a.x + t0 * (b.x - a.x),
                        x1 = a.x + t1 * (b.x - a.x);
                    fill(row, Math.min(x0, x1), Math.max(x0, x1) + 1e-9);
                }
            }
            crossings.sort((a, b) => a - b);
            for (let i = 0; i + 1 < crossings.length; i += 2)
                fill(row, crossings[i], crossings[i + 1]);
        }
    }
    const mask: NestMask = {
        width: w + padding * 2,
        height: h + padding * 2,
        rows: [],
    };
    mask.rows = Array.from(
        { length: mask.height },
        () => new Uint32Array(Math.ceil(mask.width / 32)),
    );
    for (let y = 0; y < h; y++)
        for (const [left, right] of ranges[y]) {
            if (right < left) continue;
            for (let row = y; row <= y + padding * 2; row++) {
                for (let x = left; x <= right + padding * 2; x++)
                    mask.rows[row][x >>> 5] |= 1 << (x & 31);
            }
        }
    return mask;
}

/** Test or stamp a mask at an integer grid position without allocating translated polygons. */
export function maskFits(
    grid: Uint32Array[],
    mask: NestMask,
    x: number,
    y: number,
    stamp = false,
): boolean {
    const shift = x & 31,
        offset = x >>> 5;
    for (let row = 0; row < mask.height; row++) {
        const target = grid[y + row];
        for (let word = 0; word < mask.rows[row].length; word++) {
            const bits = mask.rows[row][word];
            if (!bits) continue;
            const lo = bits << shift,
                hi = shift ? bits >>> (32 - shift) : 0;
            if (stamp) {
                target[offset + word] |= lo;
                if (hi) target[offset + word + 1] |= hi;
            } else if (
                target[offset + word] & lo ||
                (hi && target[offset + word + 1] & hi)
            )
                return false;
        }
    }
    return true;
}
