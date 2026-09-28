import {
    deserializeProject,
    serializeProject,
    type ProjectSnapshot,
} from '../lib/project';

export function downloadProject(snapshot: ProjectSnapshot): string {
    const raw = serializeProject(snapshot);
    const base = (snapshot.fileName || 'project').replace(/\.[^.]+$/, '');
    const url = URL.createObjectURL(
        new Blob([raw], { type: 'application/json' }),
    );
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${base}.gcam.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    return `${base}.gcam.json`;
}

export async function readProjectFile(file: File): Promise<ProjectSnapshot> {
    return deserializeProject(await file.text());
}
