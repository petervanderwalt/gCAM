/**
 * Purpose: React hook that owns the TransformWorkspaceState workflow.
 */
import { useRef, useState } from 'react';
import type { TransformMode } from '../lib/transform';

/** Numeric transform controls and their direct-manipulation mode. */
export function useTransformWorkspaceState() {
    const [moveX, setMoveX] = useState(10);
    const [moveY, setMoveY] = useState(0);
    const [rotateDeg, setRotateDeg] = useState(90);
    const [sizeW, setSizeW] = useState(0);
    const [sizeH, setSizeH] = useState(0);
    const [aspectLock, setAspectLock] = useState(true);
    const [transformMode, setTransformMode] = useState<TransformMode | null>(
        null,
    );
    const moveAfterCloneRef = useRef(false);

    return {
        moveX,
        setMoveX,
        moveY,
        setMoveY,
        rotateDeg,
        setRotateDeg,
        sizeW,
        setSizeW,
        sizeH,
        setSizeH,
        aspectLock,
        setAspectLock,
        transformMode,
        setTransformMode,
        moveAfterCloneRef,
    };
}
