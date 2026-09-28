import { defineOperation } from './contract.js';

function directContourOperation(id) {
    return defineOperation({
        id,
        createPreview({ selectedLoops, services }) {
            return selectedLoops
                .filter((loop) => loop.points)
                .map((loop) => loop.points.map(services.clonePoint));
        },
        emission: id === 'laser-cut' ? 'laser-cut' : 'contours',
    });
}

export const engraveOperation = directContourOperation('engrave');
export const chamferOperation = directContourOperation('chamfer');
export const laserCutOperation = directContourOperation('laser-cut');
