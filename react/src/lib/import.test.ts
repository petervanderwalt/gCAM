import { importVectorFile } from './import';

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
});

test('importVectorFile rejects unsupported files', async () => {
    const file = new File(['hello'], 'note.txt');
    await expect(importVectorFile(file)).rejects.toThrow(/Unsupported/);
});
