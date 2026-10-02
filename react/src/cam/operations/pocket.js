/**
 * Purpose: Implementation module for pocket in the cam domain.
 */
import { defineOperation } from './contract.js';

export const pocketOperation = defineOperation({
    id: 'pocket',
    validate(config) {
        if (!(config.toolDiameter > 0))
            throw new Error('Pocket needs a positive tool diameter.');
    },
    createPreview({ config, compositeSelection, services }) {
        const previewContours = [];
        const stepOver =
            config.toolDiameter * (1 - config.overlapPercent / 100);
        // Trochoidal passes orbit around a path that is pulled inward by the
        // orbit radius. The orbit then reaches back to the nominal pocket
        // boundary without sweeping the cutter outside the pocket.
        const orbitRadius = services.trochoidRadius(config);
        const first = services.offsetCompositePolygons(
            compositeSelection,
            -(config.toolRadius + orbitRadius),
        );
        previewContours.push(...first);
        let current = first;
        let iteration = 0;
        while (current.length) {
            iteration += 1;
            services.reportProgress(
                Math.min(84, 40 + iteration * 8),
                'Calculating pocket passes',
            );
            const next = services.offsetCompositePolygons(current, -stepOver);
            if (!next.length) break;
            previewContours.push(...next);
            current = next;
        }
        return previewContours;
    },
    emission: 'contours',
});
