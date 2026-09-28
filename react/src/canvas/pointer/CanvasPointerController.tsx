/**
 * Purpose: Implementation module for CanvasPointerController in the canvas domain.
 */
import {
    clearDraggedDraft,
    finishDraw,
    updateChainCursor,
    updateDrawDraft,
} from './draw';
import { placeGuide } from './guides';
import { completePolylineOnDoubleClick, handleCanvasKeyDown } from './keyboard';
import { beginPan, finishSelection, movePan, updateMarquee } from './selection';
import {
    handleTabDown,
    handleTabMove,
    handleTabUp,
    placeTab,
    updateTabHover,
} from './tabs';
import {
    handleCornerDown,
    handleTransformDown,
    handleTransformMove,
    handleTransformUp,
    updateCornerHover,
    updateTransformHover,
} from './transform';
import {
    handleTrimDown,
    handleTrimMove,
    handleTrimUp,
    trimAt,
    updateTrimHover,
} from './trim';
import type { CanvasPointerControllerProps } from './types';

// Deliberately a router: interaction modes own their event handling in sibling
// modules so canvas input remains easy to navigate and test independently.
export function CanvasPointerController(props: CanvasPointerControllerProps) {
    void props.zoomBy;
    return (
        <canvas
            ref={props.canvasRef}
            className="w-full h-full block"
            data-testid="gcam-canvas"
            tabIndex={0}
            style={{ touchAction: 'none', userSelect: 'none' }}
            onKeyDown={(event) =>
                handleCanvasKeyDown(event, {
                    viewRef: props.viewRef,
                    clicksRef: props.clicksRef,
                    cursorRef: props.cursorRef,
                    draftRef: props.draftRef,
                    pendingAnchorRef: props.pendingAnchorRef,
                    selectedTabRef: props.selectedTabRef,
                    transformDragRef: props.transformDragRef,
                    onDeleteTab: props.onDeleteTab,
                    onCancelGuide: props.onCancelGuide,
                    onTransformCommit: props.onTransformCommit,
                    onCommitLoop: props.onCommitLoop,
                    forceTick: props.forceTick,
                })
            }
            onDoubleClick={() =>
                completePolylineOnDoubleClick({
                    drawTool: props.viewRef.current.drawTool,
                    clicksRef: props.clicksRef,
                    cursorRef: props.cursorRef,
                    onCommitLoop: props.onCommitLoop,
                    forceTick: props.forceTick,
                })
            }
            onMouseDown={(event) => {
                event.currentTarget.focus();
                props.downRef.current = { x: event.clientX, y: event.clientY };
                if (handleCornerDown(event, props)) return;
                if (handleTabDown(event, props)) return;
                props.selectedTabRef.current = null;
                if (handleTrimDown(event, props)) return;
                beginPan(event, props);
                handleTransformDown(event, props);
            }}
            onMouseMove={(event) => {
                props.progressPointerRef.current = {
                    x: event.clientX,
                    y: event.clientY,
                };
                if (handleTabMove(event, props)) return;
                if (handleTrimMove(event, props)) return;
                if (handleTransformMove(event, props)) return;
                if (updateCornerHover(event, props)) return;
                updateTrimHover(event, props);
                updateTransformHover(event, props);
                if (movePan(event, props)) return;
                if (updateChainCursor(event, props)) return;
                props.updateCursor(event);
                updateTabHover(event, props);
                props.forceTick();
                if (updateDrawDraft(event, props)) return;
                updateMarquee(event, props);
            }}
            onMouseUp={(event) => {
                if (handleTabUp(event, props)) return;
                if (handleTrimUp(event, props)) return;
                const down = props.downRef.current;
                props.downRef.current = null;
                props.panRef.current = null;
                const marquee = props.marqueeRef.current;
                props.marqueeRef.current = null;
                props.draftRef.current = null;
                if (handleTransformUp(event, props)) return;
                if (event.button !== 0) {
                    props.forceTick();
                    return;
                }
                if (placeGuide(event, props, down, marquee)) return;
                if (trimAt(event, props, down, marquee)) return;
                if (finishDraw(event, props, down, marquee)) return;
                if (clearDraggedDraft(props)) return;
                if (placeTab(props)) return;
                finishSelection(event, props, down, marquee);
            }}
            onMouseLeave={() => {
                props.marqueeRef.current = null;
                props.draftRef.current = null;
                props.cursorRef.current = null;
                props.onTrimHover(null);
                props.transformDragRef.current = null;
                const canvas = props.canvasRef.current;
                if (canvas) canvas.style.cursor = '';
                props.forceTick();
            }}
            onContextMenu={(event) => event.preventDefault()}
        />
    );
}
