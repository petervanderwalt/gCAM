import { finishSelection } from './selection';
import { jest } from '@jest/globals';
import type { CanvasPointerControllerProps } from './types';

function selectionDeps(selected: string[], onSelect: (ids: string[]) => void) {
    return {
        cameraRef: { current: { tx: 0, ty: 100, scale: 1 } },
        viewRef: {
            current: {
                loops: [
                    { id: 'vector-1', points: [{ x: 10, y: 10 }, { x: 20, y: 20 }] },
                    { id: 'model-1', bitmapId: 'stl-1', points: [{ x: 30, y: 30 }, { x: 40, y: 40 }] },
                    { id: 'vector-2', points: [{ x: 50, y: 50 }, { x: 60, y: 60 }] },
                ],
                hidden: [],
                selected,
            },
        },
        onSelect,
        forceTick: jest.fn(),
    } as unknown as CanvasPointerControllerProps;
}

test('marquee selects vectors but excludes 3D bitmap geometry', () => {
    const onSelect = jest.fn();
    finishSelection(
        { shiftKey: false } as React.MouseEvent<HTMLCanvasElement>,
        selectionDeps([], onSelect),
        null,
        { x0: 0, y0: 0, x1: 100, y1: 100 },
    );
    expect(onSelect).toHaveBeenCalledWith(['vector-1', 'vector-2']);
});

test('shift-marquee drops previously selected 3D models and keeps vector selection', () => {
    const onSelect = jest.fn();
    finishSelection(
        { shiftKey: true } as React.MouseEvent<HTMLCanvasElement>,
        selectionDeps(['model-1', 'vector-1'], onSelect),
        null,
        { x0: 0, y0: 0, x1: 100, y1: 100 },
    );
    expect(onSelect).toHaveBeenCalledWith(['vector-1', 'vector-2']);
});
