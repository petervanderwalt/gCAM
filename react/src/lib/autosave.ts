import { openGcamDatabase, PROJECT_STORE_NAME } from './assets';
import {
    deserializeProject,
    serializeProject,
    type ProjectSnapshot,
} from './project';

const AUTOSAVE_ID = 'active-project';

interface AutosaveRecord {
    id: typeof AUTOSAVE_ID;
    raw: string;
    savedAt: number;
}

export class ProjectAutosaveStore {
    async save(snapshot: ProjectSnapshot): Promise<void> {
        const db = await openGcamDatabase();
        const record: AutosaveRecord = {
            id: AUTOSAVE_ID,
            raw: serializeProject(snapshot),
            savedAt: Date.now(),
        };
        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction(PROJECT_STORE_NAME, 'readwrite');
            tx.objectStore(PROJECT_STORE_NAME).put(record);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
        db.close();
    }

    async load(): Promise<{
        snapshot: ProjectSnapshot;
        savedAt: number;
    } | null> {
        const db = await openGcamDatabase();
        const record = await new Promise<AutosaveRecord | undefined>(
            (resolve, reject) => {
                const tx = db.transaction(PROJECT_STORE_NAME, 'readonly');
                const request = tx
                    .objectStore(PROJECT_STORE_NAME)
                    .get(AUTOSAVE_ID);
                request.onsuccess = () =>
                    resolve(request.result as AutosaveRecord | undefined);
                request.onerror = () => reject(request.error);
            },
        );
        db.close();
        if (!record) return null;
        return {
            snapshot: deserializeProject(record.raw),
            savedAt: record.savedAt,
        };
    }

    async clear(): Promise<void> {
        const db = await openGcamDatabase();
        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction(PROJECT_STORE_NAME, 'readwrite');
            tx.objectStore(PROJECT_STORE_NAME).delete(AUTOSAVE_ID);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
        db.close();
    }
}
