import type { Dispatch, SetStateAction } from 'react';
import { isBitmapFile, loadBitmapFile, placeBitmap } from '../lib/bitmap';
import { BitmapAssetStore } from '../lib/assets';
import { createDocumentId } from '../lib/ids';

interface Point {
    x: number;
    y: number;
}

interface BitmapLoop {
    id: string;
    points: Point[];
    bitmapId?: string;
}

export interface PlacedBitmapRecord {
    id: string;
    x: number;
    y: number;
    w: number;
    h: number;
    rotation?: number;
    dataUrl: string;
    assetId?: string;
    img?: HTMLImageElement;
}

export interface BitmapImportChoice<TLoop extends BitmapLoop> {
    entry: PlacedBitmapRecord;
    rect: TLoop;
    fileName: string;
}

interface UseBitmapCommandsOptions<
    TLoop extends BitmapLoop,
    TStack,
    TBitmap extends PlacedBitmapRecord,
> {
    bounds: { minX: number; minY: number; maxX: number; maxY: number } | null;
    setBitmapImportChoice: Dispatch<
        SetStateAction<BitmapImportChoice<TLoop> | null>
    >;
    setLoops: Dispatch<SetStateAction<TLoop[]>>;
    setSelected: Dispatch<SetStateAction<string[]>>;
    setStack: Dispatch<SetStateAction<TStack[]>>;
    setBitmaps: Dispatch<SetStateAction<TBitmap[]>>;
    setFileName: Dispatch<SetStateAction<string>>;
    setStatus: Dispatch<SetStateAction<string>>;
    setDraftPreview: Dispatch<SetStateAction<Point[][]>>;
    pushHistory(): void;
    newLoopId(): string;
    withIds(items: { points: Point[] }[]): TLoop[];
    refreshBounds(loops: TLoop[]): void;
}

/** Bitmap placement and trace replacement commands, independent of App chrome. */
export function useBitmapCommands<
    TLoop extends BitmapLoop,
    TStack,
    TBitmap extends PlacedBitmapRecord,
>(options: UseBitmapCommandsOptions<TLoop, TStack, TBitmap>) {
    const handleBitmapFile = async (file: File) => {
        try {
            const { dataUrl, pixelW, pixelH } = await loadBitmapFile(file);
            const cx = options.bounds
                ? (options.bounds.minX + options.bounds.maxX) / 2
                : 50;
            const cy = options.bounds
                ? (options.bounds.minY + options.bounds.maxY) / 2
                : 50;
            const placed = placeBitmap(pixelW, pixelH, cx, cy);
            const img = new Image();
            await new Promise<void>((resolve, reject) => {
                img.onload = () => resolve();
                img.onerror = () =>
                    reject(new Error('Could not decode image.'));
                img.src = dataUrl;
            });
            const assetId = createDocumentId('asset');
            const entry: PlacedBitmapRecord = {
                id: createDocumentId('bitmap'),
                x: placed.x,
                y: placed.y,
                w: placed.wMm,
                h: placed.hMm,
                dataUrl,
                assetId,
                img,
            };
            void new BitmapAssetStore().put(assetId, file).catch(() => {
                // Export data remains portable when IndexedDB is unavailable.
            });
            const rect = {
                id: options.newLoopId(),
                bitmapId: entry.id,
                points: [
                    { x: placed.x, y: placed.y },
                    { x: placed.x + placed.wMm, y: placed.y },
                    { x: placed.x + placed.wMm, y: placed.y + placed.hMm },
                    { x: placed.x, y: placed.y + placed.hMm },
                    { x: placed.x, y: placed.y },
                ],
            } as TLoop;
            options.setBitmapImportChoice({ entry, rect, fileName: file.name });
        } catch (error) {
            options.setStatus(
                error instanceof Error ? error.message : 'Bitmap load failed',
            );
        }
    };

    const commitBitmapPlacement = (choice: BitmapImportChoice<TLoop>) => {
        options.pushHistory();
        options.setBitmaps((current) => [...current, choice.entry as TBitmap]);
        options.setLoops((current) => {
            const next = [...current, choice.rect];
            options.setSelected([choice.rect.id]);
            options.setStack([]);
            options.refreshBounds(next);
            return next;
        });
        options.setFileName(choice.fileName);
        options.setStatus(
            `Bitmap ${choice.fileName} placed — choose a raster, wavy, halftone, or heightmap toolpath.`,
        );
    };

    const commitTraced = (
        traced: { points: Point[] }[],
        replaceBitmapId?: string,
    ) => {
        if (!traced.length) {
            options.setStatus('Trace found no shapes — try a darker image.');
            return;
        }
        options.pushHistory();
        const stamped = options.withIds(traced);
        options.setLoops((current) => {
            const retained = replaceBitmapId
                ? current.filter((loop) => loop.bitmapId !== replaceBitmapId)
                : current;
            const next = [...retained, ...stamped];
            options.setSelected(stamped.map((loop) => loop.id));
            options.setStack([]);
            options.setDraftPreview([]);
            options.refreshBounds(next);
            return next;
        });
        if (replaceBitmapId) {
            options.setBitmaps((current) =>
                current.filter((bitmap) => bitmap.id !== replaceBitmapId),
            );
        }
        options.setStatus(`Traced ${traced.length} vectors — bitmap replaced.`);
    };

    return {
        handleBitmapFile,
        commitBitmapPlacement,
        commitTraced,
        isBitmapFile,
    };
}
