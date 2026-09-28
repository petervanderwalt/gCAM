import type { Dispatch, SetStateAction } from 'react';
import { importVectorFile } from '../lib/import';

interface ImportLoop {
    id: string;
    points: { x: number; y: number }[];
}

interface UseVectorImportOptions<TLoop extends ImportLoop, TStack> {
    setLoops: Dispatch<SetStateAction<TLoop[]>>;
    setSelected: Dispatch<SetStateAction<string[]>>;
    setStack: Dispatch<SetStateAction<TStack[]>>;
    setFileName: Dispatch<SetStateAction<string>>;
    setStatus: Dispatch<SetStateAction<string>>;
    setBounds: Dispatch<
        SetStateAction<{
            minX: number;
            minY: number;
            maxX: number;
            maxY: number;
        } | null>
    >;
    pushHistory(): void;
    newLoopId(): string;
}

/** Vector file import command; bitmap routing intentionally remains at the shell. */
export function useVectorImport<TLoop extends ImportLoop, TStack>(
    options: UseVectorImportOptions<TLoop, TStack>,
) {
    const importVector = async (file: File) => {
        try {
            const result = await importVectorFile(file);
            options.pushHistory();
            const loops = result.loops.map(
                (loop) =>
                    ({ ...loop, id: loop.id ?? options.newLoopId() }) as TLoop,
            );
            options.setLoops(loops);
            options.setBounds(result.bounds);
            options.setSelected([]);
            options.setStack([]);
            options.setFileName(result.fileName);
            options.setStatus(
                `${result.fileName}: ${result.entityCount} entities → ${result.loops.length} vectors`,
            );
        } catch (error) {
            options.setStatus(
                error instanceof Error ? error.message : 'Import failed',
            );
        }
    };

    return { importVector };
}
