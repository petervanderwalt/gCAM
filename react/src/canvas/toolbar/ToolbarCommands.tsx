/**
 * Purpose: Implementation module for ToolbarCommands in the canvas domain.
 */
import {
    Copy,
    Expand,
    MousePointer2,
    Move,
    PenTool,
    Redo2,
    RotateCw,
    Scissors,
    Trash2,
    Undo2,
} from 'lucide-react';
import cx from 'classnames';
import type { DrawTool } from '../../draw/geometry';
import {
    ToolbarMenu,
    ToolbarMenuItem,
    ToolbarSeparator,
} from './ToolbarControls';
import { toolbarButton, toolbarButtonActive } from './styles';
import type { CanvasToolbarProps, ToolbarAction } from './types';

const drawTools: { value: NonNullable<DrawTool>; label: string }[] = [
    { value: 'line', label: 'Line' },
    { value: 'rectangle', label: 'Rectangle' },
    { value: 'polygon', label: 'Polygon' },
    { value: 'circle', label: 'Circle' },
    { value: 'arc', label: 'Arc' },
    { value: 'bezier', label: 'Bezier' },
    { value: 'polyline', label: 'Polyline' },
    { value: 'text', label: 'Text' },
];

interface ToolbarCommandsProps {
    props: CanvasToolbarProps;
    open: ToolbarAction;
    close: () => void;
}

export function ToolbarCommands({ props, open, close }: ToolbarCommandsProps) {
    const toggleTransform = (mode: 'move' | 'rotate' | 'scale') => {
        props.onTransformMode(props.transformMode === mode ? null : mode);
        close();
    };
    return (
        <>
            <button
                title="Select (V)"
                aria-label="Select vectors"
                aria-pressed={props.activeTool === 'select' && !open}
                onClick={() => {
                    props.onSelectMode();
                    close();
                }}
                className={cx(
                    `${toolbarButton} w-auto gap-1.5 px-3`,
                    props.activeTool === 'select' &&
                        !open &&
                        toolbarButtonActive,
                )}
            >
                <MousePointer2 size={18} />
                <span>Select</span>
            </button>
            <ToolbarSeparator />
            <button
                title="Trim vectors"
                aria-label="Trim vectors"
                aria-pressed={props.activeTool === 'trim'}
                disabled={!props.hasGeometry}
                onClick={() => props.onTrim?.()}
                className={cx(
                    `${toolbarButton} w-auto gap-1.5 px-3`,
                    props.activeTool === 'trim' && toolbarButtonActive,
                )}
            >
                <Scissors size={18} />
                <span>Trim</span>
            </button>
            <button
                title="Move selection"
                aria-label="Move selection"
                aria-pressed={props.transformMode === 'move'}
                disabled={!props.hasSelection}
                onClick={() => toggleTransform('move')}
                className={cx(
                    `${toolbarButton} w-auto gap-1.5 px-3`,
                    props.transformMode === 'move' && toolbarButtonActive,
                )}
            >
                <Move size={18} />
                <span>Move</span>
            </button>
            <button
                title="Rotate selection"
                aria-label="Rotate selection"
                aria-pressed={props.transformMode === 'rotate'}
                disabled={!props.hasSelection}
                onClick={() => toggleTransform('rotate')}
                className={cx(
                    `${toolbarButton} w-auto gap-1.5 px-3`,
                    props.transformMode === 'rotate' && toolbarButtonActive,
                )}
            >
                <RotateCw size={18} />
                <span>Rotate</span>
            </button>
            <button
                title="Scale selection"
                aria-label="Scale selection"
                aria-pressed={props.transformMode === 'scale'}
                disabled={!props.hasSelection}
                onClick={() => toggleTransform('scale')}
                className={cx(
                    `${toolbarButton} w-auto gap-1.5 px-3`,
                    props.transformMode === 'scale' && toolbarButtonActive,
                )}
            >
                <Expand size={18} />
                <span>Resize</span>
            </button>
            <ToolbarSeparator />
            <ToolbarMenu label="Draw" icon={<PenTool size={18} />} wide>
                {drawTools.map((tool) => (
                    <ToolbarMenuItem
                        key={tool.value}
                        label={tool.label}
                        active={props.drawTool === tool.value}
                        onClick={() => {
                            props.onDrawTool(tool.value);
                            close();
                        }}
                    />
                ))}
                <ToolbarMenuItem
                    label="Vertical Guide"
                    onClick={() => props.onAddGuide('x')}
                />
                <ToolbarMenuItem
                    label="Horizontal Guide"
                    onClick={() => props.onAddGuide('y')}
                />
            </ToolbarMenu>
            <ToolbarSeparator />
            <button
                title="Clone selection"
                aria-label="Clone selection"
                disabled={!props.hasSelection}
                onClick={props.onDuplicate}
                className={`${toolbarButton} w-auto gap-1.5 px-3`}
            >
                <Copy size={18} />
                <span>Clone</span>
            </button>
            <button
                title="Delete selection"
                aria-label="Delete selection"
                disabled={!props.hasSelection}
                onClick={() => props.onDeleteSelected()}
                className={cx(
                    `${toolbarButton} w-auto gap-1.5 px-3`,
                    'hover:!text-red-400',
                )}
            >
                <Trash2 size={18} />
                <span>Delete</span>
            </button>
            <ToolbarSeparator />
            <button
                title="Undo"
                aria-label="Undo"
                disabled={!props.canUndo}
                onClick={() => props.onUndo?.()}
                className={toolbarButton}
            >
                <Undo2 size={18} />
            </button>
            <button
                title="Redo"
                aria-label="Redo"
                disabled={!props.canRedo}
                onClick={() => props.onRedo?.()}
                className={toolbarButton}
            >
                <Redo2 size={18} />
            </button>
            <ToolbarSeparator />
            {props.showTrace && (
                <button
                    title="Trace bitmap"
                    aria-label="Trace bitmap"
                    disabled={props.tracing}
                    onClick={props.onTrace}
                    className={cx(
                        toolbarButton,
                        'w-auto px-3 text-sm font-medium',
                    )}
                >
                    {props.tracing ? 'Tracing…' : 'Trace'}
                </button>
            )}
        </>
    );
}
