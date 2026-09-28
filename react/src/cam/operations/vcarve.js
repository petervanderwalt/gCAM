/**
 * Purpose: Implementation module for vcarve in the cam domain.
 */
import { defineOperation } from './contract.js';

export const vcarveOperation = defineOperation({
    id: 'vcarve',
    validate(config) {
        if (!(config.cutterAngle > 0 && config.cutterAngle < 180)) {
            throw new Error(
                'V-Carve needs a cutter angle between 1 and 179 degrees.',
            );
        }
    },
    createPreview() {
        return [];
    },
    emission: 'vcarve',
    asynchronous: true,
});
