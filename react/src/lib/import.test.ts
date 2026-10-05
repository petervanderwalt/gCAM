/**
 * Tests: importVectorFile parses a DXF square into fitted loops; importVectorFile rejects unsupported files.
 */
import {
    importVectorFile,
    scaleImportResult,
    svgUnitScaleToMm,
} from './import';
import { dxfUnitScaleToMm } from '../engine/dxf.js';

const SQUARE_DXF = [
    '0',
    'SECTION',
    '2',
    'ENTITIES',
    '0',
    'LWPOLYLINE',
    '8',
    '0',
    '90',
    '4',
    '70',
    '1',
    '10',
    '0.0',
    '20',
    '0.0',
    '10',
    '20.0',
    '20',
    '0.0',
    '10',
    '20.0',
    '20',
    '20.0',
    '10',
    '0.0',
    '20',
    '20.0',
    '0',
    'ENDSEC',
    '0',
    'EOF',
    '',
].join('\n');

test('importVectorFile parses a DXF square into fitted loops', async () => {
    const file = new File([SQUARE_DXF], 'square.dxf');
    const result = await importVectorFile(file);
    expect(result.entityCount).toBe(1);
    expect(result.loops.length).toBeGreaterThanOrEqual(1);
    expect(result.bounds?.maxX).toBeCloseTo(20);
    expect(result.unitScaleToMm).toBeNull();
});

test.each([
    [1, 25.4],
    [4, 1],
    [5, 10],
    [6, 1000],
])('reads DXF unit code %i as %f mm per unit', (code, expected) => {
    const dxf = `0\nSECTION\n2\nHEADER\n9\n$INSUNITS\n70\n${code}\n0\nENDSEC\n`;
    expect(dxfUnitScaleToMm(dxf)).toBe(expected);
});

test('scales DXF geometry and bounds into millimetres', () => {
    const result = {
        fileName: 'part.dxf',
        entityCount: 1,
        loops: [
            {
                points: [
                    { x: 0, y: 0 },
                    { x: 2, y: 1 },
                ],
            },
        ],
        bounds: { minX: 0, minY: 0, maxX: 2, maxY: 1 },
        unitScaleToMm: null,
        unitSource: 'unknown' as const,
    };
    expect(scaleImportResult(result, 25.4)).toMatchObject({
        loops: [
            {
                points: [
                    { x: 0, y: 0 },
                    { x: 50.8, y: 25.4 },
                ],
            },
        ],
        bounds: { maxX: 50.8, maxY: 25.4 },
        unitScaleToMm: 25.4,
    });
});

test('converts SVG physical dimensions and defaults unitless SVGs to CSS pixels', () => {
    expect(svgUnitScaleToMm('<svg width="2in" viewBox="0 0 192 96"/>')).toEqual(
        {
            scale: 25.4 / 96,
            source: 'svg-physical-size',
        },
    );
    expect(
        svgUnitScaleToMm('<svg height="25.4mm" viewBox="0 0 96 96"/>'),
    ).toEqual({
        scale: 25.4 / 96,
        source: 'svg-physical-size',
    });
    expect(svgUnitScaleToMm('<svg viewBox="0 0 96 96"/>')).toEqual({
        scale: 25.4 / 96,
        source: 'svg-pixels',
    });
});

test('importVectorFile rejects unsupported files', async () => {
    const file = new File(['hello'], 'note.txt');
    await expect(importVectorFile(file)).rejects.toThrow(/Unsupported/);
});
