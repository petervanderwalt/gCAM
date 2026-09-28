/**
 * Tests: normalizeLibraryTool; toolSupportsOperation; libraryMetaLine; loadToolLibraries.
 */
import {
    libraryMetaLine,
    loadToolLibraries,
    normalizeLibraryTool,
    resolveLibraryImage,
    toolSupportsOperation,
} from './library';

describe('normalizeLibraryTool', () => {
    it('fills defaults for sparse entries', () => {
        const tool = normalizeLibraryTool({ id: 'x-1', name: 'End Mill' });
        expect(tool.toolType).toBe('flat');
        expect(tool.cuttingDiameterMm).toBeNull();
        expect(tool.operationHints).toEqual([]);
        expect(tool.storeUrl).toBe('');
    });

    it('falls back through purchase/product URLs', () => {
        const tool = normalizeLibraryTool({
            id: 'x-2',
            purchaseUrl: 'https://example.com/buy',
        });
        expect(tool.storeUrl).toBe('https://example.com/buy');
    });

    it('retains cutter geometry needed for recommendations', () => {
        const tool = normalizeLibraryTool({
            id: 'x-geometry',
            cuttingDiameterMm: 6.35,
            cuttingLengthMm: 20,
            shankDiameterMm: 6.35,
            flutes: 2,
            fluteType: 'Upcut',
            material: 'Solid carbide',
            coating: 'ZrN',
        });
        expect(tool).toMatchObject({
            cuttingDiameterMm: 6.35,
            cuttingLengthMm: 20,
            shankDiameterMm: 6.35,
            flutes: 2,
            fluteType: 'Upcut',
            cutterMaterial: 'Solid carbide',
            coating: 'ZrN',
        });
    });

    it('rejects unknown tool types', () => {
        const tool = normalizeLibraryTool({ id: 'x-3', toolType: 'torus' });
        expect(tool.toolType).toBe('flat');
    });
});

describe('toolSupportsOperation', () => {
    it('matches operation hints, open when empty', () => {
        const hinted = normalizeLibraryTool({
            id: 'a',
            operationHints: ['pocket'],
        });
        expect(toolSupportsOperation(hinted, 'pocket')).toBe(true);
        expect(toolSupportsOperation(hinted, 'vcarve')).toBe(false);
        const open = normalizeLibraryTool({ id: 'b' });
        expect(toolSupportsOperation(open, 'vcarve')).toBe(true);
    });
});

describe('libraryMetaLine', () => {
    it('summarizes diameter, angle and vendor', () => {
        const tool = normalizeLibraryTool({
            id: 'v-1',
            toolType: 'v-bit',
            cuttingDiameterMm: 15,
            fluteAngleDeg: 60,
            vendorDisplayName: 'Sienci Labs',
        });
        expect(libraryMetaLine(tool)).toBe('Ø15mm · 60° · Sienci Labs');
    });
});

describe('loadToolLibraries', () => {
    it('merges vendor payloads and stamps vendor', async () => {
        const fetchFn = async (url: string) => ({
            ok: true,
            json: async () =>
                url.includes('sienci')
                    ? {
                          tools: [
                              {
                                  id: 's-1',
                                  name: 'Surfacing',
                                  vendor: 'sienci',
                                  image: 'images/surfacing.jpg',
                              },
                          ],
                      }
                    : [{ id: 'o-1', name: 'Flat' }],
        });
        const tools = await loadToolLibraries(
            fetchFn as unknown as typeof fetch,
            [
                { url: 'library/tools/sienci/tools.json', vendor: 'sienci' },
                { url: 'fixture-two.json', vendor: 'test-fixture' },
            ],
        );
        expect(tools.map((t) => t.id)).toEqual(['s-1', 'o-1']);
        expect(tools[0].image).toBe(
            '/library/tools/sienci/images/surfacing.jpg',
        );
        expect(tools[1].vendor).toBe('test-fixture');
    });

    it('throws per-vendor on fetch failure', async () => {
        const fetchFn = async () => ({ ok: false });
        await expect(
            loadToolLibraries(fetchFn as unknown as typeof fetch, [
                { url: 'x.json', vendor: 'sienci' },
            ]),
        ).rejects.toThrow('Failed to load sienci tool library.');
    });
});

test('resolves bundled tool images from the site base path', () => {
    expect(
        resolveLibraryImage(
            'images/bit.jpg',
            'library/tools/sienci/tools.json',
            '/gCAM/',
        ),
    ).toBe('/gCAM/library/tools/sienci/images/bit.jpg');
});
