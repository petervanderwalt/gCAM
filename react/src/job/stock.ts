import type { MaterialId } from '../cutting-parameters/types';

/** Physical workpiece shared by every operation in a project. Millimetres. */
export interface JobStock {
    widthMm: number;
    heightMm: number;
    thicknessMm: number;
    material: MaterialId;
}

export const DEFAULT_JOB_STOCK: JobStock = {
    widthMm: 300,
    heightMm: 300,
    thicknessMm: 18,
    material: 'sheet-goods',
};

export function normalizeJobStock(value: unknown): JobStock {
    const stock = value as Partial<JobStock> | null;
    const positive = (candidate: unknown, fallback: number) => {
        const number = Number(candidate);
        return Number.isFinite(number) && number > 0 ? number : fallback;
    };
    const material = stock?.material;
    const allowed = new Set<MaterialId>([
        'softwood', 'hardwood', 'sheet-goods', 'aluminium', 'brass',
        'acrylic', 'hdpe', 'foam',
    ]);
    return {
        widthMm: positive(stock?.widthMm, DEFAULT_JOB_STOCK.widthMm),
        heightMm: positive(stock?.heightMm, DEFAULT_JOB_STOCK.heightMm),
        thicknessMm: positive(stock?.thicknessMm, DEFAULT_JOB_STOCK.thicknessMm),
        material: allowed.has(material as MaterialId)
            ? (material as MaterialId)
            : DEFAULT_JOB_STOCK.material,
    };
}
