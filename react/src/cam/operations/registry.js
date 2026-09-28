import { OPERATION_LABELS } from './contract.js';
import {
    engraveOperation,
    chamferOperation,
    laserCutOperation,
} from './engrave.js';
import { pocketOperation } from './pocket.js';
import { profileInsideOperation, profileOutsideOperation } from './profile.js';
import {
    halftoneOperation,
    laserRasterOperation,
    wavyRasterOperation,
} from './raster.js';
import { textureFillOperation } from './texture.js';
import { vcarveOperation } from './vcarve.js';

const operations = [
    profileOutsideOperation,
    profileInsideOperation,
    pocketOperation,
    engraveOperation,
    chamferOperation,
    vcarveOperation,
    textureFillOperation,
    laserCutOperation,
    laserRasterOperation,
    wavyRasterOperation,
    halftoneOperation,
];

export const operationRegistry = new Map(
    operations.map((operation) => [operation.id, operation]),
);

export function getOperation(operationId) {
    const operation = operationRegistry.get(operationId);
    if (!operation)
        throw new Error(`Unsupported CAM operation: ${operationId}`);
    return operation;
}

export function getOperationLabel(operationId) {
    return OPERATION_LABELS[operationId] || operationId;
}

/** Compatible with saved toolpaths created before the operation registry. */
export function getToolpathEmission(toolpath) {
    return toolpath.emission || getOperation(toolpath.operation).emission;
}
