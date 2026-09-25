import { parseDxf } from '../engine/dxf.js';
import { parseSvg } from '../engine/svg.js';
import { buildLoops, mergeBounds } from '../engine/paths.js';

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
    const entities = name.endsWith('.dxf')
        ? parseDxf(text)
        : name.endsWith('.svg')
          ? parseSvg(text)
          : (() => {
                throw new Error('Unsupported file — import .dxf or .svg');
            })();
    const loops = buildLoops(entities);
    const bounds = mergeBounds(loops.map((l) => l.bounds).filter(Boolean));
    return {
        fileName: file.name,
        entityCount: entities.length,
        loops,
        bounds,
    };
}
