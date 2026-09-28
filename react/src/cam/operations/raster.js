import { defineOperation } from './contract.js';

function rasterOperation(id, emission) {
    return defineOperation({
        id,
        validate(config, context) {
            if (!context.hasBitmap)
                throw new Error(`${id} needs a bitmap source.`);
            if (!(context.spot(config) > 0))
                throw new Error(`${id} needs a positive spot size.`);
        },
        createPreview({ selectedLoops, config, services }) {
            return services.createRasterPreview(selectedLoops, config);
        },
        emission,
    });
}

export const laserRasterOperation = rasterOperation(
    'laser-raster',
    'laser-raster',
);
export const wavyRasterOperation = rasterOperation(
    'wavy-raster',
    'wavy-raster',
);
export const halftoneOperation = rasterOperation('halftone', 'halftone');
