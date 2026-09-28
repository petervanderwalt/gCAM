export interface History<T> {
    undo: T[];
    redo: T[];
    limit: number;
    clone: (value: T) => T;
}

function defaultClone<T>(value: T): T {
    if (typeof structuredClone === 'function') return structuredClone(value);
    return JSON.parse(JSON.stringify(value)) as T;
}

export function createHistory<T>(
    limit = 60,
    clone: (value: T) => T = defaultClone,
): History<T> {
    return { undo: [], redo: [], limit, clone };
}

export function pushHistory<T>(h: History<T>, snapshot: T): void {
    h.undo.push(h.clone(snapshot));
    if (h.undo.length > h.limit) h.undo.shift();
    h.redo = [];
}

export function undoHistory<T>(h: History<T>, current: T): T | null {
    const snap = h.undo.pop();
    if (!snap) return null;
    h.redo.push(h.clone(current));
    return snap;
}

export function redoHistory<T>(h: History<T>, current: T): T | null {
    const snap = h.redo.pop();
    if (!snap) return null;
    h.undo.push(h.clone(current));
    return snap;
}
