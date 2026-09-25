export interface ProjectSnapshot {
    loops: { id?: string; points: { x: number; y: number }[]; groupId?: string }[];
    selected: string[];
    hidden: string[];
    stack: StackEntryLike[];
    bitmaps: BitmapLike[];
    guides: GuideLike[];
    fileName: string;
}

export interface StackEntryLike {
    id: string;
    label: string;
    args: unknown;
    preview: { points: { x: number; y: number }[] }[];
    toolpath: Record<string, unknown>;
}

export interface BitmapLike {
    id: string;
    x: number;
    y: number;
    w: number;
    h: number;
    dataUrl: string;
}

export interface GuideLike {
    id: string;
    axis: 'x' | 'y';
    pos: number;
}

export interface ProjectEnvelope {
    kind: string;
    version: 1;
    exportedAt: string;
    fileName: string;
    snapshot: ProjectSnapshot;
}

export const PROJECT_KINDS = ['gcam.project', 'camcanvas.project'];

export function serializeProject(snapshot: ProjectSnapshot): string {
    const envelope: ProjectEnvelope = {
        kind: 'gcam.project',
        version: 1,
        exportedAt: new Date().toISOString(),
        fileName: snapshot.fileName || '',
        snapshot,
    };
    return JSON.stringify(envelope, null, 2);
}

export function deserializeProject(raw: string): ProjectSnapshot {
    let doc: Partial<ProjectEnvelope>;
    try {
        doc = JSON.parse(raw);
    } catch {
        throw new Error('This is not a valid gCAM project file.');
    }
    const snap = doc?.snapshot;
    if (
        !doc ||
        !PROJECT_KINDS.includes(doc.kind ?? '') ||
        doc.version !== 1 ||
        !snap ||
        !Array.isArray(snap.loops) ||
        !Array.isArray(snap.stack)
    ) {
        throw new Error('This is not a valid gCAM project file.');
    }
    return {
        loops: snap.loops,
        selected: Array.isArray(snap.selected) ? snap.selected : [],
        stack: snap.stack,
        hidden: Array.isArray((snap as { hidden?: unknown }).hidden)
            ? (snap as unknown as { hidden: string[] }).hidden
            : [],
        bitmaps: Array.isArray((snap as { bitmaps?: unknown }).bitmaps)
            ? (snap as { bitmaps: BitmapLike[] }).bitmaps
            : [],
        guides: Array.isArray((snap as { guides?: unknown }).guides)
            ? (snap as { guides: GuideLike[] }).guides
            : [],
        fileName: doc.fileName || snap.fileName || '',
    };
}
