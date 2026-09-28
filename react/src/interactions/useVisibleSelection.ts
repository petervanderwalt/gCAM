/**
 * Purpose: React hook that owns the VisibleSelection workflow.
 */
import { useMemo } from 'react';
import type { ViewLoop } from '../canvas/types';
import { expandGroupedSelection } from '../lib/groups';

/** Resolves grouped selection ids to visible drawable loops for commands. */
export function useVisibleSelection(
    loops: ViewLoop[],
    selected: string[],
    hidden: string[],
) {
    const expandedSelectedIds = () => expandGroupedSelection(loops, selected);
    const selectedLoops = (): ViewLoop[] => {
        const byId = new Map(loops.map((loop) => [loop.id, loop]));
        const hiddenIds = new Set(hidden);
        return expandedSelectedIds().flatMap((id) => {
            const loop = byId.get(id);
            if (!loop || hiddenIds.has(id) || !Array.isArray(loop.points)) {
                return [];
            }
            return [loop];
        });
    };
    const offsetSource = useMemo(
        () => (selected.length > 0 ? selectedLoops() : loops),
        // selectedLoops is deliberately derived from the listed document state.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [loops, selected, hidden],
    );
    const booleanLoops = useMemo(
        () => selectedLoops(),
        // selectedLoops is deliberately derived from the listed document state.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [loops, selected, hidden],
    );
    return { expandedSelectedIds, selectedLoops, offsetSource, booleanLoops };
}
