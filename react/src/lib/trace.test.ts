import { flattenTracedPaths, preprocessImageData } from './trace';

test('corner segments become a closed loop', () => {
    const loops = flattenTracedPaths([
        [
            { type: 'POINT', x: 0, y: 0 },
            { type: 'POINT', x: 10, y: 0 },
            { type: 'POINT', x: 10, y: 10 },
            { type: 'POINT', x: 0, y: 10 },
        ],
    ]);
    expect(loops).toHaveLength(1);
    expect(loops[0][0]).toEqual(loops[0][loops[0].length - 1]);
});

test('bezier segments flatten to smooth curves', () => {
    const loops = flattenTracedPaths(
        [
            [
                { type: 'POINT', x: 0, y: 0 },
                {
                    type: 'CURVE',
                    x1: 0,
                    y1: 10,
                    x2: 10,
                    y2: 10,
                    x: 10,
                    y: 0,
                },
            ],
        ],
        8,
    );
    expect(loops).toHaveLength(1);
    // start point + 8 flattened steps, closed
    expect(loops[0]).toHaveLength(10);
    const mid = loops[0][4];
    expect(mid.x).toBeCloseTo(5, 0);
    expect(mid.y).toBeCloseTo(7.5, 0);
});

test('tiny paths are dropped', () => {
    expect(flattenTracedPaths([[{ type: 'POINT', x: 1, y: 1 }]])).toHaveLength(
        0,
    );
});

function grayImage(values: number[]) {
    const data = new Uint8ClampedArray(values.length * 4);
    values.forEach((v, i) => {
        data[i * 4] = v;
        data[i * 4 + 1] = v;
        data[i * 4 + 2] = v;
        data[i * 4 + 3] = 255;
    });
    return { width: values.length, height: 1, data };
}

test('threshold binarizes around the cutoff', () => {
    const img = grayImage([100, 200]);
    preprocessImageData(img, {
        brightness: 0,
        contrast: 0,
        threshold: 128,
        invert: false,
    });
    expect([img.data[0], img.data[4]]).toEqual([0, 255]);
});

test('invert flips luma', () => {
    const img = grayImage([0]);
    preprocessImageData(img, {
        brightness: 0,
        contrast: 0,
        threshold: null,
        invert: true,
    });
    expect(img.data[0]).toBe(255);
});
