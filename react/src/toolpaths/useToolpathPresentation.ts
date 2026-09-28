/**
 * Purpose: React hook that owns the ToolpathPresentation workflow.
 */
import { useMemo } from 'react';
import { pointAtDistance } from '../geometry/primitives.js';
import { combineToolpaths, type PlacedTab } from '../lib/engine';
import { gcodeForUnits, type UnitSystem } from '../lib/units';
import { operationUsesTabs } from '../lib/tabs';
import type { ToolpathStackEntry } from './useToolpathStack';

interface ToolpathPresentationOptions {
    stack: ToolpathStackEntry[];
    editingId: string | null;
    fileName: string;
    emitArcs: boolean;
    units: UnitSystem;
}

/** Stable derived presentation data for canvas and preview panels. */
export function useToolpathPresentation(options: ToolpathPresentationOptions) {
    const editingEntry =
        options.editingId === null
            ? null
            : (options.stack.find((entry) => entry.id === options.editingId) ??
              null);
    const preview = useMemo(
        () =>
            options.stack.flatMap((entry) =>
                Array.isArray(entry.preview)
                    ? entry.preview.map((loop) => ({
                          ...loop,
                          entryId: entry.id,
                          tabEligible: operationUsesTabs(entry.args.operation),
                          tabWidth: Number(entry.args.tabWidth) || 9,
                          toolDiameter: Number(entry.args.toolDiameter) || 6,
                      }))
                    : [],
            ),
        [options.stack],
    );
    const tabMarkers = useMemo(
        () =>
            options.stack.flatMap((entry) =>
                ((entry.args.tabs as PlacedTab[] | undefined) ?? []).flatMap(
                    (tab, tabIndex) => {
                        const contour = Array.isArray(entry.preview)
                            ? entry.preview[tab.contourIndex]?.points
                            : undefined;
                        if (!Array.isArray(contour) || contour.length < 2) {
                            return [];
                        }
                        const point = pointAtDistance(contour, tab.along);
                        if (
                            !point ||
                            !Number.isFinite(point.x) ||
                            !Number.isFinite(point.y)
                        ) {
                            return [];
                        }
                        let previewIndex = -1;
                        let seen = 0;
                        for (const other of options.stack) {
                            for (
                                let index = 0;
                                index < other.preview.length;
                                index += 1
                            ) {
                                if (
                                    other.id === entry.id &&
                                    index === tab.contourIndex
                                ) {
                                    previewIndex = seen;
                                    break;
                                }
                                seen += 1;
                            }
                            if (previewIndex >= 0) break;
                        }
                        return [
                            {
                                entryId: entry.id,
                                tabIndex,
                                contourIndex: tab.contourIndex,
                                along: tab.along,
                                previewIndex,
                                x: point.x,
                                y: point.y,
                            },
                        ];
                    },
                ),
            ),
        [options.stack],
    );
    const gcode = useMemo(
        () =>
            gcodeForUnits(
                combineToolpaths(
                    options.stack.map((entry) => entry.toolpath),
                    options.fileName || 'gcam',
                    options.emitArcs,
                ),
                options.units,
            ),
        [options.stack, options.fileName, options.emitArcs, options.units],
    );
    const previewToolpaths = useMemo(
        () => options.stack.map((entry) => entry.toolpath),
        [options.stack],
    );

    return { editingEntry, preview, tabMarkers, gcode, previewToolpaths };
}
