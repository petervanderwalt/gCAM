import { useRef, useState } from 'react';
import {
    createHistory,
    pushHistory,
    redoHistory,
    undoHistory,
} from '../lib/history';

export interface DocumentSnapshot<TLoop, TStack, TBitmap, TGuide> {
    loops: TLoop[];
    selected: string[];
    hidden: string[];
    stack: TStack[];
    bitmaps: TBitmap[];
    guides: TGuide[];
}

interface DocumentStateOptions<TLoop, TStack, TBitmap, TGuide> {
    clone(
        snapshot: DocumentSnapshot<TLoop, TStack, TBitmap, TGuide>,
    ): DocumentSnapshot<TLoop, TStack, TBitmap, TGuide>;
    historyLimit?: number;
    onRestore?: (
        snapshot: DocumentSnapshot<TLoop, TStack, TBitmap, TGuide>,
    ) => void;
}

/**
 * Owns mutable document entities and undo/redo. UI panels and canvas tools
 * consume this boundary instead of creating competing document state.
 */
export function useDocumentState<TLoop, TStack, TBitmap, TGuide>(
    options: DocumentStateOptions<TLoop, TStack, TBitmap, TGuide>,
) {
    const [loops, setLoops] = useState<TLoop[]>([]);
    const [selected, setSelected] = useState<string[]>([]);
    const [hidden, setHidden] = useState<string[]>([]);
    const [stack, setStack] = useState<TStack[]>([]);
    const [bitmaps, setBitmaps] = useState<TBitmap[]>([]);
    const [guides, setGuides] = useState<TGuide[]>([]);
    const [, setVersion] = useState(0);
    const stateRef = useRef<DocumentSnapshot<TLoop, TStack, TBitmap, TGuide>>({
        loops,
        selected,
        hidden,
        stack,
        bitmaps,
        guides,
    });
    stateRef.current = { loops, selected, hidden, stack, bitmaps, guides };
    const historyRef = useRef(
        createHistory(options.historyLimit ?? 60, options.clone),
    );

    const push = () => {
        pushHistory(historyRef.current, stateRef.current);
        setVersion((value) => value + 1);
    };

    const restore = (
        snapshot: DocumentSnapshot<TLoop, TStack, TBitmap, TGuide>,
    ) => {
        setLoops(snapshot.loops);
        setSelected(snapshot.selected);
        setHidden(snapshot.hidden);
        setStack(snapshot.stack);
        setBitmaps(snapshot.bitmaps);
        setGuides(snapshot.guides);
        options.onRestore?.(snapshot);
    };

    const undo = () => {
        const snapshot = undoHistory(historyRef.current, stateRef.current);
        if (!snapshot) return false;
        restore(snapshot);
        setVersion((value) => value + 1);
        return true;
    };

    const redo = () => {
        const snapshot = redoHistory(historyRef.current, stateRef.current);
        if (!snapshot) return false;
        restore(snapshot);
        setVersion((value) => value + 1);
        return true;
    };

    return {
        loops,
        setLoops,
        selected,
        setSelected,
        hidden,
        setHidden,
        stack,
        setStack,
        bitmaps,
        setBitmaps,
        guides,
        setGuides,
        push,
        restore,
        undo,
        redo,
        canUndo: historyRef.current.undo.length > 0,
        canRedo: historyRef.current.redo.length > 0,
    };
}
