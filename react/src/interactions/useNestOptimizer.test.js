import { createRequire } from 'node:module';
import { act, renderHook } from '@testing-library/react';
import { jest } from '@jest/globals';
import { useNestOptimizer } from './useNestOptimizer';
import { buildNestUnits } from '../lib/nest';
const request = {
    units: buildNestUnits([
        {
            points: [
                { x: 0, y: 0 },
                { x: 10, y: 0 },
                { x: 10, y: 10 },
                { x: 0, y: 10 },
                { x: 0, y: 0 },
            ],
        },
    ]),
    width: 50,
    height: 50,
    border: 3,
    gap: 6,
    rotationStep: 90,
};
const layout = { placements: [{ dx: 3, dy: 3, turns: 0 }], failedIndex: null };
const workers = [];
class FakeWorker {
    onmessage = null;
    onerror = null;
    terminate = jest.fn();
    postMessage = jest.fn();
    constructor() {
        workers.push(this);
    }
    update() {
        this.onmessage?.({
            data: { result: layout, area: 50, length: 10, iterations: 1 },
        });
    }
}
const realWorker = globalThis.Worker;
const previousRequire = globalThis.require;
const previousFilename = globalThis.__filename;
beforeEach(() => {
    // Jest's import.meta transform expects CommonJS globals when creating the worker URL.
    globalThis.require = createRequire(`${process.cwd()}/package.json`);
    globalThis.__filename = `${process.cwd()}/src/interactions/useNestOptimizer.ts`;
    jest.useFakeTimers();
    workers.length = 0;
    globalThis.Worker = FakeWorker;
});
afterEach(() => {
    globalThis.Worker = realWorker;
    globalThis.require = previousRequire;
    globalThis.__filename = previousFilename;
    jest.useRealTimers();
});
test('cancel discards the result and ignores late worker messages', () => {
    const complete = jest.fn(),
        error = jest.fn();
    const { result } = renderHook(() => useNestOptimizer());
    act(() => result.current.start(request, complete, error));
    expect(error.mock.calls).toEqual([]);
    act(() => workers[0].update());
    act(() => result.current.cancel());
    act(() => workers[0].update());
    expect(complete).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    expect(workers[0].terminate).toHaveBeenCalledTimes(1);
    expect(result.current.progress).toBeNull();
});
test('stop accepts only the latest complete layout', () => {
    const complete = jest.fn();
    const { result } = renderHook(() => useNestOptimizer());
    act(() => result.current.start(request, complete, jest.fn()));
    act(() => workers[0].update());
    expect(result.current.progress?.hasBest).toBe(true);
    act(() => result.current.stop());
    expect(complete).toHaveBeenCalledTimes(1);
    expect(complete).toHaveBeenCalledWith(layout);
    expect(result.current.progress).toBeNull();
});
test('unmount terminates a search without applying its result', () => {
    const complete = jest.fn();
    const { result, unmount } = renderHook(() => useNestOptimizer());
    act(() => result.current.start(request, complete, jest.fn()));
    unmount();
    expect(workers[0].terminate).toHaveBeenCalledTimes(1);
    expect(complete).not.toHaveBeenCalled();
});
test('Escape cancels a search', () => {
    const complete = jest.fn();
    const { result } = renderHook(() => useNestOptimizer());
    act(() => result.current.start(request, complete, jest.fn()));
    act(() =>
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })),
    );
    expect(result.current.progress).toBeNull();
    expect(complete).not.toHaveBeenCalled();
});

test('worker input contains geometry only, excluding imported drawing caches', () => {
    const complete = jest.fn();
    const { result } = renderHook(() => useNestOptimizer());
    const imported = {
        ...request,
        units: request.units.map((unit) => ({
            ...unit,
            loops: unit.loops.map((loop) => ({
                ...loop,
                path2d: () => {},
                segments: [{ flatten: () => [] }],
            })),
        })),
    };
    act(() => result.current.start(imported, complete, jest.fn()));
    const sent = workers[0].postMessage.mock.calls[0][0];
    expect(Object.keys(sent.units[0].loops[0])).toEqual(['points']);
    expect(sent.gap).toBe(6);
    expect(sent.border).toBe(3);
});

test('worker errors discard partial work', () => {
    const complete = jest.fn(),
        error = jest.fn();
    const { result } = renderHook(() => useNestOptimizer());
    act(() => result.current.start(request, complete, error));
    act(() =>
        workers[0].onmessage({ data: { error: 'Polygon search failed' } }),
    );
    expect(complete).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith('Polygon search failed');
    expect(result.current.progress).toBeNull();
});

test('search keeps running until explicitly stopped, with a live improvement percentage', () => {
    const complete = jest.fn();
    const { result } = renderHook(() => useNestOptimizer());
    act(() => result.current.start(request, complete, jest.fn()));
    act(() => workers[0].update());
    act(() => jest.advanceTimersByTime(10 * 60 * 1000));
    expect(complete).not.toHaveBeenCalled();
    expect(result.current.progress).not.toBeNull();
    expect(workers[0].terminate).not.toHaveBeenCalled();
    act(() =>
        workers[0].onmessage({
            data: { result: layout, area: 40, length: 8, iterations: 25 },
        }),
    );
    expect(result.current.progress.improvement).toBeCloseTo(20);
    expect(result.current.progress.iterations).toBe(25);
    act(() => result.current.stop());
    expect(complete).toHaveBeenCalledWith(layout);
});

test('previews improved complete layouts without committing and clears on cancel', () => {
    const complete = jest.fn(),
        preview = jest.fn();
    const { result } = renderHook(() => useNestOptimizer());
    act(() => result.current.start(request, complete, jest.fn(), preview));
    act(() => workers[0].update());
    expect(preview).toHaveBeenCalledWith(layout);
    act(() => workers[0].update());
    expect(preview).toHaveBeenCalledTimes(1);
    const improved = {
        placements: [{ dx: 4, dy: 4, turns: 1 }],
        failedIndex: null,
    };
    act(() =>
        workers[0].onmessage({
            data: { result: improved, area: 40, length: 8, iterations: 2 },
        }),
    );
    expect(preview).toHaveBeenLastCalledWith(improved);
    expect(complete).not.toHaveBeenCalled();
    act(() => result.current.cancel());
    expect(result.current.progress).toBeNull();
    expect(complete).not.toHaveBeenCalled();
});

test('attempt previews never replace the best result kept by Stop', () => {
    const complete = jest.fn(),
        attempt = jest.fn();
    const { result } = renderHook(() => useNestOptimizer());
    act(() =>
        result.current.start(request, complete, jest.fn(), jest.fn(), attempt),
    );
    const other = {
        placements: [{ dx: 20, dy: 20, turns: 0 }],
        failedIndex: null,
    };
    act(() =>
        workers[0].onmessage({
            data: {
                result: layout,
                area: 50,
                length: 10,
                iterations: 2,
                attempt: other,
            },
        }),
    );
    expect(attempt).toHaveBeenCalledWith(other);
    act(() =>
        workers[0].onmessage({
            data: {
                result: layout,
                area: 50,
                length: 10,
                iterations: 3,
                attempt: { placements: [], failedIndex: 0 },
            },
        }),
    );
    expect(attempt).toHaveBeenCalledTimes(1);
    act(() => result.current.stop());
    expect(complete).toHaveBeenCalledWith(layout);
});

test('reported progress waits for cumulative 2 mm savings but Stop keeps smaller gains', () => {
    const complete = jest.fn(),
        preview = jest.fn();
    const { result } = renderHook(() => useNestOptimizer());
    act(() =>
        result.current.start(
            {
                ...request,
                units: buildNestUnits([
                    {
                        points: [
                            { x: 0, y: 200 },
                            { x: 10, y: 200 },
                            { x: 10, y: 300 },
                            { x: 0, y: 300 },
                            { x: 0, y: 200 },
                        ],
                    },
                ]),
            },
            complete,
            jest.fn(),
            preview,
        ),
    );
    const update = (length) =>
        act(() =>
            workers[0].onmessage({
                data: {
                    result: layout,
                    area: length * 10,
                    length,
                    iterations: 1,
                },
            }),
        );
    update(100);
    update(99);
    update(98.5);
    expect(result.current.progress.improvement).toBe(0);
    expect(preview).toHaveBeenCalledTimes(3);
    update(98);
    expect(result.current.progress.improvement).toBeCloseTo(2);
    update(97.5);
    expect(result.current.progress.improvement).toBeCloseTo(2);
    act(() => result.current.stop());
    expect(complete).toHaveBeenCalledWith(layout);
});

test('saving compares to the original layout span, excluding blank space and stock size', () => {
    const { result } = renderHook(() => useNestOptimizer());
    const units = buildNestUnits([
        {
            points: [
                { x: 0, y: 200 },
                { x: 10, y: 200 },
                { x: 10, y: 210 },
                { x: 0, y: 210 },
                { x: 0, y: 200 },
            ],
        },
    ]);
    act(() =>
        result.current.start(
            { ...request, height: 500, units },
            jest.fn(),
            jest.fn(),
        ),
    );
    act(() =>
        workers[0].onmessage({
            data: { result: layout, area: 40, length: 8, iterations: 0 },
        }),
    );
    expect(result.current.progress.improvement).toBeCloseTo(20);
});
