import { act, renderHook } from '@testing-library/react';
import { jest } from '@jest/globals';
import { useState } from 'react';
import { useArrangeCommands } from './useArrangeCommands';

const outline = [
    { x: 10, y: 10 },
    { x: 50, y: 10 },
    { x: 50, y: 25 },
    { x: 10, y: 25 },
    { x: 10, y: 10 },
];
const inner = [
    { x: 20, y: 14 },
    { x: 30, y: 14 },
    { x: 30, y: 20 },
    { x: 20, y: 20 },
    { x: 20, y: 14 },
];
const original = [
    { id: 'outer', groupId: 'letter', points: outline },
    { id: 'inner', groupId: 'letter', points: inner },
    {
        id: 'other',
        groupId: 'other',
        points: outline.map((p) => ({ x: p.x + 100, y: p.y })),
    },
];

test.each(['front-left', 'center'] as const)(
    'nesting rotates grouped contours and preserves unselected geometry with %s stock origin',
    (stockOrigin) => {
        const pushHistory = jest.fn();
        const { result } = renderHook(() => {
            const [loops, setLoops] =
                useState<
                    {
                        id: string;
                        groupId?: string;
                        points: { x: number; y: number }[];
                    }[]
                >(original);
            const [selected, setSelected] = useState(['outer', 'inner']);
            const [stack, setStack] = useState([{}]);
            let id = 0;
            const commands = useArrangeCommands({
                loops,
                selected,
                stockOrigin,
                nestRotation: 90,
                offsetAmount: 0,
                sheetW: 20,
                sheetH: 45,
                nestBorder: 0,
                nestSpacing: 0,
                selectedLoops: () =>
                    loops.filter((l) => selected.includes(l.id)),
                expandedSelectedIds: () => selected,
                withIds: (items) =>
                    items.map((item) => ({ ...item, id: `nested-${id++}` })),
                formatLength: String,
                pushHistory,
                refreshBounds: jest.fn(),
                setLoops,
                setSelected,
                setStack,
                setDraftPreview: jest.fn(),
                setOffsetPreview: jest.fn(),
                setStatus: jest.fn(),
            });
            return { ...commands, loops, selected, stack };
        });
        act(() => result.current.handleNest());
        expect(pushHistory).toHaveBeenCalledTimes(1);
        expect(result.current.loops.find((l) => l.id === 'other')).toBe(
            original[2],
        );
        expect(result.current.selected).toHaveLength(2);
        expect(result.current.stack).toHaveLength(0);
        const nested = result.current.loops.filter(
            (l) => l.groupId === 'letter',
        );
        expect(nested).toHaveLength(2);
        const pts = nested.flatMap((l) => l.points);
        expect(
            Math.max(...pts.map((p) => p.x)) - Math.min(...pts.map((p) => p.x)),
        ).toBeCloseTo(15);
        expect(Math.min(...pts.map((p) => p.x))).toBeCloseTo(
            stockOrigin === 'center' ? -10 : 0,
        );
        const a = nested[0].points[0],
            b = nested[1].points[0];
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeCloseTo(Math.hypot(10, 4));
    },
);

test('nesting moves imported circle landmarks instead of retaining their old centre', () => {
    type CircleLoop = {
        id: string;
        points: { x: number; y: number }[];
        exportGeometry?: {
            type: string;
            cx: number;
            cy: number;
            radius: number;
        };
    };
    const circle: CircleLoop = {
        id: 'circle',
        points: Array.from({ length: 37 }, (_, i) => ({
            x: 30 + 5 * Math.cos((i * Math.PI) / 18),
            y: 30 + 5 * Math.sin((i * Math.PI) / 18),
        })),
        exportGeometry: { type: 'circle', cx: 30, cy: 30, radius: 5 },
    };
    const { result } = renderHook(() => {
        const [loops, setLoops] = useState<CircleLoop[]>([circle]);
        const commands = useArrangeCommands({
            loops,
            selected: ['circle'],
            offsetAmount: 0,
            sheetW: 20,
            sheetH: 20,
            nestBorder: 2,
            nestSpacing: 5,
            nestRotation: 0,
            selectedLoops: () => loops,
            expandedSelectedIds: () => ['circle'],
            withIds: (items) =>
                items.map((item) => ({ ...item, id: 'nested' })),
            formatLength: String,
            pushHistory: jest.fn(),
            refreshBounds: jest.fn(),
            setLoops,
            setSelected: jest.fn(),
            setStack: jest.fn(),
            setDraftPreview: jest.fn(),
            setOffsetPreview: jest.fn(),
            setStatus: jest.fn(),
        });
        return { ...commands, loops };
    });
    act(() => result.current.handleNest());
    expect(result.current.loops[0].exportGeometry).toMatchObject({
        type: 'circle',
        cx: 7,
        cy: 7,
        radius: 5,
    });
});
