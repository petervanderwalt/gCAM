import { jest } from '@jest/globals';
import { placeGuide, updateGuideHover } from './guides';
import type { CanvasMouseEvent, CanvasPointerControllerProps } from './types';

function dependencies(overrides: Record<string, unknown> = {}) {
    const guideHoverRef = { current: null as string | null };
    const canvas = {
        getBoundingClientRect: () => ({ left: 0, top: 0 }),
    } as HTMLCanvasElement;
    const deps = {
        activeTool: 'select',
        viewRef: {
            current: {
                drawTool: null,
                guidePlacement: null,
                guides: [
                    {
                        id: 'guide-1',
                        point: { x: 0, y: 4 },
                        direction: { x: 1, y: 0 },
                    },
                ],
            },
        },
        guideHoverRef,
        canvasRef: { current: canvas },
        cameraRef: { current: { scale: 10, tx: 0, ty: 100 } },
        ...overrides,
    } as unknown as CanvasPointerControllerProps;
    return { deps, guideHoverRef };
}

test('highlights a guide when the pointer is within its screen hit radius', () => {
    const { deps, guideHoverRef } = dependencies();
    updateGuideHover(
        { clientX: 50, clientY: 58 } as unknown as CanvasMouseEvent,
        deps,
    );
    expect(guideHoverRef.current).toBe('guide-1');
});

test('does not highlight guides while another interaction mode is active', () => {
    const { deps, guideHoverRef } = dependencies({ activeTool: 'trim' });
    guideHoverRef.current = 'guide-1';
    updateGuideHover(
        { clientX: 50, clientY: 58 } as unknown as CanvasMouseEvent,
        deps,
    );
    expect(guideHoverRef.current).toBeNull();
});

test('commits a guide when its offset is exactly zero', () => {
    const onPlaceGuide = jest.fn();
    const onGuideDraftChange = jest.fn();
    const { deps } = dependencies({
        viewRef: {
            current: {
                drawTool: null,
                guidePlacement: 'edge',
                guideDraft: {
                    source: { x: 5, y: 4 },
                    direction: { x: 1, y: 0 },
                    sourceLabel: 'Edge',
                    offset: 0,
                },
                grid: { snap: false, spacingMm: 1 },
                guides: [],
                loops: [],
                hidden: [],
            },
        },
        cameraRef: { current: { scale: 10, tx: 0, ty: 100 } },
        onPlaceGuide,
        onGuideDraftChange,
        forceTick: jest.fn(),
    });
    const event = { clientX: 50, clientY: 60 } as unknown as CanvasMouseEvent;
    expect(placeGuide(event, deps, { x: 50, y: 60 }, null)).toBe(true);
    expect(onPlaceGuide).toHaveBeenCalledWith({
        point: { x: 5, y: 4 },
        direction: { x: 1, y: 0 },
    });
    expect(onGuideDraftChange).not.toHaveBeenCalled();
});
