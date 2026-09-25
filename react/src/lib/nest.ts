export interface NestItem {
    width: number;
    height: number;
    envelope?: number;
}

export interface NestLoop {
    points: { x: number; y: number }[];
    groupId?: string;
}

export interface NestUnit extends NestItem {
    groupId?: string;
    loops: NestLoop[];
    minX: number;
    minY: number;
}

export interface NestPlacement {
    dx: number;
    dy: number;
}

export interface NestResult {
    placements: NestPlacement[];
    /** Zero-based index of the first item that did not fit, if any. */
    failedIndex: number | null;
}

export function buildNestUnits(loops: NestLoop[]): NestUnit[] {
    const units: NestUnit[] = [];
    const seenGroups = new Set<string>();
    for (const loop of loops) {
        if (loop.groupId && seenGroups.has(loop.groupId)) continue;
        const members = loop.groupId
            ? loops.filter((candidate) => candidate.groupId === loop.groupId)
            : [loop];
        if (loop.groupId) seenGroups.add(loop.groupId);
        const points = members.flatMap((member) => member.points);
        const minX = Math.min(...points.map((point) => point.x));
        const minY = Math.min(...points.map((point) => point.y));
        const maxX = Math.max(...points.map((point) => point.x));
        const maxY = Math.max(...points.map((point) => point.y));
        units.push({
            groupId: loop.groupId,
            loops: members,
            minX,
            minY,
            width: Math.max(0, maxX - minX),
            height: Math.max(0, maxY - minY),
        });
    }
    return units;
}

/**
 * Shelf packing, mirroring legacy gCAM: tallest-first, cutter envelope
 * around each part, uniform border + spacing. Translations move each item's
 * min corner to (border + dx, border + dy).
 */
export function nestPlacements(
    items: NestItem[],
    sheetWidth: number,
    sheetHeight: number,
    border: number,
    spacing: number,
): NestResult {
    const order = items
        .map((item, index) => ({ item, index }))
        .sort(
            (a, b) =>
                b.item.height - a.item.height || b.item.width - a.item.width,
        );
    const placements: NestPlacement[] = new Array(items.length);
    let x = border;
    let y = border;
    let rowHeight = 0;
    for (const { item, index } of order) {
        const env = item.envelope ?? 0;
        const ew = item.width + env * 2;
        const eh = item.height + env * 2;
        if (x + ew > sheetWidth - border && x > border) {
            x = border;
            y += rowHeight + spacing;
            rowHeight = 0;
        }
        if (x + ew > sheetWidth - border || y + eh > sheetHeight - border) {
            return { placements: [], failedIndex: index };
        }
        placements[index] = { dx: x + env, dy: y + env };
        x += ew + spacing;
        rowHeight = Math.max(rowHeight, eh);
    }
    return { placements, failedIndex: null };
}
