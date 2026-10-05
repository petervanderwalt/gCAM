import { findGuideSource, snapToGuides } from './guides';

test('snaps to the nearest point on an arbitrary-angle guide', () => {
    const guides = [
        {
            id: 'diagonal',
            point: { x: 10, y: 10 },
            direction: { x: 1, y: 1 },
        },
    ];
    expect(snapToGuides({ x: 10, y: 11 }, guides, 2)).toEqual({
        x: 10.5,
        y: 10.5,
    });
});

test('leaves points outside guide snap tolerance unchanged', () => {
    const guides = [
        { id: 'horizontal', point: { x: 0, y: 10 }, direction: { x: 1, y: 0 } },
    ];
    expect(snapToGuides({ x: 15, y: 15 }, guides, 2)).toEqual({ x: 15, y: 15 });
});

test('ignores unusable in-memory guide records', () => {
    const staleGuide = { id: 'stale', axis: 'x', pos: 10 } as unknown as {
        id: string;
        point: { x: number; y: number };
        direction: { x: number; y: number };
    };
    expect(snapToGuides({ x: 10, y: 0 }, [staleGuide], 2)).toEqual({
        x: 10,
        y: 0,
    });
});

test('finds vector-edge and X/Y-axis guide sources by screen proximity', () => {
    const loops = [
        {
            id: 'edge',
            points: [
                { x: 20, y: 20 },
                { x: 40, y: 20 },
            ],
        },
    ];
    expect(findGuideSource({ x: 30, y: 20.5 }, loops, [], 10)?.label).toBe(
        'Edge',
    );
    expect(findGuideSource({ x: 30, y: 0.5 }, loops, [], 10)?.label).toBe(
        'X Axis',
    );
    expect(findGuideSource({ x: 0.5, y: 30 }, loops, [], 10)?.label).toBe(
        'Y Axis',
    );
    expect(findGuideSource({ x: 0, y: 30 }, loops, ['edge'], 10)?.label).toBe(
        'Y Axis',
    );
});
