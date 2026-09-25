export interface History<T> {
    undo: T[];
    redo: T[];
    limit: number;
}

export function createHistory<T>(limit = 60): History<T> {
    return { undo: [], redo: [], limit };
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

export function pushHistory<T>(h: History<T>, snapshot: T): void {
    h.undo.push(clone(snapshot));
    if (h.undo.length > h.limit) h.undo.shift();
    h.redo = [];
}

export function undoHistory<T>(h: History<T>, current: T): T | null {
    const snap = h.undo.pop();
    if (!snap) return null;
    h.redo.push(clone(current));
    return snap;
}

export function redoHistory<T>(h: History<T>, current: T): T | null {
    const snap = h.redo.pop();
    if (!snap) return null;
    h.undo.push(clone(current));
    return snap;
}
