import { snapToGuides } from './guides';

test('snaps to the nearest guide inside tolerance', () => {
    const guides = [
        { id: 'a', axis: 'x' as const, pos: 10 },
        { id: 'b', axis: 'y' as const, pos: 20 },
    ];
    expect(snapToGuides({ x: 10.5, y: 19.6 }, guides)).toEqual({
        x: 10,
        y: 20,
    });
});

test('ignores guides outside tolerance', () => {
    const guides = [{ id: 'a', axis: 'x' as const, pos: 10 }];
    expect(snapToGuides({ x: 15, y: 15 }, guides)).toEqual({ x: 15, y: 15 });
});

test('picks the closest of several guides', () => {
    const guides = [
        { id: 'a', axis: 'x' as const, pos: 10 },
        { id: 'b', axis: 'x' as const, pos: 12 },
    ];
    expect(snapToGuides({ x: 11.6, y: 0 }, guides)).toEqual({
        x: 12,
        y: 0,
    });
});
