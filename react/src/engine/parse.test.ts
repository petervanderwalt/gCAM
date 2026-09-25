import { parseDxf } from './dxf.js';
import { parseSvg } from './svg.js';
import {
    boundsOfEntities,
    buildLoops,
    polygonArea,
    polylineLength,
} from './paths.js';

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

const SHAPES_SVG = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">',
    '<rect x="10" y="10" width="20" height="20"/>',
    '<circle cx="60" cy="60" r="10"/>',
    '</svg>',
].join('\n');

test('parseDxf reads an LWPOLYLINE square', () => {
    const entities = parseDxf(SQUARE_DXF);
    expect(entities).toHaveLength(1);
    expect(entities[0].vertices).toHaveLength(4);
    const bounds = boundsOfEntities(entities);
    expect(bounds.minX).toBeCloseTo(0);
    expect(bounds.maxX).toBeCloseTo(20);
    expect(bounds.minY).toBeCloseTo(0);
    expect(bounds.maxY).toBeCloseTo(20);
});

test('buildLoops closes the square with correct area and perimeter', () => {
    const entities = parseDxf(SQUARE_DXF);
    const loops = buildLoops(entities);
    expect(loops.length).toBeGreaterThanOrEqual(1);
    const loop = loops[0];
    expect(loop.points.length).toBeGreaterThanOrEqual(4);
    expect(Math.abs(polygonArea(loop.points))).toBeCloseTo(400, 0);
    expect(polylineLength(loop.points)).toBeCloseTo(80, 0);
});

test('parseSvg reads rect and circle without DOM measurement', () => {
    const entities = parseSvg(SHAPES_SVG);
    expect(entities.length).toBeGreaterThanOrEqual(2);
    const bounds = boundsOfEntities(entities);
    expect(bounds.minX).toBeCloseTo(10);
    expect(bounds.maxX).toBeCloseTo(70);
});
