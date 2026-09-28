import { useState } from 'react';

type PreviewPaths = { x: number; y: number }[][];

/** Transient geometry generated while a command or toolpath is being edited. */
export function usePreviewState() {
    const [draftPreview, setDraftPreview] = useState<PreviewPaths>([]);
    const [offsetPreview, setOffsetPreview] = useState<PreviewPaths>([]);
    const [booleanPreview, setBooleanPreview] = useState<PreviewPaths>([]);
    const [draftProgress, setDraftProgress] = useState<{
        percent: number;
        label: string;
    } | null>(null);

    return {
        draftPreview,
        setDraftPreview,
        offsetPreview,
        setOffsetPreview,
        booleanPreview,
        setBooleanPreview,
        draftProgress,
        setDraftProgress,
    };
}
