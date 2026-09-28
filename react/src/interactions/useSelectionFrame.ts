import { useEffect, useMemo, useRef } from 'react';
import type { ViewLoop } from '../canvas/types';

export interface SelectionFrame {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    cx: number;
    cy: number;
    w: number;
    h: number;
}

interface UseSelectionFrameOptions {
    loops: ViewLoop[];
    selected: string[];
    hidden: string[];
    selectedLoops(): ViewLoop[];
    setMoveX(value: number): void;
    setMoveY(value: number): void;
    setSizeW(value: number): void;
    setSizeH(value: number): void;
    setRotateDeg(value: number): void;
}

/** Derives the visible selection frame and keeps absolute transform inputs aligned. */
export function useSelectionFrame({
    loops,
    selected,
    hidden,
    selectedLoops,
    setMoveX,
    setMoveY,
    setSizeW,
    setSizeH,
    setRotateDeg,
}: UseSelectionFrameOptions) {
    const selectionFrame = useMemo<SelectionFrame | null>(() => {
        const points = selectedLoops().flatMap((loop) =>
            Array.isArray(loop.points) ? loop.points : [],
        );
        if (!points.length) return null;
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        for (const point of points) {
            if (!Number.isFinite(point.x) || !Number.isFinite(point.y))
                continue;
            minX = Math.min(minX, point.x);
            minY = Math.min(minY, point.y);
            maxX = Math.max(maxX, point.x);
            maxY = Math.max(maxY, point.y);
        }
        if (!Number.isFinite(minX)) return null;
        return {
            minX,
            minY,
            maxX,
            maxY,
            cx: (minX + maxX) / 2,
            cy: (minY + maxY) / 2,
            w: Math.max(0, maxX - minX),
            h: Math.max(0, maxY - minY),
        };
        // selectedLoops intentionally closes over these three sources.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loops, selected, hidden]);

    const orientRef = useRef({ key: '', angle: 0 });
    const selectionKey = selected.join(',');
    if (orientRef.current.key !== selectionKey) {
        orientRef.current = { key: selectionKey, angle: 0 };
    }

    useEffect(() => {
        if (!selectionFrame) return;
        const round2 = (value: number) => Math.round(value * 100) / 100;
        setMoveX(round2(selectionFrame.cx));
        setMoveY(round2(selectionFrame.cy));
        setSizeW(round2(selectionFrame.w));
        setSizeH(round2(selectionFrame.h));
        setRotateDeg(Math.round(orientRef.current.angle * 10) / 10);
    }, [selectionFrame, setMoveX, setMoveY, setRotateDeg, setSizeH, setSizeW]);

    return { selectionFrame, orientRef };
}
