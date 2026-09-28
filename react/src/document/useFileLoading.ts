import type { Dispatch, SetStateAction } from 'react';

interface UseFileLoadingOptions {
    isBitmapFile(file: File): boolean;
    loadBitmap(file: File): Promise<void>;
    importVector(file: File): Promise<void>;
    setStatus: Dispatch<SetStateAction<string>>;
    setLoadingSample: Dispatch<SetStateAction<boolean>>;
}

/** Routes local source files and the bundled sample through import features. */
export function useFileLoading(options: UseFileLoadingOptions) {
    const handleFiles = async (files: FileList | File[] | null) => {
        const file = files?.[0];
        if (!file) return;
        if (options.isBitmapFile(file)) {
            await options.loadBitmap(file);
            return;
        }
        await options.importVector(file);
    };

    const handleLoadSample = async () => {
        options.setLoadingSample(true);
        options.setStatus('Loading sample vector…');
        try {
            const response = await fetch('samples/Hockey Sticks Cut 1.dxf');
            if (!response.ok) throw new Error('Sample not found.');
            const text = await response.text();
            await handleFiles([
                new File([text], 'Hockey Sticks Cut 1.dxf', {
                    type: 'application/dxf',
                }),
            ]);
        } catch (error) {
            options.setStatus(
                error instanceof Error
                    ? error.message
                    : 'Could not load sample.',
            );
        } finally {
            options.setLoadingSample(false);
        }
    };

    return { handleFiles, handleLoadSample };
}
