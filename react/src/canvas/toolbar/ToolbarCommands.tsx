/**
 * Purpose: Implementation module for ToolbarCommands in the canvas domain.
 */
import {
    ArrowLeftRight,
    ArrowUpRight,
    Circle,
    Copy,
    Expand,
    Hexagon,
    Minus,
    MousePointer2,
    Move,
    PenTool,
    Redo2,
    Ruler,
    RotateCw,
    Scissors,
    Spline,
    Square,
    Trash2,
    Type,
    Undo2,
} from 'lucide-react';
import cx from 'classnames';
import type { ReactNode } from 'react';
import type { DrawTool } from '../../draw/geometry';
import {
    ToolbarMenu,
    ToolbarMenuItem,
    ToolbarSeparator,
} from './ToolbarControls';
import { toolbarButton, toolbarButtonActive } from './styles';
import type { CanvasToolbarProps, ToolbarAction } from './types';

const drawTools: { value: NonNullable<DrawTool>; label: string; icon: ReactNode }[] = [
    { value: 'line', label: 'Line', icon: <ArrowLeftRight size={16} /> },
    { value: 'rectangle', label: 'Rectangle', icon: <Square size={16} /> },
    { value: 'polygon', label: 'Polygon', icon: <Hexagon size={16} /> },
    { value: 'circle', label: 'Circle', icon: <Circle size={16} /> },
    { value: 'arc', label: 'Arc', icon: <ArrowUpRight size={16} /> },
    { value: 'bezier', label: 'Bezier', icon: <Spline size={16} /> },
    { value: 'polyline', label: 'Polyline', icon: <Minus size={16} /> },
    { value: 'text', label: 'Text', icon: <Type size={16} /> },
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
                        icon={tool.icon}
                        active={props.drawTool === tool.value}
                        onClick={() => {
                            props.onDrawTool(tool.value);
                            close();
                        }}
                    />
                ))}
                <ToolbarMenuItem
                    label="Guide"
                    icon={<Ruler size={16} />}
                    onClick={() => {
                        props.onAddGuide();
                        close();
                    }}
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
