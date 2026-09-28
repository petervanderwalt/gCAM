/**
 * Purpose: Implementation module for profile in the cam domain.
 */
import { defineOperation } from './contract.js';

function createProfileOperation(id, direction) {
    return defineOperation({
        id,
        validate(config) {
            if (!(config.toolRadius > 0))
                throw new Error('Profile needs a positive tool radius.');
        },
        createPreview({ config, compositeSelection, services }) {
            const radius = config.toolRadius + services.trochoidRadius(config);
            return services.offsetCompositePolygons(
                compositeSelection,
                direction * radius,
            );
        },
        emission: 'contours',
    });
}

export const profileOutsideOperation = createProfileOperation(
    'profile-outside',
    1,
);
export const profileInsideOperation = createProfileOperation(
    'profile-inside',
    -1,
);
