import { capPreviewSamples } from './sample-decimation.js';

test('preview decimation keeps raised V-bit corners and depth extrema', () => {
    const samples = [
        { x: 0, y: 0, z: -2, preserve: true },
        { x: 1, y: 0, z: -1.5 },
        { x: 2, y: 0, z: -1 },
        { x: 2, y: 1, z: -0.2, preserve: true },
        { x: 2, y: 2, z: -1 },
        { x: 3, y: 2, z: -1.5 },
        { x: 4, y: 2, z: -2, preserve: true },
    ];

    const result = capPreviewSamples(samples, 4);
    expect(result).toHaveLength(4);
    expect(result).toContain(samples[0]);
    expect(result).toContain(samples[3]);
    expect(result).toContain(samples[6]);
});

test('preview decimation leaves small sample sets unchanged', () => {
    const samples = [{ z: -1 }, { z: -2 }];
    expect(capPreviewSamples(samples, 10)).toBe(samples);
});
