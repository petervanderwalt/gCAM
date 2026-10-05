import {
    initialSurfacePlacement,
    machineUpToSetupAngles,
    readSurfaceMeshFile,
    renderHeightmapDataUrl,
    setupAnglesToMachineUp,
    transformStoredSurfaceMesh,
} from './surface-model';
import { orientSurfaceMesh } from './surface-cam';

test('imports OBJ coordinates using the explicitly selected physical units', async () => {
    const file = {
        name: 'plane.obj',
        text: async () =>
            ['v 0 0 0', 'v 1 0 0', 'v 1 1 0', 'f 1 2 3'].join('\n'),
    } as File;
    const model = await readSurfaceMeshFile(file, 'inch');
    expect(model.vertices).toHaveLength(9);
    expect(model.bounds.maxX).toBeCloseTo(25.4);
    expect(model.bounds.maxY).toBeCloseTo(25.4);
    expect(model.sourceUnitScaleMm).toBe(25.4);
});

test('keeps an edge-on model importable and asks for a valid setup before placement', () => {
    const vertices = [0, 0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 0, 0, 1, 1, 0, 0, 1];
    const result = renderHeightmapDataUrl({
        vertices,
        bounds: { minX: 0, minY: 0, minZ: 0, maxX: 0, maxY: 1, maxZ: 1 },
        sourceName: 'vertical.obj',
        sourceUnitScaleMm: 1,
    });
    expect(result.machinableTopDown).toBe(false);
    expect(result.orientedBounds.maxX - result.orientedBounds.minX).toBe(0);
    expect(decodeURIComponent(result.dataUrl)).toContain(
        'Choose a machining setup direction',
    );
});

test('places imported STL at its entered physical mm dimensions', () => {
    const placement = initialSurfacePlacement(
        {
            minX: -3.235,
            minY: -33.159,
            minZ: -3.052,
            maxX: 3.103,
            maxY: 35.51,
            maxZ: 3.298,
        },
        50,
        50,
    );
    expect(placement.x).toBeCloseTo(46.831);
    expect(placement.y).toBeCloseTo(15.6655);
    expect(placement.wMm).toBeCloseTo(6.338);
    expect(placement.hMm).toBeCloseTo(68.669);
});

test.each([
    [0, 90, [0, 0, 1]],
    [90, 0, [1, 0, 0]],
    [-90, 0, [-1, 0, 0]],
    [180, 0, [0, -1, 0]],
    [0, -90, [0, 0, -1]],
])(
    'converts setup azimuth/elevation %s, %s into a machine-up direction',
    (azimuth, elevation, expected) => {
        const up = setupAnglesToMachineUp(
            azimuth as number,
            elevation as number,
        );
        up.forEach((component, index) =>
            expect(component).toBeCloseTo((expected as number[])[index], 8),
        );
        const angles = machineUpToSetupAngles(up);
        expect(angles.elevationDeg).toBe(Math.round(elevation as number));
    },
);

test('maps retained STL coordinates through canvas move, resize, and rotation', () => {
    const mesh = transformStoredSurfaceMesh({
        x: 10,
        y: 20,
        w: 4,
        h: 2,
        rotation: 90,
        surfaceMesh: {
            sourceName: 'test.stl',
            sourceUnitScaleMm: 1,
            vertices: [0, 0, 0, 2, 0, 1, 2, 1, 1, 0, 0, 0, 2, 1, 1, 0, 1, 0],
            bounds: { minX: 0, minY: 0, minZ: 0, maxX: 2, maxY: 1, maxZ: 1 },
        },
    });
    expect(mesh).not.toBeNull();
    expect(mesh?.bounds.minX).toBeCloseTo(11);
    expect(mesh?.bounds.maxX).toBeCloseTo(13);
    expect(mesh?.bounds.minY).toBeCloseTo(19);
    expect(mesh?.bounds.maxY).toBeCloseTo(23);
    expect(mesh?.bounds.minZ).toBeCloseTo(-2);
    expect(mesh?.bounds.maxZ).toBeCloseTo(0);
});

test('preserves arbitrary machine-up orientation through the canvas transform', () => {
    const source = {
        sourceName: 'oriented.stl',
        sourceUnitScaleMm: 1,
        machineUp: [1, 0, 0] as [number, number, number],
        vertices: [
            0, 0, 0, 1, 0, 0, 0, 2, 0, 0, 0, 0, 0, 2, 0, 0, 0, 1, 0, 0, 0, 0, 0,
            1, 1, 0, 0,
        ],
        bounds: { minX: 0, minY: 0, minZ: 0, maxX: 1, maxY: 2, maxZ: 1 },
    };
    const oriented = orientSurfaceMesh(
        {
            vertices: new Float32Array(source.vertices),
            bounds: source.bounds,
            sourceName: source.sourceName,
        },
        source.machineUp,
    );
    const bitmap = {
        x: 4,
        y: 8,
        w: oriented.bounds.maxX - oriented.bounds.minX,
        h: oriented.bounds.maxY - oriented.bounds.minY,
        surfaceMesh: source,
    };
    const transformed = transformStoredSurfaceMesh(bitmap);
    expect(transformed?.bounds.maxZ).toBeCloseTo(0);
    expect(transformed?.bounds.minZ).toBeLessThan(0);
    expect(transformed?.bounds.maxX).toBeGreaterThan(bitmap.x);
    expect(transformed?.bounds.maxY).toBeGreaterThan(bitmap.y);
});
