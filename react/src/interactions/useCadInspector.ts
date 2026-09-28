/**
 * Purpose: React hook that owns the CadInspector workflow.
 */
import { useEffect, useState } from 'react';
import type {
    ComponentProps,
    Dispatch,
    MutableRefObject,
    SetStateAction,
} from 'react';
import type { ViewLoop } from '../canvas/types';
import { CadInspector } from '../components/CadInspector';
import type { InspectorPatch } from '../components/CadInspector';
import type { PlacedBitmapRecord } from '../document/useBitmapCommands';
import type { ToolpathStackEntry } from '../toolpaths/useToolpathStack';
import type { TransformMode } from '../lib/transform';
import type { UnitSystem } from '../lib/units';

interface CadInspectorOptions {
    selected: string[];
    selectedLoops: () => ViewLoop[];
    transformMode: TransformMode | null;
    orientRef: MutableRefObject<{ key: string; angle: number }>;
    newLoopId: () => string;
    pushHistory: () => void;
    refreshBounds: (loops: ViewLoop[]) => void;
    setLoops: Dispatch<SetStateAction<ViewLoop[]>>;
    setSelected: Dispatch<SetStateAction<string[]>>;
    setStack: Dispatch<SetStateAction<ToolpathStackEntry[]>>;
    setDraftPreview: Dispatch<SetStateAction<{ x: number; y: number }[][]>>;
    setStatus: Dispatch<SetStateAction<string>>;
    // Retain the bitmap type in the module boundary: inspector commands share
    // the document contract with transform/corner commands.
    _bitmapContract?: PlacedBitmapRecord;
}

/** Coordinates selection-driven CAD inspector visibility and live previews. */
export function useCadInspector({
    selected,
    selectedLoops,
    transformMode,
    orientRef,
    newLoopId,
    pushHistory,
    refreshBounds,
    setLoops,
    setSelected,
    setStack,
    setDraftPreview,
    setStatus,
}: CadInspectorOptions) {
    const [dismissedId, setDismissedId] = useState<string | null>(null);
    const [preview, setPreview] = useState<{
        id: string;
        points: { x: number; y: number }[];
    } | null>(null);
    const inspectorLoop =
        selected.length === 1 ? (selectedLoops()[0] ?? null) : null;
    const visible =
        inspectorLoop !== null &&
        Array.isArray(inspectorLoop.points) &&
        inspectorLoop.points.length > 0 &&
        !inspectorLoop.bitmapId &&
        inspectorLoop.id !== dismissedId &&
        transformMode === null;
    const { buildInspectorPreview, handleInspectorApply } =
        useInspectorCommands({
            inspectorLoop,
            orientRef,
            newLoopId,
            pushHistory,
            refreshBounds,
            setLoops,
            setSelected,
            setStack,
            setDraftPreview,
            setInspectorPreview: setPreview,
            setStatus,
        });
    useEffect(() => setDismissedId(null), [selected]);

    const inspector: ComponentProps<typeof CadInspector> | null =
        visible && inspectorLoop
            ? {
                  loop: inspectorLoop,
                  angle: Math.round(orientRef.current.angle * 10) / 10,
                  onApply: handleInspectorApply,
                  onPreview: (patch: InspectorPatch | null) =>
                      setPreview(patch ? buildInspectorPreview(patch) : null),
                  units: 'mm' as UnitSystem,
                  onClose: () => {
                      setPreview(null);
                      setDismissedId(inspectorLoop.id);
                  },
              }
            : null;

    return {
        inspectorPreview: preview,
        inspector: (units: ComponentProps<typeof CadInspector>['units']) =>
            inspector ? { ...inspector, units } : null,
        dismiss: () => setDismissedId(null),
    };
}

import { useInspectorCommands } from './useInspectorCommands';
