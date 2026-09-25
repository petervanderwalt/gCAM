import {
    deserializeProject,
    serializeProject,
    type ProjectSnapshot,
} from './project';

const SNAP: ProjectSnapshot = {
    loops: [{ points: [{ x: 0, y: 0 }], groupId: 'group-1' }],
    selected: ['a'],
    hidden: [],
    stack: [
        {
            id: 'tp-1',
            label: 'Profile Outside (1 vector)',
            args: { operation: 'profile-outside' },
            preview: [],
            toolpath: {},
        },
    ],
    bitmaps: [],
    guides: [],
    fileName: 'demo',
};

test('project round-trips through the gcam envelope', () => {
    const raw = serializeProject(SNAP);
    expect(raw).toContain('"gcam.project"');
    const back = deserializeProject(raw);
    expect(back).toEqual(SNAP);
});

test('legacy camcanvas envelopes still load', () => {
    const raw = serializeProject(SNAP).replace(
        '"gcam.project"',
        '"camcanvas.project"',
    );
    expect(deserializeProject(raw).fileName).toBe('demo');
});

test('garbage is rejected with a clear error', () => {
    expect(() => deserializeProject('nope')).toThrow(/valid gCAM/);
    expect(() =>
        deserializeProject(JSON.stringify({ kind: 'x', version: 9 })),
    ).toThrow(/valid gCAM/);
});
