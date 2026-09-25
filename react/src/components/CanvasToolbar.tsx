import { useEffect, useRef, useState } from 'react';
import {
    Bone,
    Copy,
    Download,
    Expand,
    Eye,
    File,
    FolderOpen,
    Group,
    Hexagon,
    LayoutGrid,
    MousePointer2,
    Move,
    PenTool,
    Redo2,
    RotateCw,
    Ruler,
    Scissors,
    Spline,
    Trash2,
    Undo2,
    Upload,
    ZoomIn,
    ZoomOut,
} from 'lucide-react';
import cx from 'classnames';
import type { DrawTool } from '../lib/draw';
import type { BooleanOperation } from '../lib/engine';
import { applyBoolean, offsetLoops } from '../lib/engine';
import type { TransformMode } from '../lib/transform';
import { displayValue, lengthUnit, toMm, type UnitSystem } from '../lib/units';

export type ToolbarAction =
    | null
    | 'draw'
    | 'edit'
    | 'modify'
    | 'fillet'
    | 'chamfer'
    | 'offset'
    | 'boolean'
    | 'nest'
    | 'guides';

interface CanvasToolbarProps {
    units: UnitSystem;
    activeTool: 'select' | 'draw' | 'trim';
    onSelectMode: () => void;
    drawTool: DrawTool;
    onDrawTool: (t: NonNullable<DrawTool>) => void;
    transformMode: TransformMode | null;
    onTransformMode: (m: TransformMode | null) => void;
    moveX: number;
    moveY: number;
    onMoveX: (v: number) => void;
    onMoveY: (v: number) => void;
    onApplyMove: () => void;
    rotateDeg: number;
    onRotateDeg: (v: number) => void;
    onApplyRotate: () => void;
    sizeW: number;
    sizeH: number;
    onSizeW: (v: number) => void;
    onSizeH: (v: number) => void;
    aspectLock: boolean;
    onAspectLock: (v: boolean) => void;
    onApplyScale: () => void;
    cornerRadius: number;
    onCornerRadius: (v: number) => void;
    onApplyFillet: () => void;
    onApplyChamfer?: () => void;
    onApplyDogbone: () => void;
    offsetAmount: number;
    onOffsetAmount: (v: number) => void;
    onApplyOffset: () => void;
    offsetSource: { points: { x: number; y: number }[] }[];
    onOffsetPreview: (contours: { x: number; y: number }[][]) => void;
    onBoolean: (op: BooleanOperation) => void;
    canBoolean: boolean;
    booleanSource: { points: { x: number; y: number }[] }[];
    onBooleanPreview: (contours: { x: number; y: number }[][]) => void;
    sheetW: number;
    sheetH: number;
    nestBorder?: number;
    onNestBorder?: (v: number) => void;
    nestSpacing?: number;
    onNestSpacing?: (v: number) => void;
    onSheetW: (v: number) => void;
    onSheetH: (v: number) => void;
    onApplyNest: () => void;
    onAddGuide: (axis: 'x' | 'y') => void;
    onDeleteGuide: (id: string) => void;
    guides: { id: string; axis: 'x' | 'y'; pos: number }[];
    hasSelection: boolean;
    hasGeometry: boolean;
    onDuplicate: () => void;
    onDeleteSelected: () => void;
    showTrace: boolean;
    tracing: boolean;
    onTrace: () => void;
    onUndo?: () => void;
    onRedo?: () => void;
    canUndo?: boolean;
    canRedo?: boolean;
    onImportFile?: () => void;
    onImportProject?: () => void;
    onExportProject?: () => void;
    onNewCanvas?: () => void;
    onToggleObjects?: () => void;
    onViewPreview?: () => void;
    onViewConfig?: () => void;
    onToggleDarkMode?: () => void;
    onClearGuides?: () => void;
    onTrim?: () => void;
    onGroup?: () => void;
    onUngroup?: () => void;
    canGroup?: boolean;
    canUngroup?: boolean;
    onFitView?: () => void;
    onZoomIn?: () => void;
    onZoomOut?: () => void;
    snapToGrid?: boolean;
    onToggleSnapToGrid?: () => void;
}

const DRAW_TOOLS: { value: NonNullable<DrawTool>; label: string }[] = [
    { value: 'line', label: 'Line' },
    { value: 'rectangle', label: 'Rectangle' },
    { value: 'polygon', label: 'Polygon' },
    { value: 'circle', label: 'Circle' },
    { value: 'arc', label: 'Arc' },
    { value: 'bezier', label: 'Bezier' },
    { value: 'polyline', label: 'Polyline' },
    { value: 'text', label: 'Text' },
];

const btn =
    'inline-flex items-center justify-center w-10 h-10 rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-dark-lighter dark:hover:text-white touch-manipulation disabled:opacity-30';
const btnActive =
    'bg-robin-500 text-white hover:bg-robin-500 dark:hover:bg-robin-500';

/**
 * Icon toolbar above the 2D canvas — mirrors camcanvas `.tool-bar`
 * (select, draw menu, move/scale/rotate, fillet/dogbone, offset,
 * boolean, nest, guides, duplicate/delete) in gSender skin.
 * Parametric tools expand an inline mini-form.
 */
export function CanvasToolbar(props: CanvasToolbarProps) {
    const [open, setOpen] = useState<ToolbarAction>(null);
    const [booleanOperation, setBooleanOperation] = useState<BooleanOperation>('union');
    const displayLength = (value: number) => displayValue(value, props.units);
    const parseLength = (value: string) => toMm(Number(value), props.units);
    const rootRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const onDown = (e: PointerEvent) => {
            if (rootRef.current && !rootRef.current.contains(e.target as Node))
                setOpen(null);
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                props.onTransformMode(null);
                setOpen(null);
            }
        };
        window.addEventListener('pointerdown', onDown);
        window.addEventListener('keydown', onKey);
        return () => {
            window.removeEventListener('pointerdown', onDown);
            window.removeEventListener('keydown', onKey);
        };
    }, []);

    // Live offset preview while the form is open (legacy expand preview).
    useEffect(() => {
        if (open !== 'offset') {
            props.onOffsetPreview([]);
            return;
        }
        if (!props.offsetSource.length || !(props.offsetAmount !== 0)) {
            props.onOffsetPreview([]);
            return;
        }
        const timer = window.setTimeout(() => {
            try {
                const results = offsetLoops(
                    props.offsetSource,
                    props.offsetAmount,
                );
                props.onOffsetPreview(results.map((r) => r.points));
            } catch {
                props.onOffsetPreview([]);
            }
        }, 300);
        return () => window.clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, props.offsetAmount, props.offsetSource]);

    useEffect(() => {
        if (open !== 'boolean' || !props.canBoolean) {
            props.onBooleanPreview([]);
            return;
        }
        try {
            props.onBooleanPreview(
                applyBoolean(props.booleanSource, booleanOperation).map((loop) => loop.points),
            );
        } catch {
            props.onBooleanPreview([]);
        }
    }, [booleanOperation, open, props.booleanSource, props.canBoolean]);

    const toggle = (a: Exclude<ToolbarAction, null>) =>
        setOpen((o) => (o === a ? null : a));

    const numCls =
        'w-16 rounded-lg bg-white dark:bg-dark-lighter border border-slate-300 dark:border-robin-900 px-2 py-1.5 text-slate-900 dark:text-white text-sm';

    return (
        <div
            ref={rootRef}
            className="shrink-0 flex flex-col"
        >
            <div
                className="flex flex-wrap items-center gap-0.5 overflow-visible"
            role="toolbar"
            aria-label="Canvas tools"
            >
                <TopMenu label="File" icon={<File size={18} />} wide>
                    <MenuItem label="New Project" onClick={() => props.onNewCanvas?.()} />
                    <MenuItem label="Import Project" onClick={() => props.onImportProject?.()} />
                    <MenuItem label="Export Project" onClick={() => props.onExportProject?.()} />
                    <MenuItem label="Import File" onClick={() => props.onImportFile?.()} />
                    <MenuItem label="Generate G-code" onClick={() => props.onViewPreview?.()} />
                </TopMenu>
                <Sep />
                <button
                    title="Select (V)"
                    aria-label="Select vectors"
                    aria-pressed={props.activeTool === 'select' && !open}
                    onClick={() => {
                        props.onSelectMode();
                        setOpen(null);
                    }}
                    className={cx(
                        `${btn} w-auto gap-1.5 px-3`,
                        props.activeTool === 'select' && !open && btnActive,
                    )}
                >
                    <MousePointer2 size={18} />
                    <span>Select</span>
                </button>
                <Sep />
                <button
                    title="Trim vectors"
                    aria-label="Trim vectors"
                    aria-pressed={props.activeTool === 'trim'}
                    disabled={!props.hasGeometry}
                    onClick={() => props.onTrim?.()}
                    className={cx(`${btn} w-auto gap-1.5 px-3`, props.activeTool === 'trim' && btnActive)}
                >
                    <Scissors size={18} />
                    <span>Trim</span>
                </button>
                <button
                    title="Move selection"
                    aria-label="Move selection"
                    aria-pressed={props.transformMode === 'move'}
                    disabled={!props.hasSelection}
                    onClick={() => {
                        props.onTransformMode(
                            props.transformMode === 'move' ? null : 'move',
                        );
                        setOpen(null);
                    }}
                    className={cx(
                        `${btn} w-auto gap-1.5 px-3`,
                        props.transformMode === 'move' && btnActive,
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
                    onClick={() => {
                        props.onTransformMode(
                            props.transformMode === 'rotate' ? null : 'rotate',
                        );
                        setOpen(null);
                    }}
                    className={cx(
                        `${btn} w-auto gap-1.5 px-3`,
                        props.transformMode === 'rotate' && btnActive,
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
                    onClick={() => {
                        props.onTransformMode(
                            props.transformMode === 'scale' ? null : 'scale',
                        );
                        setOpen(null);
                    }}
                    className={cx(
                        `${btn} w-auto gap-1.5 px-3`,
                        props.transformMode === 'scale' && btnActive,
                    )}
                >
                    <Expand size={18} />
                    <span>Resize</span>
                </button>
                <Sep />
                <TopMenu label="Draw" icon={<PenTool size={18} />} wide>
                    {DRAW_TOOLS.map((t) => (
                        <MenuItem key={t.value} label={t.label} active={props.drawTool === t.value} onClick={() => { props.onDrawTool(t.value); setOpen(null); }} />
                    ))}
                    <MenuItem label="Vertical Guide" onClick={() => props.onAddGuide('x')} />
                    <MenuItem label="Horizontal Guide" onClick={() => props.onAddGuide('y')} />
                </TopMenu>
                <Sep />
                <button title="Clone selection" aria-label="Clone selection" disabled={!props.hasSelection} onClick={props.onDuplicate} className={cx(`${btn} w-auto gap-1.5 px-3`)}>
                    <Copy size={18} />
                    <span>Clone</span>
                </button>
                <button title="Delete selection" aria-label="Delete selection" disabled={!props.hasSelection} onClick={props.onDeleteSelected} className={cx(`${btn} w-auto gap-1.5 px-3`, 'hover:!text-red-400')}>
                    <Trash2 size={18} />
                    <span>Delete</span>
                </button>
                <Sep />
                <button title="Undo" aria-label="Undo" disabled={!props.canUndo} onClick={() => props.onUndo?.()} className={btn}><Undo2 size={18} /></button>
                <button title="Redo" aria-label="Redo" disabled={!props.canRedo} onClick={() => props.onRedo?.()} className={btn}><Redo2 size={18} /></button>
                <Sep />
                <TopMenu label="Modify" icon={<Scissors size={18} />} iconOnly>
                    <MenuItem label="Fillet…" onClick={() => setOpen('fillet')} />
                    <MenuItem label="Chamfer…" onClick={() => setOpen('chamfer')} />
                    <MenuItem label="Dogbone" onClick={() => { props.onApplyDogbone(); setOpen(null); }} />
                    <MenuItem label="Boolean…" onClick={() => setOpen('boolean')} />
                    <MenuItem label="Offset…" onClick={() => setOpen('offset')} />
                    <MenuItem label="Nest…" onClick={() => setOpen('nest')} />
                </TopMenu>
                <TopMenu label="Group" icon={<Group size={18} />} iconOnly>
                    <MenuItem label="Group" disabled={!props.canGroup} onClick={() => props.onGroup?.()} />
                    <MenuItem label="Ungroup" disabled={!props.canUngroup} onClick={() => props.onUngroup?.()} />
                </TopMenu>
                <TopMenu label="View" icon={<Eye size={18} />} iconOnly>
                    <MenuItem label="Dark / Light Mode" onClick={() => props.onToggleDarkMode?.()} />
                    <MenuItem label={props.snapToGrid ? 'Snap to Grid ✓' : 'Snap to Grid'} onClick={() => props.onToggleSnapToGrid?.()} />
                    <MenuItem label="Fit View" onClick={() => props.onFitView?.()} />
                    <MenuItem label="Zoom In" onClick={() => props.onZoomIn?.()} />
                    <MenuItem label="Zoom Out" onClick={() => props.onZoomOut?.()} />
                    <MenuItem label="Object Browser" onClick={() => props.onToggleObjects?.()} />
                </TopMenu>
                <Sep />
                {props.showTrace && (
                    <button
                        title="Trace bitmap"
                        aria-label="Trace bitmap"
                        disabled={props.tracing}
                        onClick={props.onTrace}
                        className={cx(btn, 'w-auto px-3 text-sm font-medium')}
                    >
                        {props.tracing ? 'Tracing…' : 'Trace'}
                    </button>
                )}
            </div>

            {open === 'fillet' && (
                <MiniForm
                    fields={
                        <label className="flex items-center gap-1 text-sm text-slate-600 dark:text-slate-300">
                            Radius ({lengthUnit(props.units)})
                            <input
                                type="number"
                                min={0.5}
                                step={0.5}
                                value={displayLength(props.cornerRadius)}
                                onChange={(e) =>
                                    props.onCornerRadius(parseLength(e.target.value))
                                }
                                aria-label={`Corner radius in ${lengthUnit(props.units)}`}
                                className={numCls}
                            />
                        </label>
                    }
                    onApply={() => {
                        props.onApplyFillet();
                        setOpen(null);
                    }}
                    onCancel={() => setOpen(null)}
                    title="Fillet Corners"
                    applyLabel="Fillet"
                />
            )}
            {open === 'chamfer' && (
                <MiniForm
                    fields={
                        <label className="flex items-center gap-1 text-sm text-slate-600 dark:text-slate-300">
                            Distance ({lengthUnit(props.units)})
                            <input
                                type="number"
                                min={0.5}
                                step={0.5}
                                value={displayLength(props.cornerRadius)}
                                onChange={(e) =>
                                    props.onCornerRadius(parseLength(e.target.value))
                                }
                                aria-label={`Chamfer distance in ${lengthUnit(props.units)}`}
                                className="w-56 rounded-lg bg-white dark:bg-dark-lighter border border-slate-300 dark:border-robin-900 px-2 py-1.5 text-slate-900 dark:text-white text-sm"
                            />
                        </label>
                    }
                    onApply={() => {
                        props.onApplyChamfer?.();
                        setOpen(null);
                    }}
                    onCancel={() => setOpen(null)}
                    title="Chamfer Corners"
                    applyLabel="Chamfer"
                />
            )}
            {open === 'offset' && (
                <MiniForm
                    fields={
                        <label className="flex items-center gap-1 text-sm text-slate-600 dark:text-slate-300">
                            Amount ({lengthUnit(props.units)})
                            <input
                                type="number"
                                step={0.5}
                                value={displayLength(props.offsetAmount)}
                                onChange={(e) =>
                                    props.onOffsetAmount(parseLength(e.target.value))
                                }
                                aria-label={`Offset amount in ${lengthUnit(props.units)}`}
                                className={numCls}
                            />
                        </label>
                    }
                    onApply={() => {
                        props.onApplyOffset();
                        setOpen(null);
                    }}
                    onCancel={() => setOpen(null)}
                    title="Offset Vectors"
                    applyLabel="Offset"
                />
            )}
            {open === 'boolean' && (
                <MiniForm
                    fields={
                        <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                            Operation
                            <select
                                value={booleanOperation}
                                onChange={(event) => setBooleanOperation(event.target.value as BooleanOperation)}
                                className={numCls}
                            >
                                <option value="union">Union</option>
                                <option value="difference">Difference</option>
                                <option value="intersection">Intersection</option>
                                <option value="xor">XOR</option>
                            </select>
                        </label>
                    }
                    onApply={() => {
                        props.onBoolean(booleanOperation);
                        setOpen(null);
                    }}
                    onCancel={() => setOpen(null)}
                    title="Boolean Operation"
                    applyLabel="Apply Boolean"
                    canApply={props.canBoolean}
                />
            )}
            {open === 'nest' && (
                <MiniForm
                    fields={
                        <>
                            <label className="flex items-center gap-1 text-sm text-slate-600 dark:text-slate-300">
                                W ({lengthUnit(props.units)})
                                <input
                                    type="number"
                                    value={displayLength(props.sheetW)}
                                    onChange={(e) =>
                                        props.onSheetW(parseLength(e.target.value))
                                    }
                                    aria-label={`Sheet width in ${lengthUnit(props.units)}`}
                                    className={numCls}
                                />
                            </label>
                            <label className="flex items-center gap-1 text-sm text-slate-600 dark:text-slate-300">
                                H ({lengthUnit(props.units)})
                                <input
                                    type="number"
                                    value={displayLength(props.sheetH)}
                                    onChange={(e) =>
                                        props.onSheetH(parseLength(e.target.value))
                                    }
                                    aria-label={`Sheet height in ${lengthUnit(props.units)}`}
                                    className={numCls}
                                />
                            </label>
                        </>
                    }
                    onApply={() => {
                        props.onApplyNest();
                        setOpen(null);
                    }}
                    onCancel={() => setOpen(null)}
                    title="Nest Parts"
                    applyLabel="Nest"
                />
            )}
        </div>
    );
}

function Sep() {
    return (
        <span
            aria-hidden="true"
            className="mx-1 h-6 w-px bg-slate-200 dark:bg-robin-900"
        />
    );
}

function Menu({ children }: { children: React.ReactNode }) {
    return (
        <div
            role="menu"
            className="absolute left-0 top-11 z-30 min-w-44 rounded-lg border border-slate-200 dark:border-robin-900 bg-white dark:bg-dark p-1 shadow-xl"
        >
            {children}
        </div>
    );
}

function TopMenu({ label, icon, children, iconOnly, wide }: { label: string; icon?: React.ReactNode; children: React.ReactNode; iconOnly?: boolean; wide?: boolean }) {
    const [open, setOpen] = useState(false);
    return (
        <div className="relative group" onMouseLeave={() => setOpen(false)}>
            <button
                type="button"
                aria-label={label}
                title={label}
                aria-expanded={open}
                onClick={() => setOpen((value) => !value)}
                className={cx(
                    btn,
                    'gap-1.5 px-2.5 text-sm',
                    wide && 'w-auto',
                    iconOnly ? 'w-10 px-0' : 'w-auto',
                )}
            >
                {icon}
                {!iconOnly && label}
            </button>
            <div className={cx('absolute left-0 top-8 z-50 min-w-48 rounded-md border border-slate-200 bg-white p-1 shadow-xl dark:border-robin-900 dark:bg-dark', open ? 'block' : 'hidden group-hover:block')}>
                {children}
            </div>
        </div>
    );
}

function MenuItem({
    label,
    active,
    danger,
    disabled,
    onClick,
}: {
    label: string;
    active?: boolean;
    danger?: boolean;
    disabled?: boolean;
    onClick: () => void;
}) {
    return (
        <button
            role="menuitem"
            disabled={disabled}
            onClick={onClick}
            className={cx(
                'w-full text-left rounded-md px-3 py-2 text-sm capitalize touch-manipulation disabled:cursor-not-allowed disabled:opacity-40',
                active
                    ? 'bg-robin-500 text-white'
                    : danger
                      ? 'text-red-500 hover:bg-red-500/10'
                      : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-dark-lighter',
            )}
        >
            {label}
        </button>
    );
}

function MiniForm({
    fields,
    onApply,
    onCancel,
    applyLabel,
    title = 'Tool settings',
    canApply = true,
}: {
    fields: React.ReactNode;
    onApply: () => void;
    onCancel: () => void;
    applyLabel: string;
    title?: string;
    canApply?: boolean;
}) {
    return (
        <div
            className="fixed inset-0 z-[9998] grid place-items-center bg-black/80 p-4"
            onMouseDown={onCancel}
        >
            <form
                className="relative grid w-full max-w-lg gap-4 rounded-lg border border-gray-300 bg-gray-100 p-4 text-sm shadow-lg dark:border-gray-700 dark:bg-dark dark:text-white"
                onMouseDown={(e) => e.stopPropagation()}
                onSubmit={(e) => {
                    e.preventDefault();
                    onApply();
                }}
            >
                <div className="flex flex-col text-center sm:text-left">
                    <h2 className="mb-2 text-lg font-semibold leading-none tracking-tight text-blue-500 dark:text-white">
                        {title}
                    </h2>
                </div>
                <button
                    type="button"
                    onClick={onCancel}
                    className="absolute right-4 top-4 rounded-sm px-1 text-lg leading-none text-slate-500 opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-robin-500 focus:ring-offset-2 dark:text-slate-300 dark:focus:ring-offset-dark-darker"
                    aria-label="Close"
                >
                    ×
                </button>
                <div className="flex flex-wrap items-center gap-4">
                    {fields}
                </div>
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:space-x-2">
                    <button
                        type="button"
                        onClick={onCancel}
                        className="rounded-md border border-slate-300 bg-transparent px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-robin-500 focus:ring-offset-2 dark:border-gray-600 dark:text-slate-200 dark:hover:bg-dark-lighter dark:focus:ring-offset-dark-darker"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        disabled={!canApply}
                        className="rounded-md bg-robin-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-robin-600 focus:outline-none focus:ring-2 focus:ring-robin-500 focus:ring-offset-2 dark:focus:ring-offset-dark-darker touch-manipulation"
                    >
                        {applyLabel}
                    </button>
                </div>
            </form>
        </div>
    );
}
