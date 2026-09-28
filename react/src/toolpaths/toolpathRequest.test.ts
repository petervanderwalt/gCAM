import {
    assertToolpathRequest,
    makeToolpathConfig,
    prepareRasterInput,
} from './toolpathRequest';

test('normalizes shared CAM defaults once for sync and worker paths', () => {
    const config = makeToolpathConfig({
        operation: 'profile-outside',
        toolDiameter: 6,
        cutDepth: 4,
    });
    expect(config.toolRadius).toBe(3);
    expect(config.passDepth).toBe(4);
    expect(config.tabHeight).toBe(2);
    expect(config.toolNumber).toBe(1);
});

test('raster requests retain source image data outside the document loops', () => {
    const bitmap = {
        imageData: { width: 1, height: 1, data: [0, 0, 0, 255] },
        bounds: { minX: 0, minY: 0, maxX: 10, maxY: 10 },
    };
    const result = prepareRasterInput(
        [{ id: 'bitmap', points: [{ x: 0, y: 0 }] }],
        'laser-raster',
        bitmap,
    );
    expect(result.loops[0]).toMatchObject({
        isBitmap: true,
        bounds: bitmap.bounds,
    });
    expect(result.options.sourceEntities?.[0]._imageData).toBe(
        bitmap.imageData,
    );
});

test('bitmap operations reject missing image data before CAM runs', () => {
    expect(() =>
        assertToolpathRequest({
            operation: 'halftone',
            toolDiameter: 3,
            cutDepth: 1,
        }),
    ).toThrow('Halftone needs a bitmap');
});
