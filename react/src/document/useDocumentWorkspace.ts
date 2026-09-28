/**
 * Purpose: React hook that owns the DocumentWorkspace workflow.
 */
import { useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { ViewBounds, ViewLoop } from '../canvas/types';
import { loopBounds } from '../lib/engine';
import { createDocumentId } from '../lib/ids';
import type { Guide } from '../lib/guides';
import type { ToolpathStackEntry } from '../toolpaths/useToolpathStack';
import {
    type BitmapImportChoice,
    type PlacedBitmapRecord,
    useBitmapCommands,
} from './useBitmapCommands';
import { useDocumentPersistence } from './useDocumentPersistence';
import { useDocumentState } from './useDocumentState';
import { useVectorImport } from './useVectorImport';

type PreviewPaths = { x: number; y: number }[][];

interface DocumentWorkspaceOptions {
    setStatus: Dispatch<SetStateAction<string>>;
    setDraftPreview: Dispatch<SetStateAction<PreviewPaths>>;
    setBitmapImportChoice: Dispatch<
        SetStateAction<BitmapImportChoice<ViewLoop> | null>
    >;
}

/** Persistent document model plus bitmap/vector import commands. */
export function useDocumentWorkspace({
    setStatus,
    setDraftPreview,
    setBitmapImportChoice,
}: DocumentWorkspaceOptions) {
    const [bounds, setBounds] = useState<ViewBounds | null>(null);
    const [fileName, setFileName] = useState('');
    const fileRef = useRef<HTMLInputElement>(null);
    const projectRef = useRef<HTMLInputElement>(null);
    const document = useDocumentState<
        ViewLoop,
        ToolpathStackEntry,
        PlacedBitmapRecord,
        Guide
    >({
        clone: (snapshot) => ({
            ...snapshot,
            loops: snapshot.loops.map((loop) => ({
                ...loop,
                points: loop.points.map((point) => ({ ...point })),
            })),
            selected: [...snapshot.selected],
            hidden: [...snapshot.hidden],
            stack: structuredClone(snapshot.stack),
            bitmaps: snapshot.bitmaps.map(({ img, ...bitmap }) => ({
                ...bitmap,
            })),
            guides: snapshot.guides.map((guide) => ({ ...guide })),
        }),
        onRestore: (snapshot) => setBounds(loopBounds(snapshot.loops)),
    });
    const {
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
        push: pushHistory,
        restore,
        undo: undoDocument,
        redo: redoDocument,
        canUndo,
        canRedo,
    } = document;
    const newLoopId = () => createDocumentId('loop');
    const withIds = (
        items: { points: { x: number; y: number }[] }[],
    ): ViewLoop[] => items.map((item) => ({ id: newLoopId(), ...item }));
    const refreshBounds = (next: ViewLoop[]) => setBounds(loopBounds(next));

    useDocumentPersistence({
        loops,
        selected,
        hidden,
        stack,
        bitmaps,
        guides,
        fileName,
        restore,
        setBitmaps,
        setFileName,
        setStatus,
    });

    const bitmapCommands = useBitmapCommands<
        ViewLoop,
        ToolpathStackEntry,
        PlacedBitmapRecord
    >({
        bounds,
        setBitmapImportChoice,
        setLoops,
        setSelected,
        setStack,
        setBitmaps,
        setFileName,
        setStatus,
        setDraftPreview,
        pushHistory,
        newLoopId,
        withIds,
        refreshBounds,
    });
    const { importVector } = useVectorImport<ViewLoop, ToolpathStackEntry>({
        setLoops,
        setSelected,
        setStack,
        setFileName,
        setStatus,
        setBounds,
        pushHistory,
        newLoopId,
    });

    return {
        bounds,
        setBounds,
        fileName,
        setFileName,
        fileRef,
        projectRef,
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
        pushHistory,
        restore,
        undoDocument,
        redoDocument,
        canUndo,
        canRedo,
        newLoopId,
        withIds,
        refreshBounds,
        importVector,
        ...bitmapCommands,
    };
}
