import {
    contourMask,
    maskFits,
    rotateNestPoint,
    type NestMask,
} from './nest-mask';
/**
 * Purpose: Implementation module for nest in the lib domain.
 */
export interface NestItem {
    width: number;
    height: number;
    envelope?: number;
    loops?: NestLoop[];
    minX?: number;
    minY?: number;
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
    turns: number;
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

/** Contour-aware bottom-left packing with configurable rotation steps and several deterministic part orders. */
export function nestPlacements(
    items: NestItem[],
    sheetWidth: number,
    sheetHeight: number,
    border: number,
    spacing: number,
    rotationStep = 90,
): NestResult {
    if (
        ![sheetWidth, sheetHeight, border, spacing].every(Number.isFinite) ||
        sheetWidth <= 0 ||
        sheetHeight <= 0 ||
        border < 0 ||
        spacing < 0
    )
        return { placements: [], failedIndex: 0 };
    const step = rotationStep;
    if (![0, 15, 90].includes(step)) return { placements: [], failedIndex: 0 };
    const invalid = items.findIndex(
        (item) =>
            !Number.isFinite(item.width) ||
            !Number.isFinite(item.height) ||
            item.width <= 0 ||
            item.height <= 0 ||
            !Number.isFinite(item.envelope ?? 0) ||
            (item.envelope ?? 0) < 0,
    );
    if (invalid >= 0) return { placements: [], failedIndex: invalid };
    if (!items.length) return { placements: [], failedIndex: null };
    // Conservative cells reserve edges and clearance; resolution is bounded to keep interactive jobs responsive.
    const cell = Math.max(0.5, Math.max(sheetWidth, sheetHeight) / 512);
    if (
        sheetWidth <= border * 2 ||
        sheetHeight <= border * 2 ||
        (items.length > 1 && spacing > Math.max(sheetWidth, sheetHeight))
    )
        return { placements: [], failedIndex: 0 };
    const gap = items.length > 1 ? Math.ceil(spacing / (2 * cell)) : 0;
    const gridW = Math.floor((sheetWidth - border * 2) / cell + 1e-9) + gap * 2;
    const gridH =
        Math.floor((sheetHeight - border * 2) / cell + 1e-9) + gap * 2;
    if (gridW <= 0 || gridH <= 0) return { placements: [], failedIndex: 0 };
    const variants = items.map((item) => {
        const padding = gap + Math.ceil((item.envelope ?? 0) / cell);
        const loops = item.loops?.length
            ? item.loops.map((loop) => ({
                  points: loop.points.map((p) => ({
                      x: p.x - (item.minX ?? 0),
                      y: p.y - (item.minY ?? 0),
                  })),
              }))
            : [
                  {
                      points: [
                          { x: 0, y: 0 },
                          { x: item.width, y: 0 },
                          { x: item.width, y: item.height },
                          { x: 0, y: item.height },
                      ],
                  },
              ];
        return Array.from({ length: step ? 360 / step : 1 }, (_, index) => {
            const turns = step ? (index * step) / 90 : 0;
            const rotated = loops.map((loop) => ({
                points: loop.points.map((p) =>
                    rotateNestPoint(p.x, p.y, item.width, item.height, turns),
                ),
            }));
            const bounds = rotated
                .flatMap((loop) => loop.points)
                .reduce(
                    (box, p) => ({
                        minX: Math.min(box.minX, p.x),
                        minY: Math.min(box.minY, p.y),
                        maxX: Math.max(box.maxX, p.x),
                        maxY: Math.max(box.maxY, p.y),
                    }),
                    {
                        minX: Infinity,
                        minY: Infinity,
                        maxX: -Infinity,
                        maxY: -Infinity,
                    },
                );
            if (
                Math.ceil((bounds.maxX - bounds.minX) / cell - 1e-9) +
                    padding * 2 >
                    gridW ||
                Math.ceil((bounds.maxY - bounds.minY) / cell - 1e-9) +
                    padding * 2 >
                    gridH
            )
                return null;
            const normalized = rotated.map((loop) => ({
                points: loop.points.map((p) => ({
                    x: p.x - bounds.minX,
                    y: p.y - bounds.minY,
                })),
            }));
            return {
                turns,
                padding,
                offsetX: bounds.minX,
                offsetY: bounds.minY,
                mask: contourMask(
                    normalized,
                    bounds.maxX - bounds.minX,
                    bounds.maxY - bounds.minY,
                    cell,
                    padding,
                ),
            };
        }).filter(
            (variant): variant is NonNullable<typeof variant> =>
                variant !== null,
        );
    });
    const oversized = variants.findIndex((list) => !list.length);
    if (oversized >= 0) return { placements: [], failedIndex: oversized };
    const orders = [
        items
            .map((_, i) => i)
            .sort(
                (a, b) =>
                    items[b].width * items[b].height -
                    items[a].width * items[a].height,
            ),
        items
            .map((_, i) => i)
            .sort(
                (a, b) =>
                    Math.max(items[b].width, items[b].height) -
                    Math.max(items[a].width, items[a].height),
            ),
        items
            .map((_, i) => i)
            .sort((a, b) => items[b].height - items[a].height),
    ];
    let best: NestPlacement[] | null = null,
        bestArea = Infinity,
        failure = 0;
    for (const order of orders) {
        const grid = Array.from(
            { length: gridH },
            () => new Uint32Array(Math.ceil(gridW / 32)),
        );
        const placements: NestPlacement[] = new Array(items.length);
        let usedW = 0,
            usedH = 0,
            failed = false;
        for (const index of order) {
            let choice: {
                x: number;
                y: number;
                turns: number;
                padding: number;
                mask: NestMask;
                score: number;
                offsetX: number;
                offsetY: number;
            } | null = null;
            for (const variant of variants[index]) {
                const { mask } = variant;
                search: for (let y = 0; y <= gridH - mask.height; y++) {
                    if (
                        choice &&
                        Math.max(usedH, y + mask.height) >
                            Math.floor(choice.score / (gridW + 1))
                    )
                        break;
                    for (let x = 0; x <= gridW - mask.width; x++) {
                        if (!maskFits(grid, mask, x, y)) continue;
                        const score =
                            Math.max(usedH, y + mask.height) * (gridW + 1) +
                            Math.max(usedW, x + mask.width);
                        if (!choice || score < choice.score)
                            choice = { x, y, ...variant, score };
                        break search;
                    }
                }
            }
            if (!choice) {
                failure = index;
                failed = true;
                break;
            }
            maskFits(grid, choice.mask, choice.x, choice.y, true);
            usedW = Math.max(usedW, choice.x + choice.mask.width);
            usedH = Math.max(usedH, choice.y + choice.mask.height);
            placements[index] = {
                dx:
                    border +
                    (choice.x + choice.padding - gap) * cell -
                    choice.offsetX,
                dy:
                    border +
                    (choice.y + choice.padding - gap) * cell -
                    choice.offsetY,
                turns: choice.turns,
            };
        }
        const area = usedH * (gridW + 1) + usedW;
        if (!failed && area < bestArea) {
            best = placements;
            bestArea = area;
        }
    }
    return best
        ? { placements: best, failedIndex: null }
        : { placements: [], failedIndex: failure };
}

/** Rotate the complete grouped part around its shared bounds, then translate it into the sheet. */
export function placedNestPoint(
    point: { x: number; y: number },
    unit: NestUnit,
    placement: NestPlacement,
) {
    const rotated = rotateNestPoint(
        point.x - unit.minX,
        point.y - unit.minY,
        unit.width,
        unit.height,
        placement.turns,
    );
    return { x: rotated.x + placement.dx, y: rotated.y + placement.dy };
}
