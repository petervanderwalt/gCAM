/**
 * Purpose: React hook that owns the ArrangeCommands workflow.
 */
import {
    useEffect,
    useRef,
    useState,
    type Dispatch,
    type SetStateAction,
} from 'react';
import { useNestOptimizer } from './useNestOptimizer';
import {
    applyBoolean,
    offsetLoops,
    type BooleanOperation,
} from '../lib/engine';
import {
    buildNestUnits,
    placedNestPoint,
    type NestResult,
    type NestUnit,
} from '../lib/nest';

interface Point {
    x: number;
    y: number;
}

interface ArrangeLoop {
    id: string;
    points: Point[];
    groupId?: string;
}

interface UseArrangeCommandsOptions<TLoop extends ArrangeLoop, TStack> {
    loops: TLoop[];
    selected: string[];
    offsetAmount: number;
    sheetW: number;
    sheetH: number;
    nestBorder: number;
    nestSpacing: number;
    nestRotation?: number;
    stockOrigin?: 'front-left' | 'center';
    selectedLoops(): TLoop[];
    expandedSelectedIds(): string[];
    withIds(items: { points: Point[] }[]): TLoop[];
    formatLength(value: number): string;
    pushHistory(): void;
    refreshBounds(loops: TLoop[]): void;
    setLoops: Dispatch<SetStateAction<TLoop[]>>;
    setSelected: Dispatch<SetStateAction<string[]>>;
    setStack: Dispatch<SetStateAction<TStack[]>>;
    setDraftPreview: Dispatch<SetStateAction<Point[][]>>;
    setOffsetPreview: Dispatch<SetStateAction<Point[][]>>;
    setStatus: Dispatch<SetStateAction<string>>;
}

/** Boolean, offset and nesting commands kept outside the app shell. */
export function useArrangeCommands<TLoop extends ArrangeLoop, TStack>(
    options: UseArrangeCommandsOptions<TLoop, TStack>,
) {
    const replaceSelection = (items: { points: Point[] }[], note: string) => {
        options.pushHistory();
        const results = options.withIds(items);
        const removed = new Set(options.expandedSelectedIds());
        const next = [
            ...options.loops.filter((loop) => !removed.has(loop.id)),
            ...results,
        ];
        options.setLoops(next);
        options.setSelected(results.map((loop) => loop.id));
        options.setStack([]);
        options.setDraftPreview([]);
        options.setOffsetPreview([]);
        options.refreshBounds(next);
        options.setStatus(note);
    };

    const search = useNestOptimizer();
    const [nestPreview, setNestPreview] = useState<TLoop[] | null>(null);
    const [nestAttempt, setNestAttempt] = useState<TLoop[] | null>(null);
    const source = useRef(options.loops);
    const latest = useRef(options);
    latest.current = options;
    useEffect(() => {
        if (search.progress && options.loops !== source.current) {
            search.cancel();
            options.setStatus('Nesting cancelled because the drawing changed.');
        }
    }, [options.loops, Boolean(search.progress)]);
    const nestLoops = (units: NestUnit[], { placements }: NestResult) =>
        units.flatMap((unit, index) => {
            const move = (point: Point) => {
                const placed = placedNestPoint(point, unit, placements[index]);
                return {
                    x:
                        placed.x -
                        (options.stockOrigin === 'center'
                            ? options.sheetW / 2
                            : 0),
                    y:
                        placed.y -
                        (options.stockOrigin === 'center'
                            ? options.sheetH / 2
                            : 0),
                };
            };
            return unit.loops.map((loop) => {
                const geometry = (
                    loop as TLoop & {
                        exportGeometry?: {
                            type?: string;
                            cx?: number;
                            cy?: number;
                            radius?: number;
                        };
                    }
                ).exportGeometry;
                const center =
                    geometry?.type === 'circle' &&
                    Number.isFinite(geometry.cx) &&
                    Number.isFinite(geometry.cy)
                        ? move({ x: geometry.cx!, y: geometry.cy! })
                        : null;
                return {
                    ...(loop as TLoop),
                    ...(unit.groupId ? { groupId: unit.groupId } : {}),
                    points: loop.points.map(move),
                    // Imported caches belong to the old position; circle landmarks can be transformed exactly.
                    bounds: undefined,
                    path2d: null,
                    segments: undefined,
                    exportGeometry: center
                        ? { ...geometry, cx: center.x, cy: center.y }
                        : undefined,
                } as TLoop;
            });
        });
    const applyNestResult = (units: NestUnit[], result: NestResult) => {
        if (result.failedIndex != null) {
            options.setStatus(
                `Part ${result.failedIndex + 1} does not fit on this sheet.`,
            );
            return;
        }
        const nested = nestLoops(units, result).map((loop) => ({
            ...loop,
            id: options.withIds([{ points: loop.points }])[0].id,
        }));
        options.pushHistory();
        const next =
            options.selected.length > 0
                ? [
                      ...options.loops.filter(
                          (loop) =>
                              !new Set(options.expandedSelectedIds()).has(
                                  loop.id,
                              ),
                      ),
                      ...nested,
                  ]
                : nested;
        options.setLoops(next);
        options.setSelected(nested.map((loop) => loop.id));
        options.setStack([]);
        options.refreshBounds(next);
        options.setDraftPreview([]);
        options.setOffsetPreview([]);
        options.setStatus(
            `Search complete. Nested ${units.length} part${units.length === 1 ? '' : 's'} on ${options.formatLength(options.sheetW)} × ${options.formatLength(options.sheetH)}.`,
        );
    };

    const handleNest = () => {
        const targets =
            options.selected.length > 0
                ? options.selectedLoops()
                : options.loops;
        if (!targets.length) return;
        const units = buildNestUnits(targets);
        source.current = options.loops;
        setNestPreview(null);
        setNestAttempt(null);
        search.start(
            {
                units,
                width: options.sheetW,
                height: options.sheetH,
                border: options.nestBorder,
                gap: options.nestSpacing,
                rotationStep: options.nestRotation ?? 90,
                origin: options.stockOrigin,
            },
            (result) => {
                if (latest.current.loops !== options.loops) {
                    options.setStatus(
                        'Nesting cancelled because the drawing changed.',
                    );
                    return;
                }
                applyNestResult(units, result);
            },
            (message) => options.setStatus(message),
            (result) => {
                const nested = nestLoops(units, result);
                const ids = new Set(
                    units.flatMap((unit) =>
                        unit.loops.map((loop) => (loop as TLoop).id),
                    ),
                );
                setNestPreview([
                    ...options.loops.filter((loop) => !ids.has(loop.id)),
                    ...nested,
                ]);
            },
            (result) => setNestAttempt(nestLoops(units, result)),
        );
    };

    const handleBoolean = (operation: BooleanOperation) => {
        if (options.selected.length < 2) return;
        try {
            const inputs = options.selectedLoops();
            const results = applyBoolean(inputs, operation);
            replaceSelection(
                results,
                `${operation}: ${inputs.length} shapes → ${results.length} shape${results.length === 1 ? '' : 's'}.`,
            );
        } catch (error) {
            options.setStatus(
                error instanceof Error
                    ? error.message
                    : 'Could not combine or subtract the shapes',
            );
        }
    };

    const handleOffset = () => {
        const targets =
            options.selected.length > 0
                ? options.selectedLoops()
                : options.loops;
        if (!targets.length) return;
        try {
            const results = offsetLoops(targets, options.offsetAmount);
            options.pushHistory();
            const added = options.withIds(results);
            const next = [...options.loops, ...added];
            options.setLoops(next);
            options.setSelected(added.map((loop) => loop.id));
            options.setStack([]);
            options.setDraftPreview([]);
            options.setOffsetPreview([]);
            options.refreshBounds(next);
            options.setStatus(
                `Offset ${options.formatLength(options.offsetAmount)} added ${results.length} shape${results.length === 1 ? '' : 's'}.`,
            );
        } catch (error) {
            options.setStatus(
                error instanceof Error ? error.message : 'Offset failed',
            );
        }
    };

    return {
        handleNest,
        handleBoolean,
        handleOffset,
        replaceSelection,
        nestProgress: search.progress,
        nestPreview: search.progress ? nestPreview : null,
        nestAttempt: search.progress ? nestAttempt : null,
        stopNest: search.stop,
        cancelNest: search.cancel,
    };
}
