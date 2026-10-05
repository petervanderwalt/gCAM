/**
 * Purpose: Implementation module for import in the lib domain.
 */
import { dxfUnitScaleToMm, parseDxf } from '../engine/dxf.js';
import { cxfTextStrokes, parseCxf } from '../engine/cxf.js';
import { parseSvg } from '../engine/svg.js';
import { buildLoops } from '../geometry/loops.js';
import { mergeBounds } from '../geometry/bounds.js';

/** Accurate, reusable empty-document prompt for the app's supported file types. */
export const IMPORT_START_STATUS =
    'Import a DXF/SVG drawing, STL/OBJ model, or image to begin.';

export interface ImportResult {
    fileName: string;
    entityCount: number;
    loops: { id?: string; points: { x: number; y: number }[] }[];
    bounds: {
        minX: number;
        minY: number;
        maxX: number;
        maxY: number;
    } | null;
    /** Millimetres per source coordinate unit, or null when DXF units are unspecified. */
    unitScaleToMm: number | null;
    unitSource: 'dxf-metadata' | 'svg-physical-size' | 'svg-pixels' | 'unknown';
}

const MM_PER_CSS_PIXEL = 25.4 / 96;

function svgLengthToMm(value: string | null): number | null {
    if (!value) return null;
    const match = value
        .trim()
        .match(/^([+-]?(?:\d+\.?\d*|\.\d+))(mm|cm|in|px|pt|pc)?$/i);
    if (!match) return null;
    const amount = Number(match[1]);
    const unit = (match[2] ?? 'px').toLowerCase();
    const scale = (
        {
            mm: 1,
            cm: 10,
            in: 25.4,
            px: MM_PER_CSS_PIXEL,
            pt: 25.4 / 72,
            pc: 25.4 / 6,
        } as Record<string, number>
    )[unit];
    return Number.isFinite(amount) && amount > 0 && scale !== undefined
        ? amount * scale
        : null;
}

/** SVG viewBox units scale to its physical viewport; unitless SVG lengths are CSS px at 96 DPI. */
export function svgUnitScaleToMm(text: string): {
    scale: number;
    source: ImportResult['unitSource'];
} {
    const documentNode = new DOMParser().parseFromString(text, 'image/svg+xml');
    if (documentNode.querySelector('parsererror'))
        throw new Error('Invalid SVG');
    const root = documentNode.documentElement;
    const viewBox = (root.getAttribute('viewBox') ?? '')
        .trim()
        .split(/[\s,]+/)
        .map(Number);
    const viewBoxValid =
        viewBox.length === 4 && viewBox[2] > 0 && viewBox[3] > 0;
    const widthMm = svgLengthToMm(root.getAttribute('width'));
    const heightMm = svgLengthToMm(root.getAttribute('height'));
    if (viewBoxValid && widthMm) {
        return { scale: widthMm / viewBox[2], source: 'svg-physical-size' };
    }
    if (viewBoxValid && heightMm) {
        return { scale: heightMm / viewBox[3], source: 'svg-physical-size' };
    }
    return { scale: MM_PER_CSS_PIXEL, source: 'svg-pixels' };
}

async function readFileText(file: File): Promise<string> {
    if (typeof (file as unknown as { text?: unknown }).text === 'function') {
        return file.text();
    }
    if (
        typeof (file as unknown as { arrayBuffer?: unknown }).arrayBuffer ===
        'function'
    ) {
        const buf = await file.arrayBuffer();
        return new TextDecoder().decode(buf);
    }
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ''));
        reader.onerror = () => reject(reader.error ?? new Error('Read failed'));
        reader.readAsText(file);
    });
}

export async function importVectorFile(file: File): Promise<ImportResult> {
    const text = await readFileText(file);
    const name = file.name.toLowerCase();
    const isDxf = name.endsWith('.dxf');
    const svgUnits = name.endsWith('.svg') ? svgUnitScaleToMm(text) : null;
    const unitScaleToMm = isDxf
        ? dxfUnitScaleToMm(text)
        : (svgUnits?.scale ?? null);
    const unitSource: ImportResult['unitSource'] = isDxf
        ? unitScaleToMm === null
            ? 'unknown'
            : 'dxf-metadata'
        : (svgUnits?.source ?? 'unknown');
    let entities = isDxf
        ? parseDxf(text)
        : name.endsWith('.svg')
          ? parseSvg(text)
          : (() => {
                throw new Error('Unsupported file — import .dxf or .svg');
            })();
    if (isDxf && entities.some((entity) => entity.type === 'CAD_TEXT')) {
        entities = await convertDxfTextToStrokes(entities);
    }
    const loops = buildLoops(entities);
    const bounds = mergeBounds(loops.map((l) => l.bounds).filter(Boolean));
    return {
        fileName: file.name,
        entityCount: entities.length,
        loops,
        bounds,
        unitScaleToMm,
        unitSource,
    };
}

let courierCadFontPromise: Promise<ReturnType<typeof parseCxf>> | null = null;

async function convertDxfTextToStrokes(entities: ReturnType<typeof parseDxf>) {
    courierCadFontPromise ??= (async () => {
        const baseUrl = import.meta.env.BASE_URL || '/';
        const response = await fetch(`${baseUrl}assets/fonts/CourierCad.cxf`);
        if (!response.ok)
            throw new Error('Could not load the CourierCad font.');
        return parseCxf(await response.text());
    })();
    const font = await courierCadFontPromise;

    return entities.map((entity) => {
        if (entity.type !== 'CAD_TEXT') return entity;
        const strokes = cxfTextStrokes(String(entity.text || ''), font, {
            x: entity.x,
            y: entity.y,
            height: entity.height || 1,
            rotationDeg: entity.rotationDeg || 0,
            lineSpacingFactor: entity.lineSpacingFactor || 1,
            attachmentPoint: entity.attachmentPoint || 1,
        });
        return { ...entity, strokes, __cadTextMode: 'stroke' };
    });
}

/** Apply the source-to-mm conversion to all imported vector coordinates. */
export function scaleImportResult(
    result: ImportResult,
    scale: number,
): ImportResult {
    const loops = result.loops.map((loop) => ({
        ...loop,
        points: loop.points.map((point) => ({
            x: point.x * scale,
            y: point.y * scale,
        })),
    }));
    const bounds = result.bounds
        ? {
              minX: result.bounds.minX * scale,
              minY: result.bounds.minY * scale,
              maxX: result.bounds.maxX * scale,
              maxY: result.bounds.maxY * scale,
          }
        : null;
    return { ...result, loops, bounds, unitScaleToMm: scale };
}
