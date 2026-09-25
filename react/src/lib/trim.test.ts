import { trimNearestSegment } from './trim';

test('trims the nearest segment into two remaining paths', () => {
    const result = trimNearestSegment(
        [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }],
        { x: 5, y: 0 },
        1,
    );
    expect(result?.segmentIndex).toBe(0);
    expect(result?.before).toEqual([{ x: 0, y: 0 }]);
    expect(result?.after).toEqual([{ x: 10, y: 0 }, { x: 10, y: 10 }]);
});

test('rejects clicks outside the trim tolerance', () => {
    expect(trimNearestSegment([{ x: 0, y: 0 }, { x: 10, y: 0 }], { x: 5, y: 4 }, 1)).toBeNull();
});
