/**
 * Purpose: Implementation module for texture in the cam domain.
 */
import { defineOperation } from './contract.js';

export const textureFillOperation = defineOperation({
    id: 'texture-fill',
    validate(config) {
        if (!(config.cutterAngle > 0 && config.cutterAngle < 180)) {
            throw new Error(
                'Texture Fill needs a V-bit angle between 1 and 179 degrees.',
            );
        }
    },
    createPreview({ config, compositeSelection, services }) {
        const textureType = config.textureType || 'voronoi';
        const spacing = config.textureSpacing;
        services.reportProgress(55, `Building ${textureType} texture`);
        return textureType === 'crosshatch'
            ? services.crosshatchTextureContours(
                  compositeSelection,
                  spacing,
                  config.crosshatchAngle,
              )
            : services.voronoiTextureContours(compositeSelection, spacing);
    },
    emission: 'contours',
});
