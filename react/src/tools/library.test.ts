/**
 * Tests: blank library has 12 unconfigured slots; cutter geometry round-trips through storage; legacy camcanvas key migrates forward; corrupt storage yields blanks, not throws.
 */
import {
    blankSlots,
    isConfigured,
    loadSlots,
    saveSlots,
    type ToolSlot,
} from './library';

function memStore(data: Record<string, string> = {}) {
    return {
        getItem: (k: string) => data[k] ?? null,
        setItem: (k: string, v: string) => {
            data[k] = v;
        },
    };
}

const FULL: ToolSlot = {
    slot: 1,
    name: '6mm flat',
    toolType: 'flat',
    cuttingDiameterMm: 6,
    cuttingLengthMm: 20,
    flutes: 2,
    cutterMaterial: 'Solid carbide',
    fluteAngleDeg: null,
    libraryToolId: null,
    vendor: '',
    vendorDisplayName: '',
    storeUrl: '',
    image: '',
};

test('blank library has 12 unconfigured slots', () => {
    const slots = blankSlots();
    expect(slots).toHaveLength(12);
    expect(slots.every((s) => !isConfigured(s))).toBe(true);
});

test('configured slot round-trips through storage', () => {
    const store = memStore();
    const slots = blankSlots();
    slots[0] = FULL;
    saveSlots(store, slots);
    const back = loadSlots(store);
    expect(back[0]).toEqual(FULL);
    expect(back.filter(isConfigured)).toHaveLength(1);
});

test('legacy camcanvas key migrates forward', () => {
    const store = memStore({
        'camcanvas.myEndmills.v1': JSON.stringify({ slots: [FULL] }),
    });
    const back = loadSlots(store);
    expect(back[0]).toEqual({ ...FULL, slot: 1 });
});

test('corrupt storage yields blanks, not throws', () => {
    const store = memStore({ 'gcam.myEndmills.v1': '{oops' });
    expect(loadSlots(store)).toHaveLength(12);
});
