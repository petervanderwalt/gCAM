import type { Dispatch, SetStateAction } from 'react';
import { jest } from '@jest/globals';
import { useToolpathStack, type ToolpathStackEntry } from './useToolpathStack';
import type { ProfileArgs, ToolpathResult } from '../lib/engine';

test('adding a toolpath clears selection so the sidebar returns to the list', () => {
    const setSelected = jest.fn() as Dispatch<SetStateAction<string[]>>;
    const stack = useToolpathStack({
        stack: [],
        setStack: jest.fn() as Dispatch<SetStateAction<ToolpathStackEntry[]>>,
        setSelected,
        pushHistory: jest.fn(),
        setStatus: jest.fn(),
        setDraftPreview: jest.fn() as Dispatch<
            SetStateAction<{ x: number; y: number }[][]>
        >,
        setDraftProgress: jest.fn() as Dispatch<
            SetStateAction<{ percent: number; label: string } | null>
        >,
        setEditingId: jest.fn() as Dispatch<SetStateAction<string | null>>,
        showToast: jest.fn(),
    });
    const result: ToolpathResult = {
        gcode: 'G90\n',
        previewContours: [],
        label: 'Pocket',
        toolpath: {},
    };
    const args: ProfileArgs = {
        loops: [],
        operation: 'pocket',
        toolDiameter: 6,
        cutDepth: 3,
    };

    stack.handleResult(result, args);

    expect(setSelected).toHaveBeenCalledWith([]);
});
