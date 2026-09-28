import type { Dispatch, SetStateAction } from 'react';
import { trimNearestSegment } from '../lib/trim';

interface Point {
    x: number;
    y: number;
}

interface TrimLoop {
    id: string;
    points: Point[];
    bitmapId?: string;
}

interface UseTrimCommandsOptions<TLoop extends TrimLoop, TStack> {
    loops: TLoop[];
    selected: string[];
    newLoopId(): string;
    pushHistory(): void;
    refreshBounds(loops: TLoop[]): void;
    setLoops: Dispatch<SetStateAction<TLoop[]>>;
    setSelected: Dispatch<SetStateAction<string[]>>;
    setStack: Dispatch<SetStateAction<TStack[]>>;
    setStatus: Dispatch<SetStateAction<string>>;
}

/** Point and stroke trimming commands for selected vector geometry. */
export function useTrimCommands<TLoop extends TrimLoop, TStack>(
    options: UseTrimCommandsOptions<TLoop, TStack>,
) {
    const candidates = () =>
        options.loops.filter(
            (loop) =>
                options.selected.length === 0 ||
                options.selected.includes(loop.id),
        );

    const handleTrimAt = (point: Point) => {
        const targetLoops = candidates();
        if (targetLoops.some((loop) => loop.bitmapId)) {
            options.setStatus('Trim not available for bitmaps.');
            return;
        }
        let hit: {
            id: string;
            result: NonNullable<ReturnType<typeof trimNearestSegment>>;
        } | null = null;
        for (const loop of targetLoops) {
            const result = trimNearestSegment(loop.points, point, 8);
            if (result && (!hit || result.distance < hit.result.distance)) {
                hit = { id: loop.id, result };
            }
        }
        if (!hit) {
            options.setStatus('Click a vector segment to trim it.');
            return;
        }
        options.pushHistory();
        options.setLoops((current) => {
            const next = current.flatMap((loop) => {
                if (loop.id !== hit?.id) return [loop];
                return [hit.result.before, hit.result.after]
                    .filter((shape) => shape.length >= 2)
                    .map(
                        (shape) =>
                            ({
                                ...loop,
                                id: options.newLoopId(),
                                points: shape,
                            }) as TLoop,
                    );
            });
            options.setSelected(
                options.selected.filter((id) => id !== hit?.id),
            );
            options.setStack([]);
            options.refreshBounds(next);
            return next;
        });
        options.setStatus('Trimmed vector segment.');
    };

    const handleTrimStroke = (points: Point[]) => {
        const targetLoops = candidates();
        if (targetLoops.some((loop) => loop.bitmapId)) {
            options.setStatus('Trim not available for bitmaps.');
            return;
        }
        const hits = new Map<
            string,
            NonNullable<ReturnType<typeof trimNearestSegment>>
        >();
        for (const point of points) {
            let best: {
                id: string;
                result: NonNullable<ReturnType<typeof trimNearestSegment>>;
            } | null = null;
            for (const loop of targetLoops) {
                if (hits.has(loop.id)) continue;
                const result = trimNearestSegment(loop.points, point, 8);
                if (
                    result &&
                    (!best || result.distance < best.result.distance)
                ) {
                    best = { id: loop.id, result };
                }
            }
            if (best) hits.set(best.id, best.result);
        }
        if (!hits.size) {
            options.setStatus(
                'Hold Ctrl and drag across vector segments to trim them.',
            );
            return;
        }
        options.pushHistory();
        options.setLoops((current) => {
            const next = current.flatMap((loop) => {
                const result = hits.get(loop.id);
                if (!result) return [loop];
                return [result.before, result.after]
                    .filter((shape) => shape.length >= 2)
                    .map(
                        (shape) =>
                            ({
                                ...loop,
                                id: options.newLoopId(),
                                points: shape,
                            }) as TLoop,
                    );
            });
            options.setSelected([]);
            options.setStack([]);
            options.refreshBounds(next);
            return next;
        });
        options.setStatus(
            `Trimmed ${hits.size} vector segment${hits.size === 1 ? '' : 's'}.`,
        );
    };

    return { handleTrimAt, handleTrimStroke };
}
