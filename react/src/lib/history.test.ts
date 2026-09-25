import {
    createHistory,
    pushHistory,
    redoHistory,
    undoHistory,
} from './history';

test('undo restores earlier snapshots in order', () => {
    const h = createHistory<number[]>(10);
    pushHistory(h, [1]);
    pushHistory(h, [1, 2]);
    expect(undoHistory(h, [1, 2, 3])).toEqual([1, 2]);
    expect(undoHistory(h, [1, 2])).toEqual([1]);
    expect(undoHistory(h, [1])).toBeNull();
});

test('redo replays after undo and clears on new push', () => {
    const h = createHistory<number[]>(10);
    pushHistory(h, [1]);
    pushHistory(h, [2]);
    expect(undoHistory(h, [3])).toEqual([2]);
    expect(redoHistory(h, [2])).toEqual([3]);
    pushHistory(h, [4]);
    expect(redoHistory(h, [4])).toBeNull();
});

test('undo stack respects the limit', () => {
    const h = createHistory<number>(2);
    pushHistory(h, 1);
    pushHistory(h, 2);
    pushHistory(h, 3);
    expect(undoHistory(h, 4)).toBe(3);
    expect(undoHistory(h, 3)).toBe(2);
    expect(undoHistory(h, 2)).toBeNull();
});

test('snapshots are deep copies', () => {
    const h = createHistory<{ n: number[] }>(10);
    const snap = { n: [1] };
    pushHistory(h, snap);
    snap.n.push(999);
    expect(undoHistory(h, { n: [2] })).toEqual({ n: [1] });
});
