import { useEffect, useRef, useState } from 'react';
import { nestPlacements, type NestResult } from '../lib/nest';
import type { NestSearchRequest } from '../lib/nest-search';

export interface NestProgress {
    attemptIteration?: number;
    iterations: number;
    hasBest: boolean;
    improvement: number;
}
interface SearchSession {
    worker: Worker;
    best: NestResult | null;
    initialLength: number | null;
    complete: (result: NestResult) => void;
    error: (message: string) => void;
}

/** Search until stopped: stopping accepts the latest complete layout; cancelling never edits geometry. */
export function useNestOptimizer() {
    const [progress, setProgress] = useState<NestProgress | null>(null);
    const session = useRef<SearchSession | null>(null);
    const finish = (accept: boolean) => {
        const current = session.current;
        setProgress(null);
        if (!current) return;
        session.current = null;
        current.worker.terminate();
        if (accept) {
            if (current.best?.failedIndex === null)
                current.complete(current.best);
            else
                current.error(
                    'No complete layout found. Try a larger sheet, smaller gap or more search time.',
                );
        }
    };
    const cancel = () => finish(false);
    useEffect(
        () => () => {
            const current = session.current;
            if (current) {
                current.worker.terminate();
                session.current = null;
            }
        },
        [],
    );
    useEffect(() => {
        if (!progress) return;
        const escape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                event.stopImmediatePropagation();
                finish(false);
            }
        };
        window.addEventListener('keydown', escape, true);
        return () => window.removeEventListener('keydown', escape, true);
    }, [Boolean(progress)]);
    const start = (
        request: NestSearchRequest,
        complete: (result: NestResult) => void,
        error: (message: string) => void,
        preview?: (result: NestResult) => void,
        attempt?: (result: NestResult) => void,
    ) => {
        cancel();
        if (typeof Worker === 'undefined') {
            complete(
                nestPlacements(
                    request.units,
                    request.width,
                    request.height,
                    request.border,
                    request.gap,
                    request.rotationStep,
                ),
            );
            return;
        }
        try {
            const worker = new Worker(
                new URL('../engine/nest-optimizer.worker.ts', import.meta.url),
                { type: 'module' },
            );
            setProgress({
                iterations: 0,
                hasBest: false,
                improvement: 0,
            });
            const originalLength =
                Math.max(
                    ...request.units.map((unit) => unit.minY + unit.height),
                ) - Math.min(...request.units.map((unit) => unit.minY));
            const current: SearchSession = {
                worker,
                best: null,
                initialLength: originalLength,
                complete,
                error,
            };
            session.current = current;
            let previewArea = Infinity;
            let reportedLength = originalLength;
            worker.onmessage = (
                event: MessageEvent<{
                    error?: string;
                    attempt?: NestResult;
                    attemptIteration?: number;
                    result: NestResult;
                    area: number;
                    length: number;
                    iterations: number;
                }>,
            ) => {
                if (session.current !== current) return;
                const message = event.data;
                if (message.error) {
                    finish(false);
                    error(message.error);
                    return;
                }
                if (message.result.failedIndex === null) {
                    current.best = message.result;
                    if (message.area < previewArea) {
                        previewArea = message.area;
                        preview?.(message.result);
                    }
                    if (Number.isFinite(message.length) && message.length > 0) {
                        if (
                            message.length > reportedLength ||
                            reportedLength - message.length >= 2 - 1e-9
                        )
                            reportedLength = message.length;
                    }
                }
                if (message.attempt?.failedIndex === null)
                    attempt?.(message.attempt);
                setProgress((p) =>
                    p
                        ? {
                              ...p,
                              iterations: message.iterations,
                              attemptIteration:
                                  message.attempt?.failedIndex === null
                                      ? (message.attemptIteration ??
                                        message.iterations)
                                      : p.attemptIteration,
                              hasBest: current.best !== null,
                              improvement: current.initialLength
                                  ? 100 *
                                    (1 - reportedLength / current.initialLength)
                                  : 0,
                          }
                        : p,
                );
            };
            worker.onerror = (event) => {
                if (session.current !== current) return;
                finish(false);
                error(event.message || 'Nesting worker failed.');
            };
            worker.postMessage({
                ...request,
                units: request.units.map((unit) => ({
                    width: unit.width,
                    height: unit.height,
                    minX: unit.minX,
                    minY: unit.minY,
                    envelope: unit.envelope,
                    groupId: unit.groupId,
                    loops: unit.loops.map((loop) => ({
                        points: loop.points.map((p) => ({ x: p.x, y: p.y })),
                    })),
                })),
            });
        } catch (caught) {
            finish(false);
            setProgress(null);
            error(
                caught instanceof Error
                    ? caught.message
                    : 'Could not start nesting.',
            );
        }
    };
    return { progress, start, cancel, stop: () => finish(true) };
}
