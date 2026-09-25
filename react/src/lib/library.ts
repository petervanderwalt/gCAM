export interface LibraryTool {
    id: string;
    name: string;
    vendor: string;
    vendorDisplayName: string;
    toolType:
        | 'flat'
        | 'ball'
        | 'ballnose'
        | 'surfacing'
        | 'drill'
        | 'v-bit'
        | 'specialty';
    operationHints: string[];
    cuttingDiameterMm: number | null;
    fluteAngleDeg: number | null;
    image: string;
    storeUrl: string;
    description: string;
}

const TOOL_TYPES = [
    'flat',
    'ball',
    'ballnose',
    'surfacing',
    'drill',
    'v-bit',
    'specialty',
] as const;

export function normalizeLibraryTool(raw: unknown): LibraryTool {
    const r = (raw ?? {}) as Record<string, unknown>;
    const num = (v: unknown) =>
        typeof v === 'number' && Number.isFinite(v) ? v : null;
    const str = (v: unknown) => (typeof v === 'string' ? v : '');
    const rawType = str(r.toolType).toLowerCase();
    const toolType = (TOOL_TYPES as readonly string[]).includes(rawType)
        ? (rawType as LibraryTool['toolType'])
        : 'flat';
    return {
        id: str(r.id),
        name: str(r.name),
        vendor: str(r.vendor),
        vendorDisplayName: str(r.vendorDisplayName) || str(r.vendor),
        toolType,
        operationHints: Array.isArray(r.operationHints)
            ? (r.operationHints as unknown[]).filter(
                  (h): h is string => typeof h === 'string' && h.length > 0,
              )
            : [],
        cuttingDiameterMm: num(r.cuttingDiameterMm),
        fluteAngleDeg: num(r.fluteAngleDeg),
        image: str(r.image),
        storeUrl: str(r.storeUrl) || str(r.purchaseUrl) || str(r.productUrl),
        description: str(r.description),
    };
}

export function toolSupportsOperation(
    tool: LibraryTool,
    operation: string,
): boolean {
    if (!tool.operationHints.length) return true;
    return tool.operationHints.includes(operation);
}

/** One-line summary like legacy buildToolLibraryMetaLine. */
export function libraryMetaLine(tool: LibraryTool): string {
    const parts: string[] = [];
    if (tool.cuttingDiameterMm != null)
        parts.push(`Ø${tool.cuttingDiameterMm}mm`);
    if (tool.toolType === 'v-bit' && tool.fluteAngleDeg != null)
        parts.push(`${tool.fluteAngleDeg}°`);
    if (tool.vendorDisplayName) parts.push(tool.vendorDisplayName);
    return parts.join(' · ');
}

export interface LibrarySource {
    url: string;
    vendor: string;
}

export const LIBRARY_SOURCES: LibrarySource[] = [
    { url: 'library/tools/sienci/tools.json', vendor: 'sienci' },
];

/** Fetch + normalize vendor catalogs (served from public/). */
export async function loadToolLibraries(
    fetchFn: typeof fetch = fetch,
    sources: LibrarySource[] = LIBRARY_SOURCES,
    base = import.meta.env.BASE_URL || '/',
): Promise<LibraryTool[]> {
    const tools: LibraryTool[] = [];
    for (const source of sources) {
        const response = await fetchFn(
            `${base}${source.url}`.replace(/\/+/g, '/'),
        );
        if (!response.ok) {
            throw new Error(`Failed to load ${source.vendor} tool library.`);
        }
        const payload = await response.json();
        const raw: unknown[] = Array.isArray(payload)
            ? payload
            : Array.isArray(payload.tools)
              ? payload.tools
              : [];
        for (const item of raw) {
            const tool = normalizeLibraryTool(item);
            if (!tool.id) continue;
            if (!tool.vendor) tool.vendor = source.vendor;
            if (!tool.vendorDisplayName) tool.vendorDisplayName = source.vendor;
            tools.push(tool);
        }
    }
    return tools;
}
