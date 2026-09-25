export type ToolType =
    | 'flat'
    | 'ball'
    | 'ballnose'
    | 'surfacing'
    | 'drill'
    | 'v-bit'
    | 'specialty';

export interface ToolSlot {
    slot: number;
    name: string;
    toolType: ToolType;
    cuttingDiameterMm: number | null;
    fluteAngleDeg: number | null;
    feedRate: number | null;
    plungeRate: number | null;
    spindle: number | null;
    passDepthMm: number | null;
    libraryToolId: string | null;
    vendor: string;
    vendorDisplayName: string;
    storeUrl: string;
    image: string;
}

export const TOOL_STORAGE_KEY = 'gcam.myEndmills.v1';
export const TOOL_STORAGE_KEY_LEGACY = 'camcanvas.myEndmills.v1';
export const SLOT_COUNT = 12;

export function blankSlots(): ToolSlot[] {
    return Array.from({ length: SLOT_COUNT }, (_, i) => ({
        slot: i + 1,
        name: '',
        toolType: 'flat' as ToolType,
        cuttingDiameterMm: null,
        fluteAngleDeg: null,
        feedRate: null,
        plungeRate: null,
        spindle: null,
        passDepthMm: null,
        libraryToolId: null,
        vendor: '',
        vendorDisplayName: '',
        storeUrl: '',
        image: '',
    }));
}

export function isConfigured(slot: ToolSlot): boolean {
    return Boolean(
        slot.name &&
            Number.isFinite(slot.cuttingDiameterMm) &&
            Number.isFinite(slot.feedRate) &&
            Number.isFinite(slot.plungeRate) &&
            Number.isFinite(slot.spindle) &&
            Number.isFinite(slot.passDepthMm),
    );
}

function normalize(raw: unknown, slot: number): ToolSlot {
    const r = (raw ?? {}) as Partial<ToolSlot>;
    const num = (v: unknown) =>
        typeof v === 'number' && Number.isFinite(v) ? v : null;
    const str = (v: unknown) => (typeof v === 'string' ? v : '');
    const knownTypes: ToolType[] = [
        'flat',
        'ball',
        'ballnose',
        'surfacing',
        'drill',
        'v-bit',
        'specialty',
    ];
    const toolType: ToolType = knownTypes.includes(r.toolType as ToolType)
        ? (r.toolType as ToolType)
        : 'flat';
    return {
        slot,
        name: str(r.name),
        toolType,
        cuttingDiameterMm: num(r.cuttingDiameterMm),
        fluteAngleDeg: num(r.fluteAngleDeg),
        feedRate: num(r.feedRate),
        plungeRate: num(r.plungeRate),
        spindle: num(r.spindle),
        passDepthMm: num(r.passDepthMm),
        libraryToolId:
            typeof r.libraryToolId === 'string' ? r.libraryToolId : null,
        vendor: str(r.vendor),
        vendorDisplayName: str(r.vendorDisplayName),
        storeUrl: str(r.storeUrl),
        image: str(r.image),
    };
}

export interface StorageLike {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
}

export function loadSlots(storage: StorageLike): ToolSlot[] {
    let parsed: { slots?: unknown[] } | null = null;
    try {
        parsed = JSON.parse(
            storage.getItem(TOOL_STORAGE_KEY) ??
                storage.getItem(TOOL_STORAGE_KEY_LEGACY) ??
                'null',
        );
    } catch {
        parsed = null;
    }
    const raw = Array.isArray(parsed?.slots) ? parsed.slots : [];
    return blankSlots().map((blank, i) => normalize(raw[i], blank.slot));
}

export function saveSlots(storage: StorageLike, slots: ToolSlot[]): void {
    storage.setItem(TOOL_STORAGE_KEY, JSON.stringify({ slots }));
}
