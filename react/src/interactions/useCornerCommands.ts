import type { Dispatch, SetStateAction } from 'react';
import { chamferLoop, dogboneCorner, filletCorner } from '../lib/corners';
import type { TransformMode } from '../lib/transform';

interface Point {
    x: number;
    y: number;
}

interface CornerLoop {
    id: string;
    points: Point[];
}

interface UseCornerCommandsOptions<TLoop extends CornerLoop, TStack> {
    loops: TLoop[];
    cornerRadius: number;
    cornerTool: 'fillet' | 'dogbone' | null;
    selectedLoops(): TLoop[];
    withIds(items: { points: Point[] }[]): TLoop[];
    formatLength(value: number): string;
    replaceSelection(items: { points: Point[] }[], note: string): void;
    pushHistory(): void;
    refreshBounds(loops: TLoop[]): void;
    setLoops: Dispatch<SetStateAction<TLoop[]>>;
    setSelected: Dispatch<SetStateAction<string[]>>;
    setStack: Dispatch<SetStateAction<TStack[]>>;
    setCornerTool: Dispatch<SetStateAction<'fillet' | 'dogbone' | null>>;
    setTransformMode: Dispatch<SetStateAction<TransformMode | null>>;
    setStatus: Dispatch<SetStateAction<string>>;
}

/** Corner editing commands kept separate from canvas and inspector UI. */
export function useCornerCommands<TLoop extends CornerLoop, TStack>(
    options: UseCornerCommandsOptions<TLoop, TStack>,
) {
    const handleFillet = () => {
        if (!(options.cornerRadius > 0)) return;
        options.setCornerTool('fillet');
        options.setTransformMode(null);
        // Null is the existing fillet mode; only dogbone needs explicit state.
        options.setCornerTool(null);
        options.setStatus(
            `Fillet r=${options.formatLength(options.cornerRadius)}: hover a corner, then click to apply.`,
        );
    };

    const handleDogbone = () => {
        options.setCornerTool('dogbone');
        options.setTransformMode(null);
        options.setStatus(
            `Dogbone r=${options.formatLength(options.cornerRadius)}: hover a corner, then click to apply.`,
        );
    };

    const handleCorner = (loopId: string, cornerIndex: number) => {
        if (!(options.cornerRadius > 0)) return;
        const target = options.loops.find((loop) => loop.id === loopId);
        if (!target) return;
        const points =
            options.cornerTool === 'dogbone'
                ? dogboneCorner(
                      target.points,
                      cornerIndex,
                      options.cornerRadius,
                  )
                : filletCorner(
                      target.points,
                      cornerIndex,
                      options.cornerRadius,
                  );
        if (!points) {
            options.setStatus('That corner cannot fit the selected radius.');
            return;
        }
        options.pushHistory();
        if (options.cornerTool === 'dogbone') {
            const added = options.withIds([{ points }]);
            options.setLoops((current) => {
                const next = [...current, ...added];
                options.setStack([]);
                options.refreshBounds(next);
                return next;
            });
            options.setSelected(added.map((loop) => loop.id));
            options.setStatus(
                `Dogbone r=${options.formatLength(options.cornerRadius)} added.`,
            );
        } else {
            options.setLoops((current) =>
                current.map((loop) =>
                    loop.id === loopId ? { ...loop, points } : loop,
                ),
            );
            options.setSelected([loopId]);
            options.setStatus(
                `Fillet r=${options.formatLength(options.cornerRadius)} applied.`,
            );
        }
        options.setCornerTool(null);
    };

    const handleChamfer = () => {
        const targets = options.selectedLoops();
        if (!targets.length || !(options.cornerRadius > 0)) return;
        const results = targets.flatMap((loop) => {
            const output = chamferLoop(loop.points, options.cornerRadius);
            return output.length === loop.points.length
                ? []
                : [{ points: output }];
        });
        if (!results.length) {
            options.setStatus(
                'No two-straight-edge corner fits that distance.',
            );
            return;
        }
        options.replaceSelection(
            results,
            `Chamfer ${options.formatLength(options.cornerRadius)} on ${results.length} shape${results.length === 1 ? '' : 's'}.`,
        );
    };

    return { handleFillet, handleDogbone, handleCorner, handleChamfer };
}
