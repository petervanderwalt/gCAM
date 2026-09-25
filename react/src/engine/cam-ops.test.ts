import { parseDxf } from './dxf.js';
import { buildLoops, boundsOfPoints, polygonArea } from './paths.js';
import { createToolpathFromLoops } from './cam-ops.js';
import { applyBoolean, offsetLoops } from '../lib/engine';

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

function squareLoops() {
    return buildLoops(parseDxf(SQUARE_DXF));
}

const BASE_CONFIG = {
    toolDiameter: 6,
    toolRadius: 3,
    cutterAngle: 90,
    overlapPercent: 40,
    cutDepth: 3,
    passDepth: 3,
    trochoidEnabled: false,
    trochoidRadius: 0,
    trochoidEngagementPercent: 10,
    tabWidth: 9,
    tabHeight: 0,
    safeZ: 5,
    feedRate: 1800,
    plungeRate: 600,
    spindle: 18000,
    toolNumber: 1,
};

test('profile-outside offsets a 20mm square by the 3mm tool radius', () => {
    const toolpath = createToolpathFromLoops(squareLoops(), {
        ...BASE_CONFIG,
        operation: 'profile-outside',
    });
    expect(toolpath.previewContours.length).toBeGreaterThanOrEqual(1);
    const bounds = boundsOfPoints(toolpath.previewContours[0]);
    expect(bounds.minX).toBeCloseTo(-3, 0);
    expect(bounds.minY).toBeCloseTo(-3, 0);
    expect(bounds.maxX).toBeCloseTo(23, 0);
    expect(bounds.maxY).toBeCloseTo(23, 0);
    expect(toolpath.passDepths).toEqual([-3]);
});

test('profile-inside insets the square by the tool radius', () => {
    const toolpath = createToolpathFromLoops(squareLoops(), {
        ...BASE_CONFIG,
        operation: 'profile-inside',
    });
    const bounds = boundsOfPoints(toolpath.previewContours[0]);
    expect(bounds.minX).toBeCloseTo(3, 0);
    expect(bounds.maxX).toBeCloseTo(17, 0);
});

test('pocket fills the square with multiple step-over passes', () => {
    const toolpath = createToolpathFromLoops(squareLoops(), {
        ...BASE_CONFIG,
        operation: 'pocket',
    });
    // 6mm tool at 40% overlap → 3.6mm step-over: 14mm ring, then 6.8mm ring
    expect(toolpath.previewContours.length).toBeGreaterThanOrEqual(2);
});
test('chamfer reports top width from angle and depth', () => {
    const tp = createToolpathFromLoops([{ points: squareLoops()[0].points }], {
        operation: 'chamfer',
        toolDiameter: 6,
        toolRadius: 3,
        cutterAngle: 90,
        overlapPercent: 40,
        cutDepth: 3,
        passDepth: 3,
        trochoidEnabled: false,
        trochoidRadius: 0,
        trochoidEngagementPercent: 10,
        tabWidth: 9,
        tabHeight: 0,
        safeZ: 5,
        feedRate: 1800,
        plungeRate: 600,
        spindle: 18000,
        toolNumber: 1,
    });
    expect(tp.previewContours.length).toBeGreaterThanOrEqual(1);
    expect(tp.cardMeta).toContain('6mm top width');
});
test('laser-cut emits M4 spindle and S power moves', async () => {
    const { buildToolpathGcode } = await import('../lib/engine');
    const r = await buildToolpathGcode({
        loops: [{ points: squareLoops()[0].points }],
        operation: 'laser-cut',
        toolDiameter: 6,
        cutDepth: 1,
        laserFeed: 2500,
        laserPower: 800,
        fileName: 'laser',
    });
    expect(r.gcode).toContain('M4 S0');
    expect(r.gcode).toContain('S800');
    expect(r.gcode).not.toContain('M3 S');
});
test('tabs lift the cutter to tab height over the tab zone', async () => {
    const { buildToolpathGcode } = await import('../lib/engine');
    const loops = [{ points: squareLoops()[0].points }];
    const plain = await buildToolpathGcode({
        loops,
        operation: 'profile-outside',
        toolDiameter: 6,
        cutDepth: 3,
    });
    expect(plain.gcode).not.toContain('Z-1.5');
    const tabbed = await buildToolpathGcode({
        loops,
        operation: 'profile-outside',
        toolDiameter: 6,
        cutDepth: 3,
        tabs: [{ contourIndex: 0, along: 10 }],
    });
    expect(tabbed.gcode).toContain('Z-1.5');
});
test('trochoid emits arc moves around the profile', async () => {
    const { buildToolpathGcode } = await import('../lib/engine');
    const loops = [{ points: squareLoops()[0].points }];
    const plain = await buildToolpathGcode({
        loops,
        operation: 'profile-outside',
        toolDiameter: 6,
        cutDepth: 3,
    });
    expect(plain.gcode).not.toContain('G3');
    const troch = await buildToolpathGcode({
        loops,
        operation: 'profile-outside',
        toolDiameter: 6,
        cutDepth: 3,
        trochoidEnabled: true,
        trochoidEngagementPercent: 10,
    });
    expect(troch.gcode).toContain('G3');
});
test('boolean union merges overlapping squares minus the overlap', () => {
    const a: { x: number; y: number }[] = squareLoops()[0].points;
    const b = a.map((p) => ({ x: p.x + 10, y: p.y + 10 }));
    const [merged] = applyBoolean([{ points: a }, { points: b }], 'union');
    expect(Math.abs(polygonArea(merged.points))).toBeCloseTo(700, 0);
});
test('boolean difference cuts the overlap out', () => {
    const a: { x: number; y: number }[] = squareLoops()[0].points;
    const b = a.map((p) => ({ x: p.x + 10, y: p.y + 10 }));
    const [cut] = applyBoolean([{ points: a }, { points: b }], 'difference');
    expect(Math.abs(polygonArea(cut.points))).toBeCloseTo(300, 0);
});
test('offset expands and shrinks the square', () => {
    const loops = [{ points: squareLoops()[0].points }];
    const big = boundsOfPoints(offsetLoops(loops, 3)[0].points);
    expect(big.minX).toBeCloseTo(-3, 0);
    expect(big.maxX).toBeCloseTo(23, 0);
    const small = boundsOfPoints(offsetLoops(loops, -3)[0].points);
    expect(small.minX).toBeCloseTo(3, 0);
    expect(small.maxX).toBeCloseTo(17, 0);
});
test('custom feeds and safe height flow into the gcode', async () => {
    const { buildToolpathGcode } = await import('../lib/engine');
    const g = (
        await buildToolpathGcode({
            loops: [{ points: squareLoops()[0].points }],
            operation: 'profile-outside',
            toolDiameter: 6,
            cutDepth: 3,
            feedRate: 999,
            spindle: 12000,
            safeZ: 8,
        })
    ).gcode;
    expect(g).toContain('G0 Z8');
    expect(g).toContain('F999');
    expect(g).toContain('M3 S12000');
});
test('pass depth below final depth emits multiple Z passes', async () => {
    const { buildToolpathGcode } = await import('../lib/engine');
    const args: {
        loops: { points: { x: number; y: number }[] }[];
        operation: 'profile-outside';
        toolDiameter: 6;
        cutDepth: 6;
    } = {
        loops: [{ points: squareLoops()[0].points }],
        operation: 'profile-outside',
        toolDiameter: 6,
        cutDepth: 6,
    };
    const single = (await buildToolpathGcode({ ...args, passDepth: 6 })).gcode;
    const multi = (await buildToolpathGcode({ ...args, passDepth: 2 })).gcode;
    expect(single).toContain('Z-6');
    expect(single).not.toContain('Z-2');
    expect(multi).toContain('Z-2');
    expect(multi).toContain('Z-4');
    expect(multi).toContain('Z-6');
});
test('laser-raster without pixels rejects with guidance', async () => {
    const { buildToolpathGcode } = await import('../lib/engine');
    await expect(
        buildToolpathGcode({
            loops: [{ points: squareLoops()[0].points }],
            operation: 'laser-raster',
            toolDiameter: 6,
            cutDepth: 1,
        }),
    ).rejects.toThrow(/bitmap/);
});
test('laser-raster samples synthetic pixels into S moves', async () => {
    const { buildToolpathGcode } = await import('../lib/engine');
    const w = 4;
    const h = 4;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i += 1) {
        const dark = i % 2 === 0;
        data[i * 4] = dark ? 0 : 255;
        data[i * 4 + 1] = dark ? 0 : 255;
        data[i * 4 + 2] = dark ? 0 : 255;
        data[i * 4 + 3] = 255;
    }
    const r = await buildToolpathGcode({
        loops: [{ points: squareLoops()[0].points }],
        operation: 'laser-raster',
        toolDiameter: 6,
        cutDepth: 1,
        laserSpot: 5,
        laserSMax: 800,
        bitmap: {
            imageData: { width: w, height: h, data },
            bounds: { minX: 0, minY: 0, maxX: 20, maxY: 20 },
        },
    });
    expect(r.gcode).toContain('M4 S0');
    expect(r.gcode).toContain('S800');
    expect(r.gcode).toContain('S0');
});
test('laser-raster overscan extends each scan beyond bitmap bounds', async () => {
    const { buildToolpathGcode } = await import('../lib/engine');
    const r = await buildToolpathGcode({
        loops: [{ points: squareLoops()[0].points }],
        operation: 'laser-raster',
        toolDiameter: 6,
        cutDepth: 1,
        laserSpot: 5,
        laserOverscan: 2,
        bitmap: {
            imageData: { width: 2, height: 2, data: new Uint8ClampedArray(16) },
            bounds: { minX: 0, minY: 0, maxX: 10, maxY: 10 },
        },
    });
    expect(r.gcode).toContain('G0 X-2 Y');
});

test('wavy maps dark pixels to deep Z cuts', async () => {
    const { buildToolpathGcode } = await import('../lib/engine');
    const w = 4;
    const h = 2;
    const data = new Uint8ClampedArray(w * h * 4);
    data.fill(255);
    data[0] = 0;
    data[1] = 0;
    data[2] = 0;
    const r = await buildToolpathGcode({
        loops: [{ points: squareLoops()[0].points }],
        operation: 'wavy-raster',
        toolDiameter: 6,
        cutDepth: 1,
        wavySpot: 5,
        wavyMinDepth: 0,
        wavyMaxDepth: 3,
        bitmap: {
            imageData: { width: w, height: h, data },
            bounds: { minX: 0, minY: 0, maxX: 20, maxY: 20 },
        },
    });
    expect(r.gcode).toContain('M3');
    expect(r.gcode).toMatch(/Z-3/);
});
test('halftone drills dark pixels deeper with a v-bit', async () => {
    const { buildToolpathGcode } = await import('../lib/engine');
    const w = 4;
    const h = 4;
    const data = new Uint8ClampedArray(w * h * 4);
    data.fill(255);
    data[0] = 0;
    data[1] = 0;
    data[2] = 0;
    const r = await buildToolpathGcode({
        loops: [{ points: squareLoops()[0].points }],
        operation: 'halftone',
        toolDiameter: 6,
        cutDepth: 1,
        cutterAngle: 90,
        halftoneResolution: 4,
        bitmap: {
            imageData: { width: w, height: h, data },
            bounds: { minX: 0, minY: 0, maxX: 20, maxY: 20 },
        },
    });
    expect(r.gcode).toContain('G1 Z');
    expect(r.gcode.trim().endsWith('M30')).toBe(true);
});
test('arcs toggle switches circle output between G2 and G1', async () => {
    const { buildToolpathGcode } = await import('../lib/engine');
    const circle: { x: number; y: number }[] = [];
    for (let i = 0; i <= 64; i += 1) {
        const a = (i / 64) * Math.PI * 2;
        circle.push({ x: 10 + Math.cos(a) * 10, y: 10 + Math.sin(a) * 10 });
    }
    const base: {
        loops: { points: { x: number; y: number }[] }[];
        operation: 'engrave';
        toolDiameter: number;
        cutDepth: number;
    } = {
        loops: [{ points: circle }],
        operation: 'engrave',
        toolDiameter: 6,
        cutDepth: 1,
    };
    const withArcs = (await buildToolpathGcode({ ...base })).gcode;
    expect(withArcs).toMatch(/G2 X/);
    const linear = (await buildToolpathGcode({ ...base, arcs: false })).gcode;
    expect(linear).not.toMatch(/G2 X|G3 X/);
    expect(linear).toContain('G1');
});
