import { useEffect } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { TransformMode } from '../lib/transform';

interface EditorLifecycleOptions {
    textAnchor: { x: number; y: number } | null;
    clearTextAnchor: () => void;
    loops: unknown[];
    selected: string[];
    moveAfterCloneRef: MutableRefObject<boolean>;
    setTransformMode: Dispatch<SetStateAction<TransformMode | null>>;
}

/** Keeps short-lived direct-manipulation and text-entry state in sync. */
export function useEditorLifecycle({
    textAnchor,
    clearTextAnchor,
    loops,
    selected,
    moveAfterCloneRef,
    setTransformMode,
}: EditorLifecycleOptions) {
    useEffect(() => {
        if (!textAnchor) return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') clearTextAnchor();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [textAnchor, clearTextAnchor]);

    useEffect(() => {
        if (moveAfterCloneRef.current) {
            moveAfterCloneRef.current = false;
            setTransformMode('move');
            return;
        }
        setTransformMode(null);
    }, [loops, moveAfterCloneRef, setTransformMode]);

    useEffect(() => {
        if (selected.length === 0) setTransformMode(null);
    }, [selected, setTransformMode]);
}
