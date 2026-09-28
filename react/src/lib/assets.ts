/**
 * Purpose: Implementation module for assets in the react domain.
 */
const DB_NAME = 'gcam';
const DB_VERSION = 2;
const STORE_NAME = 'bitmap-assets';
export const PROJECT_STORE_NAME = 'projects';

export interface StoredBitmapAsset {
    id: string;
    blob: Blob;
    createdAt: number;
}

export function openGcamDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
            if (!request.result.objectStoreNames.contains(STORE_NAME)) {
                request.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
            }
            if (!request.result.objectStoreNames.contains(PROJECT_STORE_NAME)) {
                request.result.createObjectStore(PROJECT_STORE_NAME, {
                    keyPath: 'id',
                });
            }
        };
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
    });
}

/**
 * Browser-local bitmap persistence.  Project exports remain portable; this
 * cache lets autosave/history reference a stable asset ID instead of copying
 * decoded image data through application state.
 */
export class BitmapAssetStore {
    async put(id: string, blob: Blob): Promise<void> {
        const db = await openGcamDatabase();
        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            tx.objectStore(STORE_NAME).put({ id, blob, createdAt: Date.now() });
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(tx.error);
        });
        db.close();
    }

    async get(id: string): Promise<Blob | null> {
        const db = await openGcamDatabase();
        const asset = await new Promise<StoredBitmapAsset | undefined>(
            (resolve, reject) => {
                const tx = db.transaction(STORE_NAME, 'readonly');
                const request = tx.objectStore(STORE_NAME).get(id);
                request.onsuccess = () =>
                    resolve(request.result as StoredBitmapAsset | undefined);
                request.onerror = () => reject(request.error);
            },
        );
        db.close();
        return asset?.blob ?? null;
    }

    async remove(id: string): Promise<void> {
        const db = await openGcamDatabase();
        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            tx.objectStore(STORE_NAME).delete(id);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
        db.close();
    }
}
