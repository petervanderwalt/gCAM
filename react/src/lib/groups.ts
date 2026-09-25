export interface GroupableLoop {
    id: string;
    groupId?: string;
}

export function groupLoopIds<T extends GroupableLoop>(
    loops: T[],
    ids: string[],
    groupId: string,
): T[] {
    const members = new Set(ids);
    return loops.map((loop) =>
        members.has(loop.id) ? { ...loop, groupId } : loop,
    );
}

export function ungroupLoopIds<T extends GroupableLoop>(
    loops: T[],
    groupIds: string[],
): T[] {
    const groups = new Set(groupIds);
    return loops.map((loop) =>
        loop.groupId && groups.has(loop.groupId)
            ? (({ groupId: _groupId, ...rest }) => rest as T)(loop)
            : loop,
    );
}

export function groupIdsForSelection<T extends GroupableLoop>(
    loops: T[],
    selectedIds: string[],
): string[] {
    const selected = new Set(selectedIds);
    return Array.from(
        new Set(
            loops
                .filter((loop) => selected.has(loop.id) && loop.groupId)
                .map((loop) => loop.groupId as string),
        ),
    );
}

export function expandGroupedSelection<T extends GroupableLoop>(
    loops: T[],
    selectedIds: string[],
): string[] {
    const selected = new Set(selectedIds);
    const groups = new Set(groupIdsForSelection(loops, selectedIds));
    for (const loop of loops) {
        if (loop.groupId && groups.has(loop.groupId)) selected.add(loop.id);
    }
    return Array.from(selected);
}
