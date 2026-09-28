/**
 * Purpose: Implementation module for operationCatalog in the react domain.
 */
import type { Operation } from '../lib/engine';

export const OPERATIONS: { value: Operation; label: string }[] = [
    { value: 'profile-outside', label: 'Outside' },
    { value: 'profile-inside', label: 'Inside' },
    { value: 'pocket', label: 'Pocket' },
    { value: 'engrave', label: 'Engrave' },
    { value: 'chamfer', label: 'Chamfer' },
    { value: 'vcarve', label: 'V-Carve' },
    { value: 'texture-fill', label: 'Texture Fill' },
    { value: 'laser-cut', label: 'Laser Cut' },
    { value: 'laser-raster', label: 'Laser Raster' },
    { value: 'wavy-raster', label: 'Wavy' },
    { value: 'halftone', label: 'Halftone' },
];

const operationAsset = (name: string) =>
    `${import.meta.env.BASE_URL}assets/operations/${name}.png`;

export const OPERATION_IMAGES: Partial<Record<Operation, string>> = {
    'profile-outside': operationAsset('outside'),
    'profile-inside': operationAsset('inside'),
    pocket: operationAsset('pocket'),
    engrave: operationAsset('engrave'),
    chamfer: operationAsset('chamfer'),
    vcarve: operationAsset('vcarve'),
    'texture-fill': operationAsset('texture-fill'),
    'laser-cut': operationAsset('engrave'),
    'laser-raster': operationAsset('engrave'),
    'wavy-raster': operationAsset('pocket'),
    halftone: operationAsset('pocket'),
};

export const RASTER_OPERATIONS: Operation[] = [
    'laser-raster',
    'wavy-raster',
    'halftone',
];
