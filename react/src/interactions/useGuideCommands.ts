/**
 * Purpose: React hook that owns the GuideCommands workflow.
 */
import type { Dispatch, SetStateAction } from 'react';
import { createDocumentId } from '../lib/ids';
import type { Guide } from '../lib/guides';

interface UseGuideCommandsOptions {
    formatLength(value: number): string;
    pushHistory(): void;
    setGuides: Dispatch<SetStateAction<Guide[]>>;
    setGuidePlacement: Dispatch<SetStateAction<'x' | 'y' | null>>;
    setStatus: Dispatch<SetStateAction<string>>;
}

/** Canvas guide placement and deletion commands. */
export function useGuideCommands(options: UseGuideCommandsOptions) {
    const startGuidePlacement = (axis: 'x' | 'y') => {
        options.setGuidePlacement(axis);
        options.setStatus(
            `Click the canvas to place a ${axis === 'x' ? 'vertical' : 'horizontal'} guide. Press Esc to cancel.`,
        );
    };

    const placeGuide = (axis: 'x' | 'y', position: number) => {
        options.pushHistory();
        const pos = Math.round(position * 10) / 10;
        options.setGuides((current) => [
            ...current,
            { id: createDocumentId('guide'), axis, pos },
        ]);
        options.setGuidePlacement(null);
        options.setStatus(
            `Guide added at ${axis}=${options.formatLength(pos)}.`,
        );
    };

    const handleDeleteGuide = (id: string) => {
        options.pushHistory();
        options.setGuides((current) =>
            current.filter((guide) => guide.id !== id),
        );
        options.setStatus('Guide deleted.');
    };

    return { startGuidePlacement, placeGuide, handleDeleteGuide };
}
