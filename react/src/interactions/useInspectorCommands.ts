/**
 * Purpose: React hook that owns the InspectorCommands workflow.
 */
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { ViewLoop } from '../canvas/types';
import type { InspectorPatch } from '../components/CadInspector';
import { outlineTextLoops, textLoops } from '../draw/textGeometry';
import { inspectorGeometry } from './inspectorGeometry';

type InspectorInput = InspectorPatch & {
    text?: string;
    fontId?: string;
    fontSize?: number;
};

interface UseInspectorCommandsOptions<TStack> {
    inspectorLoop: ViewLoop | null;
    orientRef: MutableRefObject<{ key: string; angle: number }>;
    newLoopId(): string;
    pushHistory(): void;
    refreshBounds(loops: ViewLoop[]): void;
    setLoops: Dispatch<SetStateAction<ViewLoop[]>>;
    setSelected: Dispatch<SetStateAction<string[]>>;
    setStack: Dispatch<SetStateAction<TStack[]>>;
    setDraftPreview: Dispatch<SetStateAction<{ x: number; y: number }[][]>>;
    setInspectorPreview: Dispatch<
        SetStateAction<{
            id: string;
            points: { x: number; y: number }[];
        } | null>
    >;
    setStatus: Dispatch<SetStateAction<string>>;
}

/** Applies inspector geometry and text edits without coupling them to app chrome. */
export function useInspectorCommands<TStack>({
    inspectorLoop,
    orientRef,
    newLoopId,
    pushHistory,
    refreshBounds,
    setLoops,
    setSelected,
    setStack,
    setDraftPreview,
    setInspectorPreview,
    setStatus,
}: UseInspectorCommandsOptions<TStack>) {
    const buildInspectorPreview = (patch: InspectorPatch) => {
        if (!inspectorLoop) return null;
        const geometry = inspectorGeometry(
            inspectorLoop,
            patch,
            orientRef.current.angle,
        );
        return geometry
            ? { id: inspectorLoop.id, points: geometry.points }
            : null;
    };

    const handleInspectorApply = async (patch: InspectorInput) => {
        if (!inspectorLoop) return;
        setInspectorPreview(null);
        const geometry = inspectorGeometry(
            inspectorLoop,
            patch,
            orientRef.current.angle,
        );
        if (!geometry) {
            setStatus('Width and height must be positive.');
            return;
        }
        if (
            inspectorLoop.sourceType === 'text' &&
            patch.text &&
            patch.fontId &&
            patch.fontSize
        ) {
            try {
                const origin = { x: patch.x, y: patch.y };
                const replacement =
                    patch.fontId === 'single-line'
                        ? textLoops(patch.text, origin, patch.fontSize)
                        : await outlineTextLoops(
                              patch.text,
                              origin,
                              patch.fontSize,
                              patch.fontId,
                          );
                if (!replacement.length) return;
                pushHistory();
                const id = inspectorLoop.id;
                setLoops((prev) => {
                    const replacementLoops = replacement.map((item, index) => ({
                        ...item,
                        id: index === 0 ? id : newLoopId(),
                        sourceType: 'text',
                        text: patch.text,
                        fontId: patch.fontId,
                        fontSize: patch.fontSize,
                    }));
                    const next = [
                        ...prev.filter((loop) => loop.id !== id),
                        ...replacementLoops,
                    ];
                    setSelected(replacementLoops.map((loop) => loop.id));
                    setStack([]);
                    refreshBounds(next);
                    return next;
                });
                setStatus('Text updated.');
                return;
            } catch (error) {
                setStatus(
                    error instanceof Error
                        ? error.message
                        : 'Could not update text.',
                );
                return;
            }
        }
        pushHistory();
        const { points, isCircle, isPolygon } = geometry;
        orientRef.current.angle = patch.angle;
        const id = inspectorLoop.id;
        setLoops((prev) => {
            const next = prev.map((loop) =>
                loop.id === id
                    ? {
                          ...loop,
                          points,
                          ...((isCircle || isPolygon) && patch.radius
                              ? { radius: patch.radius }
                              : {}),
                          ...(isPolygon && patch.sides
                              ? { sides: Math.round(patch.sides) }
                              : {}),
                          ...(isPolygon && patch.polygonMode
                              ? { polygonMode: patch.polygonMode }
                              : {}),
                      }
                    : loop,
            );
            setStack([]);
            setDraftPreview([]);
            refreshBounds(next);
            return next;
        });
        setStatus('Shape updated.');
    };

    return { buildInspectorPreview, handleInspectorApply };
}
