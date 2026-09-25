import {
    Box,
    Camera,
    Download,
    FolderOpen,
    Layers,
    ListTree,
    Moon,
    MousePointer2,
    Pencil,
    PenTool,
    Play,
    Redo2,
    Sun,
    Trash2,
    Undo2,
    Upload,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, Component, ErrorInfo, ReactNode } from 'react';
import {
    CanvasStage,
    type LoopMeta,
    type ViewBounds,
    type ViewLoop,
} from './components/CanvasStage';
import { CadInspector, type InspectorPatch } from './components/CadInspector';
import { CanvasToolbar } from './components/CanvasToolbar';
import { TraceModal } from './components/TraceModal';
import { useConfirmation } from './components/ConfirmDialog';
import { ToastStack, useToasts } from './components/Toasts';
import {
    ConfigPanel,
    loadGrid,
    saveGrid,
    type ConfigActions,
} from './components/ConfigPanel';
import {
    CutPreview3DView,
    type PreviewControls,
} from './components/CutPreview3DView';
import { GcodeViewer3DView } from './components/GcodeViewer3DView';
import { EditMenu } from './components/EditMenu';
import { ObjectTree } from './components/ObjectTree';
import { Sidebar, type SideTab } from './components/Sidebar';
import type { DrawTool } from './lib/draw';
import { GcodePreview } from './components/GcodePreview';
import { UnitInput } from './components/UnitInput';
import { ToolpathPanel } from './components/ToolpathPanel';
import {
    applyBoolean,
    buildToolpathGcode,
    combineToolpaths,
    loopBounds,
    offsetLoops,
    type BooleanOperation,
    type PlacedTab,
    type ProfileArgs,
    type ToolpathResult,
} from './lib/engine';
import {
    createHistory,
    pushHistory as pushHistoryLib,
    redoHistory as redoHistoryLib,
    undoHistory as undoHistoryLib,
} from './lib/history';
import { deserializeProject, serializeProject } from './lib/project';
import { importVectorFile } from './lib/import';
import { isBitmapFile, loadBitmapFile, placeBitmap } from './lib/bitmap';
import { useDarkMode } from './hooks/useDarkMode';
import { displayValue, gcodeForUnits, lengthUnit, type UnitSystem } from './lib/units';
import { buildNestUnits, nestPlacements } from './lib/nest';
import { snapToGuides, type Guide } from './lib/guides';
import {
    rotatePoints,
    scalePoints,
    scalePointsXY,
    translatePoints,
} from './lib/transform';
import type { TransformCommit, TransformMode } from './lib/transform';
import { chamferLoop, dogboneCorner, filletCorner } from './lib/corners';
import { pointAtDistance } from './engine/paths.js';
import { FONT_OPTIONS, outlineTextLoops, textLoops } from './lib/text';
import { defaultTabsForContours, operationUsesTabs } from './lib/tabs';
import { trimNearestSegment } from './lib/trim';
import { expandGroupedSelection, groupIdsForSelection, groupLoopIds, ungroupLoopIds } from './lib/groups';
import logoUrl from '../assets/logo.svg';

interface StackEntry {
    id: string;
    label: string;
    args: ProfileArgs;
    preview: { points: { x: number; y: number }[] }[];
    toolpath: Record<string, unknown>;
}

interface PlacedBitmap {
    id: string;
    x: number;
    y: number;
    w: number;
    h: number;
    rotation?: number;
    dataUrl: string;
    img?: HTMLImageElement;
}

let nextId = 1;

class ErrorBoundary extends Component<
    { children: ReactNode; fallback?: ReactNode },
    { hasError: boolean; error: Error | null }
> {
    constructor(props: { children: ReactNode; fallback?: ReactNode }) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error) {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('Error caught by boundary:', error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            if (this.props.fallback) {
                return this.props.fallback;
            }
            return (
                <div className="flex h-full items-center justify-center p-4">
                    <div className="rounded-lg bg-red-50 p-6 text-center dark:bg-red-900/20">
                        <h2 className="text-lg font-medium text-red-700 dark:text-red-300">
                            Something went wrong
                        </h2>
                        <pre className="mt-4 text-xs text-left overflow-auto max-h-64 text-red-600 dark:text-red-400">
                            {this.state.error?.message}
                            {this.state.error?.stack}
                        </pre>
                        <button
                            onClick={() => this.setState({ hasError: false, error: null })}
                            className="mt-4 rounded-lg bg-robin-500 px-4 py-2 text-white"
                        >
                            Try again
                        </button>
                    </div>
                </div>
            );
        }
        return this.props.children;
    }
}

/**
 * gCAM React shell — gSender visual language (robin/blue palette, dark slate
 * chrome, compact panels) with the gCAM workflow: import → select → toolpath
 * stack → combined export for gSender.
 */
export default function App() {
    const [activeTool, setActiveTool] = useState<'select' | 'draw' | 'trim' | 'preview'>(
        'select',
    );
    const [loops, setLoops] = useState<ViewLoop[]>([]);
    const [emptyStateDismissed, setEmptyStateDismissed] = useState(false);
    const [bounds, setBounds] = useState<ViewBounds | null>(null);
    const [selected, setSelected] = useState<string[]>([]);
    const [hidden, setHidden] = useState<string[]>([]);
    const [stack, setStack] = useState<StackEntry[]>([]);
    const [bitmaps, setBitmaps] = useState<PlacedBitmap[]>([]);
    const [tabMode, setTabMode] = useState(false);
    const [drawTool, setDrawTool] = useState<DrawTool>(null);
    const [drawSides, setDrawSides] = useState(6);
    const [drawPolygonMode, setDrawPolygonMode] = useState<
        'inscribed' | 'circumscribed'
    >('inscribed');
    const [drawText, setDrawText] = useState('TEXT');
    const [drawTextHeight, setDrawTextHeight] = useState(20);
    const [drawFont, setDrawFont] = useState('single-line');
    const [textAnchor, setTextAnchor] = useState<{ x: number; y: number } | null>(null);
    const [treeOpen, setTreeOpen] = useState(false);
    const [viewportCommand, setViewportCommand] = useState<{
        type: 'fit' | 'zoomIn' | 'zoomOut';
        token: number;
    }>();
    const [preserveViewToken, setPreserveViewToken] = useState(0);
    const [inspectorDismissed, setInspectorDismissed] = useState<string | null>(
        null,
    );
    const [inspectorPreview, setInspectorPreview] = useState<{
        id: string;
        points: { x: number; y: number }[];
    } | null>(null);
    const [guides, setGuides] = useState<Guide[]>([]);
    const [guidePlacement, setGuidePlacement] = useState<'x' | 'y' | null>(null);
    const [grid, setGrid] = useState(loadGrid);
    useEffect(() => {
        saveGrid(grid);
    }, [grid]);
    const [sideTab, setSideTab] = useState<SideTab>('toolpaths');
    const [previewControls, setPreviewControls] =
        useState<PreviewControls | null>(null);
    const [configActions, setConfigActions] =
        useState<ConfigActions | null>(null);
    const { enabled: darkMode, setEnabled: setDarkMode } = useDarkMode();
    const [emitArcs, setEmitArcs] = useState(() => {
        if (typeof window === 'undefined') return true;
        return JSON.parse(localStorage.getItem('gcam.emitArcs') ?? 'true');
    });
    const [units, setUnits] = useState<UnitSystem>(() => {
        if (typeof window === 'undefined') return 'metric';
        return localStorage.getItem('gcam.units') === 'imperial'
            ? 'imperial'
            : 'metric';
    });
    useEffect(() => {
        localStorage.setItem('gcam.emitArcs', JSON.stringify(emitArcs));
    }, [emitArcs]);
    useEffect(() => {
        localStorage.setItem('gcam.units', units);
    }, [units]);
    const formatLength = (valueMm: number, decimals = 2) =>
        `${displayValue(valueMm, units, decimals)}${lengthUnit(units)}`;
    const [status, setStatus] = useState('Import a DXF or SVG to begin.');
    const [offsetAmount, setOffsetAmount] = useState(3);
    const [sheetW, setSheetW] = useState(300);
    const [sheetH, setSheetH] = useState(300);
    const [nestBorder, setNestBorder] = useState(5);
    const [nestSpacing, setNestSpacing] = useState(5);
    const [cornerRadius, setCornerRadius] = useState(3);
    const [cornerTool, setCornerTool] = useState<'fillet' | 'dogbone' | null>(null);
    const [moveX, setMoveX] = useState(10);
    const [moveY, setMoveY] = useState(0);
    const [rotateDeg, setRotateDeg] = useState(90);
    const [sizeW, setSizeW] = useState(0);
    const [sizeH, setSizeH] = useState(0);
    const [aspectLock, setAspectLock] = useState(true);
    // Direct-manipulation transform mode (camcanvas transform tool).
    const [transformMode, setTransformMode] = useState<TransformMode | null>(
        null,
    );
    const moveAfterCloneRef = useRef(false);
    const [fileName, setFileName] = useState('');
    const [historyVersion, setHistoryVersion] = useState(0);
    void historyVersion;
    // Toolpath being edited back in the form (legacy edit flow).
    const [editingId, setEditingId] = useState<string | null>(null);
    const { toasts, showToast, dismiss: dismissToast } = useToasts();
    const { confirm, dialog: confirmDialog } = useConfirmation();
    // Live dashed draft preview from the toolpath form (not yet committed).
    const [draftPreview, setDraftPreview] = useState<
        { x: number; y: number }[][]
    >([]);
    // Offset expand preview (legacy expand modal preview).
    const [offsetPreview, setOffsetPreview] = useState<
        { x: number; y: number }[][]
    >([]);
    const [booleanPreview, setBooleanPreview] = useState<
        { x: number; y: number }[][]
    >([]);
    // Declared before offsetSource: its useMemo factory calls selectedLoops()
    // during render, and a const declared later would be in TDZ (crashed on
    // first selection with "Cannot access 'selectedLoops' before initialization").
    const expandedSelectedIds = () =>
        expandGroupedSelection(loops, selected);
    const selectedLoops = (): ViewLoop[] => {
        const byId = new Map(loops.map((l) => [l.id, l]));
        const hide = new Set(hidden);
        return expandedSelectedIds().flatMap((id) => {
            const loop = byId.get(id);
            if (!loop || hide.has(id)) return [];
            if (!Array.isArray(loop.points)) return [];
            return [loop];
        });
    };
    const offsetSource = useMemo(
        () => (selected.length > 0 ? selectedLoops() : loops),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [loops, selected, hidden],
    );
    // Worker progress for the live draft (pill near cursor).
    const [draftProgress, setDraftProgress] = useState<{
        percent: number;
        label: string;
    } | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);
    const projectRef = useRef<HTMLInputElement>(null);

    interface Snapshot {
        loops: ViewLoop[];
        selected: string[];
        hidden: string[];
        stack: StackEntry[];
        bitmaps: PlacedBitmap[];
        guides: Guide[];
    }
    const historyRef = useRef(createHistory<Snapshot>(60));
    const stateRef = useRef({
        loops,
        selected,
        hidden,
        stack,
        bitmaps,
        guides,
    });
    stateRef.current = { loops, selected, hidden, stack, bitmaps, guides };

    const pushHistory = () => {
        pushHistoryLib(historyRef.current, stateRef.current);
        setHistoryVersion((v) => v + 1);
    };

    const restore = (snap: Snapshot) => {
        setLoops(snap.loops);
        setSelected(snap.selected);
        setHidden(snap.hidden ?? []);
        setStack(snap.stack);
        setBitmaps(snap.bitmaps ?? []);
        setGuides(snap.guides ?? []);
        setBounds(loopBounds(snap.loops));
    };

    // Rehydrate bitmap images after undo (Image elements don't survive JSON).
    useEffect(() => {
        let cancelled = false;
        for (const bm of bitmaps) {
            if (bm.img instanceof HTMLImageElement) continue;
            const img = new Image();
            img.onload = () => {
                if (cancelled) return;
                setBitmaps((prev) =>
                    prev.map((p) => (p.id === bm.id ? { ...p, img } : p)),
                );
            };
            img.src = bm.dataUrl;
        }
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        bitmaps
            .map((b) => `${b.id}:${b.img instanceof HTMLImageElement}`)
            .join(','),
    ]);

    const undo = () => {
        const snap = undoHistoryLib(historyRef.current, stateRef.current);
        if (!snap) return;
        restore(snap);
        setHistoryVersion((v) => v + 1);
        setStatus('Undone.');
    };

    const redo = () => {
        const snap = redoHistoryLib(historyRef.current, stateRef.current);
        if (!snap) return;
        restore(snap);
        setHistoryVersion((v) => v + 1);
        setStatus('Redone.');
    };
    // historyVersion bumps every push/undo/redo so header buttons refresh.
    const canUndo = historyVersion >= 0 && historyRef.current.undo.length > 0;
    const canRedo = historyVersion >= 0 && historyRef.current.redo.length > 0;

    const newLoopId = () => `loop-${nextId++}`;
    const withIds = (
        items: { points: { x: number; y: number }[] }[],
    ): ViewLoop[] => items.map((item) => ({ id: newLoopId(), ...item }));

    // Axis-aligned selection frame (camcanvas selection frame). Drives the
    // absolute Position/Angle/Size transform fields.
    const selectionFrame = useMemo(() => {
        const pts = selectedLoops().flatMap((l) =>
            Array.isArray(l.points) ? l.points : [],
        );
        if (!pts.length) return null;
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        for (const p of pts) {
            if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
            if (p.x < minX) minX = p.x;
            if (p.y < minY) minY = p.y;
            if (p.x > maxX) maxX = p.x;
            if (p.y > maxY) maxY = p.y;
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
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loops, selected, hidden]);

    // Tracked orientation for the absolute Angle field (resets per selection).
    const orientRef = useRef<{ key: string; angle: number }>({
        key: '',
        angle: 0,
    });
    const selectionKey = selected.join(',');
    if (orientRef.current.key !== selectionKey) {
        orientRef.current = { key: selectionKey, angle: 0 };
    }

    // Sync absolute transform fields from the selection frame.
    useEffect(() => {
        if (!selectionFrame) return;
        const r2 = (v: number) => Math.round(v * 100) / 100;
        setMoveX(r2(selectionFrame.cx));
        setMoveY(r2(selectionFrame.cy));
        setSizeW(r2(selectionFrame.w));
        setSizeH(r2(selectionFrame.h));
        setRotateDeg(Math.round(orientRef.current.angle * 10) / 10);
    }, [selectionFrame]);

    const handleFiles = async (files: FileList | File[] | null) => {
        const file = files?.[0];
        if (!file) return;
        if (isBitmapFile(file)) {
            await handleBitmapFile(file);
            return;
        }
        try {
            const result = await importVectorFile(file);
            pushHistory();
            const stamped: ViewLoop[] = result.loops.map((l) => ({
                ...l,
                id: l.id ?? `loop-${nextId++}`,
            }));
            setLoops(stamped);
            setBounds(result.bounds);
            setSelected([]);
            setStack([]);
            setFileName(result.fileName);
            setStatus(
                `${result.fileName}: ${result.entityCount} entities → ${result.loops.length} vectors`,
            );
        } catch (e) {
            setStatus(e instanceof Error ? e.message : 'Import failed');
        }
    };

    const handleBitmapFile = async (file: File) => {
        try {
            const { dataUrl, pixelW, pixelH } = await loadBitmapFile(file);
            const cx = bounds ? (bounds.minX + bounds.maxX) / 2 : 50;
            const cy = bounds ? (bounds.minY + bounds.maxY) / 2 : 50;
            const placed = placeBitmap(pixelW, pixelH, cx, cy);
            const img = new Image();
            await new Promise<void>((resolve, reject) => {
                img.onload = () => resolve();
                img.onerror = () =>
                    reject(new Error('Could not decode image.'));
                img.src = dataUrl;
            });
            pushHistory();
            const entry: PlacedBitmap = {
                id: `bm-${nextId++}`,
                x: placed.x,
                y: placed.y,
                w: placed.wMm,
                h: placed.hMm,
                dataUrl,
                img,
            };
            const rect: ViewLoop = {
                id: newLoopId(),
                bitmapId: entry.id,
                points: [
                    { x: placed.x, y: placed.y },
                    { x: placed.x + placed.wMm, y: placed.y },
                    { x: placed.x + placed.wMm, y: placed.y + placed.hMm },
                    { x: placed.x, y: placed.y + placed.hMm },
                    { x: placed.x, y: placed.y },
                ],
            };
            setBitmaps((prev) => [...prev, entry]);
            setLoops((prev) => {
                const next = [...prev, rect];
                setSelected([rect.id]);
                setStack([]);
                refreshBounds(next);
                return next;
            });
            setFileName(file.name);
            setStatus(`Bitmap ${file.name} placed — use Trace in the toolbar to vectorize it.`);
        } catch (e) {
            setStatus(e instanceof Error ? e.message : 'Bitmap load failed');
        }
    };

    const handleResult = (r: ToolpathResult, args: ProfileArgs) => {
        pushHistory();
        // Bitmap pixels never persist: results carry the built output.
        const { bitmap, ...persisted } = args as ProfileArgs & {
            bitmap?: unknown;
        };
        void bitmap;
        const finish = (
            label: string,
            previewContours: { x: number; y: number }[][],
            toolpath: Record<string, unknown>,
            tabs: PlacedTab[],
        ) => {
            setStack((prev) => [
                ...prev,
                {
                    id: `tp-${nextId++}`,
                    label,
                    args: { ...persisted, tabs },
                    preview: previewContours.map((points) => ({ points })),
                    toolpath,
                },
            ]);
            setDraftPreview([]);
            setDraftProgress(null);
            setStatus(`${label} added (${stack.length + 1} toolpaths).`);
            showToast('Toolpath added. Use Ctrl+Z to undo.', 'success', 2200);
        };
        // camcanvas parity: profiles get automatic holding tabs on commit.
        if (
            operationUsesTabs(args.operation) &&
            !(args.tabs as PlacedTab[] | undefined)?.length
        ) {
            const defaults = defaultTabsForContours(r.previewContours);
            if (!defaults.length) {
                finish(r.label, r.previewContours, r.toolpath, []);
                return;
            }
            setStatus('Adding automatic tabs…');
            buildToolpathGcode({
                ...persisted,
                tabs: defaults,
            } as ProfileArgs).then(
                (withTabs) => {
                    finish(
                        withTabs.label,
                        withTabs.previewContours,
                        withTabs.toolpath,
                        defaults,
                    );
                },
                () => finish(r.label, r.previewContours, r.toolpath, []),
            );
            return;
        }
        finish(r.label, r.previewContours, r.toolpath, []);
    };

    /** Replace one stack entry from an edit-form save. */
    const handleUpdateResult = (
        id: string,
        r: ToolpathResult,
        args: ProfileArgs,
    ) => {
        pushHistory();
        const { bitmap, ...persisted } = args as ProfileArgs & {
            bitmap?: unknown;
        };
        void bitmap;
        setStack((prev) =>
            prev.map((s) =>
                s.id === id
                    ? {
                          ...s,
                          args: { ...persisted },
                          label: r.label,
                          preview: r.previewContours.map((points) => ({
                              points,
                          })),
                          toolpath: r.toolpath,
                      }
                    : s,
            ),
        );
        setEditingId(null);
        setDraftPreview([]);
        setDraftProgress(null);
        setStatus(`${r.label} updated.`);
    };
    /** Rebuild one stack entry with a new tab set (place/Auto/Clear). */
    const rebuildEntryTabs = (entryId: string, tabs: PlacedTab[]) => {
        const entry = stack.find((s) => s.id === entryId);
        if (!entry) return;
        setStatus('Updating tabs…');
        pushHistory();
        buildToolpathGcode({ ...entry.args, tabs }).then(
            (r) => {
                setStack((prev) =>
                    prev.map((s) =>
                        s.id === entryId
                            ? {
                                  ...s,
                                  args: { ...entry.args, tabs },
                                  label: r.label,
                                  preview: r.previewContours.map((points) => ({
                                      points,
                                  })),
                                  toolpath: r.toolpath,
                              }
                            : s,
                    ),
                );
                setStatus(
                    tabs.length
                        ? `Tabs updated (${tabs.length} on ${entry.label}).`
                        : `Tabs cleared on ${entry.label}.`,
                );
            },
            (e) =>
                setStatus(
                    e instanceof Error ? e.message : 'Could not update tabs',
                ),
        );
    };

    const handlePlaceTab = (
        entryId: string,
        contourIndex: number,
        along: number,
    ) => {
        const entry = stack.find((s) => s.id === entryId);
        if (!entry) return;
        if (
            entry.args.operation !== 'profile-outside' &&
            entry.args.operation !== 'profile-inside' &&
            entry.args.operation !== 'laser-cut'
        ) {
            setStatus('Tabs are for profile and laser-cut paths.');
            return;
        }
        const tabs: PlacedTab[] = [
            ...((entry.args.tabs as PlacedTab[] | undefined) ?? []),
            { contourIndex, along },
        ];
        rebuildEntryTabs(entryId, tabs);
    };
    const handleMoveTab = (entryId: string, tabIndex: number, along: number) => {
        const entry = stack.find((s) => s.id === entryId);
        if (!entry) return;
        const tabs = [...((entry.args.tabs as PlacedTab[] | undefined) ?? [])];
        if (!tabs[tabIndex]) return;
        tabs[tabIndex] = { ...tabs[tabIndex], along };
        rebuildEntryTabs(entryId, tabs);
    };
    const handleDeleteTab = (entryId: string, tabIndex: number) => {
        const entry = stack.find((s) => s.id === entryId);
        if (!entry) return;
        const tabs = [...((entry.args.tabs as PlacedTab[] | undefined) ?? [])];
        if (!tabs[tabIndex]) return;
        tabs.splice(tabIndex, 1);
        rebuildEntryTabs(entryId, tabs);
    };

    const traceTarget =
        selected.length === 1 ? (selectedLoops()[0]?.bitmapId ?? null) : null;
    const traceBitmap = bitmaps.find((b) => b.id === traceTarget) ?? null;
    const traceImg = traceBitmap?.img ?? null;
    const [traceOpen, setTraceOpen] = useState(false);

    // CAD inspector target: exactly one visible vector selected.
    const inspectorLoop =
        selected.length === 1 ? (selectedLoops()[0] ?? null) : null;
    const showInspector =
        inspectorLoop !== null &&
        Array.isArray(inspectorLoop.points) &&
        inspectorLoop.points.length > 0 &&
        !inspectorLoop.bitmapId &&
        inspectorLoop.id !== inspectorDismissed &&
        // Direct transform mode owns the canvas interaction and handles;
        // keep the inspector out of the way until that mode is finished.
        transformMode === null;

    const buildInspectorPreview = (patch: InspectorPatch) => {
        if (!inspectorLoop) return null;
        const xs = inspectorLoop.points.map((p) => p.x);
        const ys = inspectorLoop.points.map((p) => p.y);
        const minX = Math.min(...xs);
        const minY = Math.min(...ys);
        const bw = Math.max(...xs) - minX;
        const bh = Math.max(...ys) - minY;
        const isCircle = inspectorLoop.sourceType === 'circle' || inspectorLoop.exportGeometry?.type === 'circle';
        const isPolygon = inspectorLoop.sourceType === 'polygon';
        const targetWidth = (isCircle || isPolygon) && patch.radius && patch.radius > 0
            ? patch.radius * 2
            : patch.w;
        const targetHeight = (isCircle || isPolygon) && patch.radius && patch.radius > 0
            ? patch.radius * 2
            : patch.h;
        if (!(targetWidth > 0) || !(targetHeight > 0)) return null;
        const basePoints = isPolygon && patch.sides && patch.sides >= 3
            ? (() => {
                  const maxX = Math.max(...xs);
                  const maxY = Math.max(...ys);
                  const centerX = (minX + maxX) / 2;
                  const centerY = (minY + maxY) / 2;
                  const count = Math.round(patch.sides);
                  const polygonRadius = patch.polygonMode === 'circumscribed'
                      ? (Math.min(bw, bh) / 2) / Math.cos(Math.PI / count)
                      : Math.min(bw, bh) / 2;
                  const start = Math.atan2(
                      inspectorLoop.points[0].y - centerY,
                      inspectorLoop.points[0].x - centerX,
                  );
                  return Array.from({ length: count + 1 }, (_, index) => {
                      const a = start + (index / count) * Math.PI * 2;
                      return { x: centerX + Math.cos(a) * polygonRadius, y: centerY + Math.sin(a) * polygonRadius };
                  });
              })()
            : inspectorLoop.points;
        const moved = basePoints.map((p) => ({ x: p.x + (patch.x - minX), y: p.y + (patch.y - minY) }));
        const scaled = bw > 0 && bh > 0
            ? scalePointsXY(moved, targetWidth / bw, targetHeight / bh, { x: patch.x, y: patch.y })
            : moved;
        const delta = patch.angle - orientRef.current.angle;
        const finalPts = Math.abs(delta) > 1e-9
            ? rotatePoints(scaled, delta, { x: patch.x + targetWidth / 2, y: patch.y + targetHeight / 2 })
            : scaled;
        return { id: inspectorLoop.id, points: finalPts };
    };

    const handleInspectorApply = async (patch: {
        x: number;
        y: number;
        w: number;
        h: number;
        angle: number;
        radius?: number;
        sides?: number;
        polygonMode?: 'inscribed' | 'circumscribed';
        text?: string;
        fontId?: string;
        fontSize?: number;
    }) => {
        if (!inspectorLoop) return;
        setInspectorPreview(null);
        const xs = inspectorLoop.points.map((p) => p.x);
        const ys = inspectorLoop.points.map((p) => p.y);
        const minX = Math.min(...xs);
        const minY = Math.min(...ys);
        const bw = Math.max(...xs) - minX;
        const bh = Math.max(...ys) - minY;
        const isCircle = inspectorLoop.sourceType === 'circle' || inspectorLoop.exportGeometry?.type === 'circle';
        const isPolygon = inspectorLoop.sourceType === 'polygon';
        const targetWidth = (isCircle || isPolygon) && patch.radius && patch.radius > 0 ? patch.radius * 2 : patch.w;
        const targetHeight = (isCircle || isPolygon) && patch.radius && patch.radius > 0 ? patch.radius * 2 : patch.h;
        if (!(targetWidth > 0) || !(targetHeight > 0)) {
            setStatus('Width and height must be positive.');
            return;
        }
        if (inspectorLoop.sourceType === 'text' && patch.text && patch.fontId && patch.fontSize) {
            try {
                const origin = { x: patch.x, y: patch.y };
                const replacement = patch.fontId === 'single-line'
                    ? textLoops(patch.text, origin, patch.fontSize)
                    : await outlineTextLoops(patch.text, origin, patch.fontSize, patch.fontId);
                if (!replacement.length) return;
                pushHistory();
                const id = inspectorLoop.id;
                setLoops((prev) => {
                    const replacementLoops = replacement.map((item, index) => ({
                        ...item,
                        id: index === 0 ? id : `loop-${nextId++}`,
                        sourceType: 'text',
                        text: patch.text,
                        fontId: patch.fontId,
                        fontSize: patch.fontSize,
                    }));
                    const next = [...prev.filter((loop) => loop.id !== id), ...replacementLoops];
                    setSelected(replacementLoops.map((loop) => loop.id));
                    setStack([]);
                    refreshBounds(next);
                    return next;
                });
                setStatus('Text updated.');
                return;
            } catch (error) {
                setStatus(error instanceof Error ? error.message : 'Could not update text.');
                return;
            }
        }
        pushHistory();
        const basePoints = isPolygon && patch.sides && patch.sides >= 3
            ? (() => {
                  const maxX = Math.max(...xs);
                  const maxY = Math.max(...ys);
                  const centerX = (minX + maxX) / 2;
                  const centerY = (minY + maxY) / 2;
                  const polygonRadius = patch.polygonMode === 'circumscribed'
                      ? (Math.min(bw, bh) / 2) / Math.cos(Math.PI / Math.round(patch.sides))
                      : Math.min(bw, bh) / 2;
                  const count = Math.round(patch.sides);
                  const start = Math.atan2(
                      inspectorLoop.points[0].y - centerY,
                      inspectorLoop.points[0].x - centerX,
                  );
                  return Array.from({ length: count + 1 }, (_, index) => {
                      const angle = start + (index / count) * Math.PI * 2;
                      return {
                          x: centerX + Math.cos(angle) * polygonRadius,
                          y: centerY + Math.sin(angle) * polygonRadius,
                      };
                  });
              })()
            : inspectorLoop.points;
        const moved = basePoints.map((p) => ({
            x: p.x + (patch.x - minX),
            y: p.y + (patch.y - minY),
        }));
        const scaled =
            bw > 0 && bh > 0
                ? scalePointsXY(moved, targetWidth / bw, targetHeight / bh, {
                      x: patch.x,
                      y: patch.y,
                  })
                : moved;
        const delta = patch.angle - orientRef.current.angle;
        const cx = patch.x + targetWidth / 2;
        const cy = patch.y + targetHeight / 2;
        const finalPts =
            Math.abs(delta) > 1e-9
                ? rotatePoints(scaled, delta, { x: cx, y: cy })
                : scaled;
        orientRef.current.angle = patch.angle;
        const id = inspectorLoop.id;
        setLoops((prev) => {
            const next = prev.map((l) =>
                l.id === id
                    ? {
                          ...l,
                          points: finalPts,
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
                    : l,
            );
            setStack([]);
            setDraftPreview([]);
            refreshBounds(next);
            return next;
        });
        setStatus('Shape updated.');
    };

    useEffect(() => {
        setInspectorDismissed(null);
    }, [selected]);

    const [loadingSample, setLoadingSample] = useState(false);
    const handleLoadSample = async () => {
        setLoadingSample(true);
        setStatus('Loading sample vector…');
        try {
            const response = await fetch('samples/Hockey Sticks Cut 1.dxf');
            if (!response.ok) throw new Error('Sample not found.');
            const text = await response.text();
            const file = new File([text], 'Hockey Sticks Cut 1.dxf', {
                type: 'application/dxf',
            });
            await handleFiles([file]);
        } catch (e) {
            setStatus(
                e instanceof Error ? e.message : 'Could not load sample.',
            );
        } finally {
            setLoadingSample(false);
        }
    };

    const commitTraced = (traced: { points: { x: number; y: number }[] }[]) => {
        if (!traced.length) {
            setStatus('Trace found no shapes — try a darker image.');
            return;
        }
        pushHistory();
        const stamped = withIds(traced);
        setLoops((prev) => {
            const next = [...prev, ...stamped];
            setSelected(stamped.map((l) => l.id));
            setStack([]);
            setDraftPreview([]);
            refreshBounds(next);
            return next;
        });
        setStatus(`Traced ${traced.length} vectors.`);
    };

    const handleFillet = () => {
        if (!(cornerRadius > 0)) return;
        setCornerTool('fillet');
        setTransformMode(null);
        setCornerTool(null);
        setStatus(`Fillet r=${formatLength(cornerRadius)}: hover a corner, then click to apply.`);
    };

    const handleCorner = (loopId: string, cornerIndex: number) => {
        if (!(cornerRadius > 0)) return;
        const target = loops.find((loop) => loop.id === loopId);
        if (!target) return;
        const points = cornerTool === 'dogbone'
            ? dogboneCorner(target.points, cornerIndex, cornerRadius)
            : filletCorner(target.points, cornerIndex, cornerRadius);
        if (!points) {
            setStatus('That corner cannot fit the selected radius.');
            return;
        }
        pushHistory();
        if (cornerTool === 'dogbone') {
            const stamped = withIds([{ points }]);
            setLoops((current) => {
                const next = [...current, ...stamped];
                setStack([]);
                refreshBounds(next);
                return next;
            });
            setSelected(stamped.map((loop) => loop.id));
            setStatus(`Dogbone r=${formatLength(cornerRadius)} added.`);
        } else {
            setLoops((current) => current.map((loop) => loop.id === loopId ? { ...loop, points } : loop));
            setSelected([loopId]);
            setStatus(`Fillet r=${formatLength(cornerRadius)} applied.`);
        }
        setCornerTool(null);
    };

    const handleChamfer = () => {
        const targets = selectedLoops();
        if (!targets.length || !(cornerRadius > 0)) return;
        const results = targets.flatMap((loop) => {
            const out = chamferLoop(loop.points, cornerRadius);
            return out.length === loop.points.length ? [] : [{ points: out }];
        });
        if (!results.length) {
            setStatus('No two-straight-edge corner fits that distance.');
            return;
        }
        replaceSelection(
            results,
            `Chamfer ${formatLength(cornerRadius)} on ${results.length} shape${results.length === 1 ? '' : 's'}.`,
        );
    };

    const handleDogbone = () => {
        setCornerTool('dogbone');
        setTransformMode(null);
        setStatus(`Dogbone r=${formatLength(cornerRadius)}: hover a corner, then click to apply.`);
    };

    const applyAbsoluteMove = () => {
        if (!selectionFrame) return;
        const dx = moveX - selectionFrame.cx;
        const dy = moveY - selectionFrame.cy;
        applyTransform(
            (pts) => translatePoints(pts, dx, dy),
            `Moved to ${formatLength(moveX)}, ${formatLength(moveY)}.`,
        );
    };
    const applyAbsoluteRotate = () => {
        if (!selectionFrame) return;
        const delta = rotateDeg - orientRef.current.angle;
        const c = { x: selectionFrame.cx, y: selectionFrame.cy };
        applyTransform(
            (pts) => rotatePoints(pts, delta, c),
            `Rotated to ${rotateDeg}°.`,
        );
        orientRef.current.angle = rotateDeg;
    };
    const applyAbsoluteSize = () => {
        if (
            !selectionFrame ||
            !(selectionFrame.w > 0) ||
            !(selectionFrame.h > 0)
        )
            return;
        const fw = sizeW / selectionFrame.w;
        const fh = aspectLock ? fw : sizeH / selectionFrame.h;
        if (!(fw > 0) || !(fh > 0)) {
            setStatus('Size must be positive.');
            return;
        }
        const c = { x: selectionFrame.cx, y: selectionFrame.cy };
        applyTransform(
            (pts) => scalePointsXY(pts, fw, fh, c),
            `Resized to ${formatLength(sizeW)} × ${formatLength(sizeH)}.`,
        );
    };
    const setSizeWLocked = (v: number) => {
        setSizeW(v);
        if (aspectLock && selectionFrame && selectionFrame.w > 0) {
            setSizeH(
                Math.round(v * (selectionFrame.h / selectionFrame.w) * 100) /
                    100,
            );
        }
    };
    const setSizeHLocked = (v: number) => {
        setSizeH(v);
        if (aspectLock && selectionFrame && selectionFrame.h > 0) {
            setSizeW(
                Math.round(v * (selectionFrame.w / selectionFrame.h) * 100) /
                    100,
            );
        }
    };
    const applyTransform = (
        fn: (points: { x: number; y: number }[]) => {
            x: number;
            y: number;
        }[],
        note: string,
    ) => {
        const targets = selectedLoops();
        if (!targets.length) return;
        try {
            const ids = new Set(targets.map((t) => t.id));
            pushHistory();
            setLoops((prev) => {
                const next = prev.map((l) =>
                    ids.has(l.id) ? { ...l, points: fn(l.points) } : l,
                );
                setStack([]);
                setDraftPreview([]);
                refreshBounds(next);
                return next;
            });
            setTransformMode(null);
            setStatus(note);
        } catch (e) {
            setStatus(e instanceof Error ? e.message : 'Transform failed');
        }
    };

    /** Commit a canvas direct-manipulation drag (null = cancelled). */
    const handleTransformCommit = (t: TransformCommit | null) => {
        setTransformMode(null);
        if (!t) return;
        const targets = selectedLoops();
        if (!targets.length) return;
        try {
            const ids = new Set(targets.map((x) => x.id));
            const bitmapIds = new Set(
                targets.flatMap((target) =>
                    target.bitmapId ? [target.bitmapId] : [],
                ),
            );
            const fn =
                t.type === 'move'
                    ? (pts: { x: number; y: number }[]) =>
                          translatePoints(pts, t.dx, t.dy)
                    : t.type === 'rotate'
                      ? (pts: { x: number; y: number }[]) =>
                            rotatePoints(pts, t.degrees, t.about)
                      : (pts: { x: number; y: number }[]) =>
                            scalePoints(pts, t.factor, t.about);
            if (t.type === 'rotate') {
                orientRef.current.angle += t.degrees;
                setRotateDeg(Math.round(orientRef.current.angle * 10) / 10);
            }
            pushHistory();
            setPreserveViewToken((token) => token + 1);
            if (bitmapIds.size) {
                setBitmaps((prev) =>
                    prev.map((bitmap) => {
                        if (!bitmapIds.has(bitmap.id)) return bitmap;
                        const angle = bitmap.rotation ?? 0;
                        const center = {
                            x: bitmap.x + bitmap.w / 2,
                            y: bitmap.y + bitmap.h / 2,
                        };
                        if (t.type === 'move') {
                            return {
                                ...bitmap,
                                x: bitmap.x + t.dx,
                                y: bitmap.y + t.dy,
                            };
                        }
                        if (t.type === 'scale') {
                            const scaledCenter = {
                                x: t.about.x + (center.x - t.about.x) * t.factor,
                                y: t.about.y + (center.y - t.about.y) * t.factor,
                            };
                            const w = bitmap.w * t.factor;
                            const h = bitmap.h * t.factor;
                            return {
                                ...bitmap,
                                x: scaledCenter.x - w / 2,
                                y: scaledCenter.y - h / 2,
                                w,
                                h,
                            };
                        }
                        const radians = (t.degrees * Math.PI) / 180;
                        const dx = center.x - t.about.x;
                        const dy = center.y - t.about.y;
                        const rotatedCenter = {
                            x: t.about.x + dx * Math.cos(radians) - dy * Math.sin(radians),
                            y: t.about.y + dx * Math.sin(radians) + dy * Math.cos(radians),
                        };
                        return {
                            ...bitmap,
                            x: rotatedCenter.x - bitmap.w / 2,
                            y: rotatedCenter.y - bitmap.h / 2,
                            rotation: angle + t.degrees,
                        };
                    }),
                );
            }
            setLoops((prev) => {
                const next = prev.map((l) =>
                    ids.has(l.id) ? { ...l, points: fn(l.points) } : l,
                );
                setStack([]);
                setDraftPreview([]);
                refreshBounds(next);
                return next;
            });
            setStatus(
                t.type === 'move'
                    ? `Moved ${formatLength(t.dx)}, ${formatLength(t.dy)}.`
                    : t.type === 'rotate'
                      ? `Rotated ${t.degrees.toFixed(1)}°.`
                      : `Scaled ×${t.factor.toFixed(3)}.`,
            );
        } catch (e) {
            setStatus(e instanceof Error ? e.message : 'Transform failed');
        }
    };

    const startGuidePlacement = (axis: 'x' | 'y') => {
        setGuidePlacement(axis);
        setStatus(`Click the canvas to place a ${axis === 'x' ? 'vertical' : 'horizontal'} guide. Press Esc to cancel.`);
    };

    const placeGuide = (axis: 'x' | 'y', position: number) => {
        pushHistory();
        const pos = Math.round(position * 10) / 10;
        setGuides((prev) => [...prev, { id: `guide-${nextId++}`, axis, pos }]);
        setGuidePlacement(null);
        setStatus(`Guide added at ${axis}=${formatLength(pos)}.`);
    };

    const handleNest = () => {
        const targets = selected.length > 0 ? selectedLoops() : loops;
        if (!targets.length) return;

        // A grouped object is one nesting part. Keep every contour in the
        // group together so counters (for example the inside of O/P) retain
        // their relationship to the outside contour during placement.
        const units = buildNestUnits(targets);
        const { placements, failedIndex } = nestPlacements(
            units,
            sheetW,
            sheetH,
            nestBorder,
            nestSpacing,
        );
        if (failedIndex != null) {
            setStatus(`Part ${failedIndex + 1} does not fit on this sheet.`);
            return;
        }
        const nested = units.flatMap((unit, k) =>
            unit.loops.map((loop) => ({
                id: newLoopId(),
                ...(unit.groupId ? { groupId: unit.groupId } : {}),
                points: loop.points.map((p) => ({
                    x: p.x - unit.minX + placements[k].dx,
                    y: p.y - unit.minY + placements[k].dy,
                })),
            })),
        );
        pushHistory();
        if (selected.length > 0) {
            const gone = new Set(expandedSelectedIds());
            const kept = loops.filter((l) => !gone.has(l.id));
            const next = [...kept, ...nested];
            setLoops(next);
            setSelected(nested.map((l) => l.id));
            setStack([]);
            refreshBounds(next);
            setStatus(
                `Nested ${units.length} part${units.length === 1 ? '' : 's'} on ${formatLength(sheetW)} × ${formatLength(sheetH)}.`,
            );
        } else {
            setLoops(nested);
            setSelected(nested.map((l) => l.id));
            setStack([]);
            refreshBounds(nested);
            setStatus(
                `Nested ${units.length} part${units.length === 1 ? '' : 's'} on ${formatLength(sheetW)} × ${formatLength(sheetH)}.`,
            );
        }
    };
    const replaceSelection = (
        items: { points: { x: number; y: number }[] }[],
        note: string,
    ) => {
        pushHistory();
        const results = withIds(items);
        const gone = new Set(expandedSelectedIds());
        const kept = loops.filter((l) => !gone.has(l.id));
        const next = [...kept, ...results];
        setLoops(next);
        setSelected(results.map((l) => l.id));
        setStack([]);
        setDraftPreview([]);
        setOffsetPreview([]);
        refreshBounds(next);
        setStatus(note);
    };

    const handleBoolean = (operation: BooleanOperation) => {
        if (selected.length < 2) return;
        try {
            const inputs = selectedLoops();
            const results = applyBoolean(inputs, operation);
            replaceSelection(
                results,
                `${operation}: ${inputs.length} vectors → ${results.length} shape${results.length === 1 ? '' : 's'}.`,
            );
        } catch (e) {
            setStatus(e instanceof Error ? e.message : 'Boolean failed');
        }
    };

    const handleOffset = () => {
        const targets = selected.length > 0 ? selectedLoops() : loops;
        if (!targets.length) return;
        try {
            const results = offsetLoops(targets, offsetAmount);
            pushHistory();
            const stamped = withIds(results);
            const next = [...loops, ...stamped];
            setLoops(next);
            setSelected(stamped.map((l) => l.id));
            setStack([]);
            setDraftPreview([]);
            setOffsetPreview([]);
            refreshBounds(next);
            setStatus(
                `Offset ${formatLength(offsetAmount)} added ${results.length} shape${results.length === 1 ? '' : 's'}.`,
            );
        } catch (e) {
            setStatus(e instanceof Error ? e.message : 'Offset failed');
        }
    };

    const handleExportProject = () => {
        if (!loops.length && !stack.length) {
            setStatus('Nothing to export — import or draw something first.');
            return;
        }
        const raw = serializeProject({
            loops,
            selected,
            hidden,
            stack,
            bitmaps: bitmaps.map(({ img, ...rest }) => rest),
            guides,
            fileName,
        });
        const base = (fileName || 'project').replace(/\.[^.]+$/, '');
        const blob = new Blob([raw], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${base}.gcam.json`;
        a.click();
        URL.revokeObjectURL(url);
        setStatus(`Exported ${base}.gcam.json.`);
    };

    const handleImportProject = async (files: FileList | null) => {
        const file = files?.[0];
        if (!file) return;
        try {
            const text = await file.text();
            const snap = deserializeProject(text);
            pushHistory();
            const withLoopIds = (snap.loops ?? []).map((l) => ({
                ...l,
                id: l.id ?? `loop-${nextId++}`,
            }));
            setLoops(withLoopIds);
            setSelected(
                snap.selected.filter((id) =>
                    withLoopIds.some((l) => l.id === id),
                ),
            );
            setHidden(snap.hidden ?? []);
            setStack(snap.stack as StackEntry[]);
            setBitmaps(snap.bitmaps ?? []);
            setGuides(snap.guides ?? []);
            setFileName(snap.fileName);
            setBounds(loopBounds(withLoopIds));
            setStatus(`Loaded ${file.name}.`);
        } catch (e) {
            setStatus(e instanceof Error ? e.message : 'Could not load');
        }
    };

    const handleCommitLoop = (points: { x: number; y: number }[], meta?: LoopMeta) => {
        pushHistory();
        const snapped = points.map((p) => snapToGuides(p, guides));
        const loop: ViewLoop = { id: newLoopId(), points: snapped, ...meta };
        setLoops((prev) => {
            const next = [...prev, loop];
            setSelected([loop.id]);
            setStack([]);
            refreshBounds(next);
            return next;
        });
        setStatus(`Drew ${drawTool} (${points.length} points).`);
    };

    const handleTrimAt = (point: { x: number; y: number }) => {
        const candidates = loops.filter((loop) => selected.length === 0 || selected.includes(loop.id));
        const bitmapTarget = candidates.find((loop) => loop.bitmapId);
        if (bitmapTarget) {
            setStatus('Trim not available for bitmaps.');
            return;
        }
        let hit: { id: string; result: ReturnType<typeof trimNearestSegment> } | null = null;
        for (const loop of candidates) {
            const result = trimNearestSegment(loop.points, point, 8);
            if (result && (!hit || result.distance < hit.result!.distance)) hit = { id: loop.id, result };
        }
        if (!hit?.result) {
            setStatus('Click a vector segment to trim it.');
            return;
        }
        pushHistory();
        const result = hit.result;
        setLoops((prev) => {
            const next = prev.flatMap((loop) => {
                if (loop.id !== hit!.id) return [loop];
                const replacements = [result.before, result.after]
                    .filter((points) => points.length >= 2)
                    .map((points) => ({ ...loop, id: newLoopId(), points }));
                return replacements;
            });
            setSelected(selected.filter((id) => id !== hit!.id));
            setStack([]);
            refreshBounds(next);
            return next;
        });
        setStatus('Trimmed vector segment.');
    };

    const handleTrimStroke = (points: { x: number; y: number }[]) => {
        const candidates = loops.filter((loop) => selected.length === 0 || selected.includes(loop.id));
        if (candidates.some((loop) => loop.bitmapId)) {
            setStatus('Trim not available for bitmaps.');
            return;
        }
        const hits = new Map<string, ReturnType<typeof trimNearestSegment>>();
        for (const point of points) {
            let best: { id: string; result: ReturnType<typeof trimNearestSegment> } | null = null;
            for (const loop of candidates) {
                if (hits.has(loop.id)) continue;
                const result = trimNearestSegment(loop.points, point, 8);
                if (result && (!best || result.distance < best.result!.distance)) best = { id: loop.id, result };
            }
            if (best?.result) hits.set(best.id, best.result);
        }
        if (!hits.size) {
            setStatus('Hold Ctrl and drag across vector segments to trim them.');
            return;
        }
        pushHistory();
        setLoops((prev) => {
            const next = prev.flatMap((loop) => {
                const result = hits.get(loop.id);
                if (!result) return [loop];
                return [result.before, result.after]
                    .filter((shape) => shape.length >= 2)
                    .map((shape) => ({ ...loop, id: newLoopId(), points: shape }));
            });
            setSelected([]);
            setStack([]);
            refreshBounds(next);
            return next;
        });
        setStatus(`Trimmed ${hits.size} vector segment${hits.size === 1 ? '' : 's'}.`);
    };

    const handleCommitText = async (
        at: { x: number; y: number },
        textValue = drawText,
        fontValue = drawFont,
        heightValue = drawTextHeight,
    ) => {
        const origin = snapToGuides(at, guides);
        const rawPlaced = fontValue === 'single-line'
            ? textLoops(textValue, origin, heightValue)
            : await outlineTextLoops(textValue, origin, heightValue, fontValue);
        const textPoints = rawPlaced.flatMap((loop) => loop.points);
        const textBounds = textPoints.reduce(
            (bounds, point) => ({
                minX: Math.min(bounds.minX, point.x),
                minY: Math.min(bounds.minY, point.y),
                maxX: Math.max(bounds.maxX, point.x),
                maxY: Math.max(bounds.maxY, point.y),
            }),
            { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
        );
        const textCenter = {
            x: (textBounds.minX + textBounds.maxX) / 2,
            y: (textBounds.minY + textBounds.maxY) / 2,
        };
        const placed = rawPlaced.map((loop) => ({
            points: loop.points.map((point) => ({
                x: point.x + origin.x - textCenter.x,
                y: point.y + origin.y - textCenter.y,
            })),
        }));
        if (!placed.length) {
            setStatus('Nothing to place — type some text first.');
            return;
        }
        pushHistory();
        const stamped = withIds(placed).map((loop) => ({
            ...loop,
            sourceType: 'text',
            text: textValue,
            fontId: fontValue,
            fontSize: heightValue,
        }));
        setLoops((prev) => {
            const next = [...prev, ...stamped];
            setSelected(stamped.map((l) => l.id));
            setStack([]);
            refreshBounds(next);
            return next;
        });
        setStatus(`Placed "${textValue}" (${placed.length} ${fontValue === 'single-line' ? 'strokes' : 'outlines'}).`);
    };

    useEffect(() => {
        if (!textAnchor) return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setTextAnchor(null);
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [textAnchor]);

    const handleDeleteLoop = async (id: string) => {
        const target = loops.find((loop) => loop.id === id);
        const confirmed = await confirm({
            title: 'Delete vector?',
            message: `Delete ${target?.id ?? 'this vector'}? You can undo this with Ctrl+Z.`,
            confirmLabel: 'Delete vector',
            destructive: true,
        });
        if (!confirmed) return;
        pushHistory();
        setLoops((prev) => {
            const next = prev.filter((l) => l.id !== id);
            setSelected((sel) => sel.filter((s) => s !== id));
            setHidden((h) => h.filter((x) => x !== id));
            setStack([]);
            refreshBounds(next);
            return next;
        });
        setStatus('Vector deleted.');
    };

    const handleDeleteSelected = async (ids?: string[]) => {
        const currentIds = ids ?? selectedRef.current;
        if (!currentIds.length) return;
        const confirmed = await confirm({
            title: 'Delete selected vectors?',
            message: `Delete ${currentIds.length} selected vector${currentIds.length === 1 ? '' : 's'}? You can undo this with Ctrl+Z.`,
            confirmLabel: 'Delete selection',
            destructive: true,
        });
        if (!confirmed) return;
        pushHistory();
        const gone = new Set(currentIds);
        const next = loopsRef.current.filter((l) => !gone.has(l.id));
        setLoops(next);
        setSelected([]);
        setHidden((h) => h.filter((x) => !gone.has(x)));
        setStack([]);
        setDraftPreview([]);
        refreshBounds(next);
        setStatus('Selection deleted.');
    };

    const handleDuplicateSelected = () => {
        if (!selected.length) return;
        pushHistory();
        const byId = new Map(loops.map((l) => [l.id, l]));
        const copies = expandedSelectedIds().flatMap((id) => {
            const src = byId.get(id);
            return src
                ? [
                      {
                          id: `loop-${nextId++}`,
                          points: src.points.map((p) => ({
                              x: p.x + 10,
                              y: p.y + 10,
                          })),
                      },
                  ]
                : [];
        });
        if (!copies.length) return;
        moveAfterCloneRef.current = true;
        const next = [...loops, ...copies];
        setLoops(next);
        setSelected(copies.map((c) => c.id));
        setStack([]);
        setDraftPreview([]);
        refreshBounds(next);
        setStatus(`Duplicated ${copies.length} vector(s).`);
    };

    const handleDeleteGuide = (id: string) => {
        pushHistory();
        setGuides((prev) => prev.filter((x) => x.id !== id));
        setStatus('Guide deleted.');
    };

    const editingEntry =
        editingId !== null
            ? (stack.find((s) => s.id === editingId) ?? null)
            : null;

    const preview = stack.flatMap((entry) =>
        Array.isArray(entry.preview)
            ? entry.preview.map((loop) => ({
                  ...loop,
                  entryId: entry.id,
                  tabEligible: operationUsesTabs(entry.args.operation),
                  tabWidth: Number(entry.args.tabWidth) || 9,
                  toolDiameter: Number(entry.args.toolDiameter) || 6,
              }))
            : [],
    );
    // Tab marker positions from contour arc-lengths.
    const tabMarkers = stack.flatMap((entry) =>
        ((entry.args.tabs as PlacedTab[] | undefined) ?? []).flatMap((tab, tabIndex) => {
            const contour = Array.isArray(entry.preview)
                ? entry.preview[tab.contourIndex]?.points
                : undefined;
            if (!Array.isArray(contour) || contour.length < 2) return [];
            const p = pointAtDistance(contour, tab.along);
            if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return [];
            let previewIndex = -1;
            let seen = 0;
            for (const other of stack) {
                for (let i = 0; i < (Array.isArray(other.preview) ? other.preview.length : 0); i += 1) {
                    if (other.id === entry.id && i === tab.contourIndex) {
                        previewIndex = seen;
                        break;
                    }
                    seen += 1;
                }
                if (previewIndex >= 0) break;
            }
            return [{ entryId: entry.id, tabIndex, contourIndex: tab.contourIndex, along: tab.along, previewIndex, x: p.x, y: p.y }];
        }),
    );
    // Memoized derivations: these feed child effects that call setState
    // (CanvasToolbar previews, 3D/G-code viewer builds). Fresh array identity
    // on every render would re-trigger those effects into an infinite
    // render loop that saturates the main thread (and starves worker posts).
    const gcode = useMemo(
        () =>
            gcodeForUnits(
                combineToolpaths(
                    stack.map((entry) => entry.toolpath),
                    fileName || 'gcam',
                    emitArcs,
                ),
                units,
            ),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [stack, fileName, emitArcs, units],
    );
    const previewToolpaths = useMemo(
        () => stack.map((entry) => entry.toolpath),
        [stack],
    );
    const booleanLoops = useMemo(
        () => selectedLoops(),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [loops, selected, hidden],
    );

    const selectedRef = useRef<string[]>([]);
    selectedRef.current = selected;
    const loopsRef = useRef<ViewLoop[]>([]);
    loopsRef.current = loops;
    const undoRef = useRef(undo);
    undoRef.current = undo;
    const redoRef = useRef(redo);
    redoRef.current = redo;
    const pushHistoryRef = useRef(pushHistory);
    pushHistoryRef.current = pushHistory;

    const refreshBounds = (next: ViewLoop[]) => setBounds(loopBounds(next));

    // Direct-manipulation mode ends whenever geometry changes or the
    // selection empties (camcanvas clears the transform tool likewise).
    useEffect(() => {
        if (moveAfterCloneRef.current) {
            moveAfterCloneRef.current = false;
            setTransformMode('move');
            return;
        }
        setTransformMode(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loops]);
    useEffect(() => {
        if (selected.length === 0) setTransformMode(null);
    }, [selected]);

    // Delete / duplicate / undo / redo (ignored while typing in inputs).
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            const tag = (e.target as HTMLElement)?.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT')
                return;
            if (e.key === 'Escape') {
                setActiveTool('select');
                setTransformMode(null);
                setGuidePlacement(null);
                return;
            }
            if (e.key.toLowerCase() === 'v') {
                setActiveTool('select');
                setTransformMode(null);
                return;
            }
            if (e.key.toLowerCase() === 'f') {
                setViewportCommand({ type: 'fit', token: Date.now() });
                return;
            }
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
                e.preventDefault();
                if (e.shiftKey) redoRef.current();
                else undoRef.current();
                return;
            }
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
                e.preventDefault();
                redoRef.current();
                return;
            }
            if (
                (e.key === 'Delete' || e.key === 'Backspace') &&
                selectedRef.current.length
            ) {
                e.preventDefault();
                void handleDeleteSelected(selectedRef.current);
            }
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
                e.preventDefault();
                if (!selectedRef.current.length) return;
                pushHistoryRef.current();
                moveAfterCloneRef.current = true;
                setLoops((prev) => {
                    const byId = new Map(prev.map((l) => [l.id, l]));
                    const copies = selectedRef.current.flatMap((id) => {
                        const src = byId.get(id);
                        return src
                            ? [
                                  {
                                      id: `loop-${nextId++}`,
                                      points: src.points.map((p) => ({
                                          x: p.x + 10,
                                          y: p.y + 10,
                                      })),
                                  },
                              ]
                            : [];
                    });
                    const next = [...prev, ...copies];
                    setSelected(copies.map((c) => c.id));
                    setStack([]);
                    refreshBounds(next);
                    return next;
                });
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [loops]);

    const handleNewCanvas = () => {
        const hasWork = loops.length > 0 || stack.length > 0 || bitmaps.length > 0;
        if (hasWork && !window.confirm('Clear the current vectors and toolpaths?')) return;
        if (hasWork) pushHistory();
        setEmptyStateDismissed(true);
        setSelected([]);
        setHidden([]);
        setLoops([]);
        setBounds(null);
        setBitmaps([]);
        setStack([]);
        setGuides([]);
        setTabMode(false);
        setEditingId(null);
        setDraftPreview([]);
        setDraftProgress(null);
        setOffsetPreview([]);
        setBooleanPreview([]);
        setActiveTool('select');
        setDrawTool(null);
        setTransformMode(null);
        setFileName('');
        setStatus('Import a DXF or SVG to begin.');
    };

    const toolbarProps = {
        units,
        activeTool: activeTool === 'draw' ? 'draw' as const : activeTool === 'trim' ? 'trim' as const : 'select' as const,
        onSelectMode: () => {
            setActiveTool('select');
            setCornerTool(null);
        },
        drawTool,
        onDrawTool: (t: NonNullable<DrawTool>) => {
            setDrawTool(t);
            setActiveTool('draw');
            setTransformMode(null);
        },
        transformMode,
        onTransformMode: setTransformMode,
        moveX,
        moveY,
        onMoveX: setMoveX,
        onMoveY: setMoveY,
        onApplyMove: applyAbsoluteMove,
        rotateDeg,
        onRotateDeg: setRotateDeg,
        onApplyRotate: applyAbsoluteRotate,
        sizeW,
        sizeH,
        onSizeW: setSizeWLocked,
        onSizeH: setSizeHLocked,
        aspectLock,
        onAspectLock: setAspectLock,
        onApplyScale: applyAbsoluteSize,
        cornerRadius,
        onCornerRadius: setCornerRadius,
        onApplyFillet: handleFillet,
        cornerTool,
        onFilletCorner: handleCorner,
        onApplyChamfer: handleChamfer,
        onApplyDogbone: handleDogbone,
        offsetAmount,
        onOffsetAmount: setOffsetAmount,
        onApplyOffset: handleOffset,
        offsetSource,
        onOffsetPreview: setOffsetPreview,
        onBoolean: handleBoolean,
        canBoolean: selected.length >= 2,
        booleanSource: booleanLoops,
        onBooleanPreview: setBooleanPreview,
        sheetW,
        sheetH,
        nestBorder,
        onNestBorder: setNestBorder,
        nestSpacing,
        onNestSpacing: setNestSpacing,
        onSheetW: setSheetW,
        onSheetH: setSheetH,
        onApplyNest: handleNest,
        onAddGuide: startGuidePlacement,
        onDeleteGuide: handleDeleteGuide,
        guides,
        hasSelection: selected.length > 0,
        hasGeometry: loops.length > 0,
        onDuplicate: handleDuplicateSelected,
        onDeleteSelected: handleDeleteSelected,
        showTrace: traceImg !== null,
        tracing: traceOpen,
        onTrace: () => setTraceOpen(true),
        onUndo: undo,
        onRedo: redo,
        canUndo,
        canRedo,
        onImportFile: () => fileRef.current?.click(),
        onImportProject: () => projectRef.current?.click(),
        onExportProject: handleExportProject,
        onNewCanvas: handleNewCanvas,
        onToggleObjects: () => setTreeOpen((o) => !o),
        onViewPreview: () => setSideTab('preview'),
        onViewConfig: () => setSideTab('config'),
        onToggleDarkMode: () => setDarkMode(!darkMode),
        snapToGrid: grid.snap,
        onToggleSnapToGrid: () => setGrid((current) => ({ ...current, snap: !current.snap })),
        onClearGuides: () => guides.forEach((g) => handleDeleteGuide(g.id)),
        onFitView: () => setViewportCommand({ type: 'fit', token: Date.now() }),
        onZoomIn: () => setViewportCommand({ type: 'zoomIn', token: Date.now() }),
        onZoomOut: () => setViewportCommand({ type: 'zoomOut', token: Date.now() }),
        onTrim: () => { setActiveTool('trim'); setTransformMode(null); },
        onGroup: () => {
            const ids = Array.from(new Set(selected));
            if (ids.length < 2) {
                setStatus('Select at least two vectors to group.');
                return;
            }
            if (ids.some((id) => loops.find((loop) => loop.id === id)?.groupId)) {
                setStatus('Explode the existing group before creating a new one.');
                return;
            }
            pushHistory();
            const groupId = `group-${nextId++}`;
            setLoops((prev) => groupLoopIds(prev, ids, groupId));
            setStatus(`Grouped ${ids.length} vectors.`);
        },
        onUngroup: () => {
            const ids = groupIdsForSelection(loops, selected);
            if (!ids.length) {
                setStatus('Select a grouped vector to ungroup.');
                return;
            }
            pushHistory();
            setLoops((prev) => ungroupLoopIds(prev, ids));
            setStatus(`Ungrouped ${ids.length} group${ids.length === 1 ? '' : 's'}.`);
        },
        canGroup:
            selected.length >= 2 &&
            selected.every(
                (id) => !loops.find((loop) => loop.id === id)?.groupId,
            ),
        canUngroup: selected.some((id) =>
            Boolean(loops.find((loop) => loop.id === id)?.groupId),
        ),
    };

    return (
        <ErrorBoundary>
            <div className="h-screen w-screen overflow-hidden flex flex-col bg-slate-100 text-slate-900 dark:bg-dark-darker dark:text-slate-200">
            {/* Top bar — gSender-style 64px chrome */}
            <header className="h-16 shrink-0 flex items-center gap-2 px-4 min-w-0 bg-white border-b border-slate-200 dark:bg-dark dark:border-robin-900">
                <div className="flex items-center gap-2 font-semibold tracking-tight text-slate-900 dark:text-white shrink-0">
                    <img src={logoUrl} alt="gCAM" className="h-10 w-10 object-contain [filter:none] dark:[filter:none]" />
                </div>
                {sideTab === 'preview' && previewControls && (
                    <PreviewToolbar controls={previewControls} />
                )}
                {sideTab === 'config' && configActions && (
                    <ConfigToolbar actions={configActions} />
                )}
                <nav className="hidden">
                    <ToolButton
                        active={activeTool === 'select'}
                        onClick={() => setActiveTool('select')}
                        icon={<MousePointer2 size={16} />}
                        label="Select"
                    />
                    <ToolButton
                        active={activeTool === 'draw'}
                        onClick={() => {
                            setActiveTool('draw');
                            setDrawTool((t) => t ?? 'rectangle');
                            setTransformMode(null);
                        }}
                        icon={<PenTool size={16} />}
                        label="Draw"
                    />
                    {activeTool === 'draw' && (
                        <span className="inline-flex items-center gap-1 ml-1 min-w-0 overflow-x-auto no-scrollbar [&>*]:shrink-0">
                            {(
                                [
                                    'line',
                                    'rectangle',
                                    'polygon',
                                    'circle',
                                    'arc',
                                    'bezier',
                                    'polyline',
                                    'text',
                                ] as DrawTool[]
                            ).map((t) => (
                                <button
                                    key={t ?? 'none'}
                                    onClick={() => setDrawTool(t)}
                                    className={`rounded px-2 py-1.5 text-xs capitalize ${
                                        drawTool === t
                                            ? 'bg-robin-500 text-white'
                                            : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-dark-lighter'
                                    }`}
                                >
                                    {t}
                                </button>
                            ))}
                            {drawTool === 'polygon' && (
                                <span className="inline-flex items-center gap-1 ml-1">
                                    <input
                                        type="number"
                                        min={3}
                                        max={128}
                                        value={drawSides}
                                        onChange={(e) =>
                                            setDrawSides(Number(e.target.value))
                                        }
                                        aria-label="Polygon sides"
                                        className="w-12 rounded bg-white dark:bg-dark-lighter border border-slate-300 dark:border-robin-900 px-1 py-1 text-slate-900 dark:text-white text-xs"
                                    />
                                    <span
                                        className="inline-flex rounded overflow-hidden border border-slate-300 dark:border-robin-900"
                                        role="radiogroup"
                                        aria-label="Polygon mode"
                                    >
                                        {(
                                            [
                                                'inscribed',
                                                'circumscribed',
                                            ] as const
                                        ).map((m) => (
                                            <button
                                                key={m}
                                                role="radio"
                                                aria-checked={
                                                    drawPolygonMode === m
                                                }
                                                title={
                                                    m === 'inscribed'
                                                        ? 'Vertices on the radius'
                                                        : 'Flats on the radius'
                                                }
                                                onClick={() =>
                                                    setDrawPolygonMode(m)
                                                }
                                                className={`px-1.5 py-1 text-xs capitalize ${
                                                    drawPolygonMode === m
                                                        ? 'bg-robin-500 text-white'
                                                        : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-dark-lighter'
                                                }`}
                                            >
                                                {m === 'inscribed'
                                                    ? 'Inscr.'
                                                    : 'Circ.'}
                                            </button>
                                        ))}
                                    </span>
                                </span>
                            )}
                        </span>
                    )}
                    <EditMenu
                        units={units}
                        moveX={moveX}
                        moveY={moveY}
                        onMoveX={setMoveX}
                        onMoveY={setMoveY}
                        onApplyMove={applyAbsoluteMove}
                        rotateDeg={rotateDeg}
                        onRotateDeg={setRotateDeg}
                        onApplyRotate={applyAbsoluteRotate}
                        sizeW={sizeW}
                        sizeH={sizeH}
                        onSizeW={setSizeWLocked}
                        onSizeH={setSizeHLocked}
                        aspectLock={aspectLock}
                        onAspectLock={setAspectLock}
                        onApplyScale={applyAbsoluteSize}
                        cornerRadius={cornerRadius}
                        onCornerRadius={setCornerRadius}
                        onApplyFillet={handleFillet}
                        onApplyChamfer={handleChamfer}
                        onApplyDogbone={handleDogbone}
                        offsetAmount={offsetAmount}
                        onOffsetAmount={setOffsetAmount}
                        onApplyOffset={handleOffset}
                        onBoolean={handleBoolean}
                        canBoolean={selected.length >= 2}
                        sheetW={sheetW}
                        sheetH={sheetH}
                        onSheetW={setSheetW}
                        onSheetH={setSheetH}
                        onApplyNest={handleNest}
                        hasSelection={selected.length > 0}
                        hasGeometry={loops.length > 0}
                        showTrace={traceImg !== null}
                        tracing={traceOpen}
                        onTrace={() => setTraceOpen(true)}
                    />
                </nav>
                {sideTab === 'toolpaths' && (
                    <div className="min-w-0 flex-1 overflow-visible">
                        <CanvasToolbar {...toolbarProps} />
                    </div>
                )}
                <div className="hidden ml-auto flex items-center gap-2 shrink-0">
                    <button
                        onClick={() => setDarkMode(!darkMode)}
                        title={
                            darkMode
                                ? 'Switch to light mode'
                                : 'Switch to dark mode'
                        }
                        aria-label={
                            darkMode
                                ? 'Switch to light mode'
                                : 'Switch to dark mode'
                        }
                        aria-pressed={darkMode}
                        className="inline-flex items-center justify-center w-10 h-10 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-100 dark:border-robin-700 dark:text-slate-200 dark:hover:bg-dark-lighter touch-manipulation"
                    >
                        {darkMode ? <Sun size={18} /> : <Moon size={18} />}
                    </button>
                    {sideTab === 'toolpaths' && (
                        <button
                            onClick={() => setTreeOpen((o) => !o)}
                            title="Object browser"
                            aria-label="Object browser"
                            aria-pressed={treeOpen}
                            className={`inline-flex items-center justify-center w-10 h-10 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-100 dark:border-robin-700 dark:text-slate-200 dark:hover:bg-dark-lighter touch-manipulation ${treeOpen ? 'bg-robin-500 border-robin-500 text-white' : ''}`}
                        >
                            <ListTree size={18} />
                        </button>
                    )}
                    <button
                        onClick={undo}
                        disabled={!canUndo}
                        title="Undo (Ctrl+Z)"
                        aria-label="Undo"
                        className="inline-flex items-center justify-center w-10 h-10 rounded-lg border border-slate-300 text-slate-500 hover:bg-slate-100 disabled:opacity-30 dark:border-robin-900 dark:text-slate-300 dark:hover:bg-dark-lighter touch-manipulation"
                    >
                        <Undo2 size={18} />
                    </button>
                    <button
                        onClick={redo}
                        disabled={!canRedo}
                        title="Redo (Ctrl+Y)"
                        aria-label="Redo"
                        className="inline-flex items-center justify-center w-10 h-10 rounded-lg border border-slate-300 text-slate-500 hover:bg-slate-100 disabled:opacity-30 dark:border-robin-900 dark:text-slate-300 dark:hover:bg-dark-lighter touch-manipulation"
                    >
                        <Redo2 size={18} />
                    </button>
                    <input
                        ref={fileRef}
                        type="file"
                        accept=".dxf,.svg,.png,.jpg,.jpeg,.webp,.bmp,.gif"
                        className="hidden"
                        onChange={(e) => void handleFiles(e.target.files)}
                    />
                    <button
                        onClick={() => fileRef.current?.click()}
                            className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2.5 text-sm border-2 border-robin-500 bg-dark-lighter text-white shadow-[0_2px_8px_rgba(2,6,23,0.45),0_0_0_1px_rgba(104,154,201,0.25)] hover:border-robin-300 hover:bg-slate-700 hover:shadow-[0_3px_12px_rgba(104,154,201,0.28)] transition-all touch-manipulation"
                    >
                        <FolderOpen size={18} /> Import DXF/SVG
                    </button>
                    <input
                        ref={projectRef}
                        type="file"
                        accept=".json,.gcam.json,.camcanvas.json,application/json"
                        className="hidden"
                        onChange={(e) => {
                            void handleImportProject(e.target.files);
                            e.target.value = '';
                        }}
                    />
                    <button
                        onClick={() => projectRef.current?.click()}
                        title="Import project"
                        aria-label="Import project"
                        className="inline-flex items-center justify-center w-10 h-10 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-100 dark:border-robin-700 dark:text-slate-200 dark:hover:bg-dark-lighter touch-manipulation"
                    >
                        <Upload size={18} />
                    </button>
                    <button
                        onClick={handleExportProject}
                        title="Export project"
                        aria-label="Export project"
                        className="inline-flex items-center justify-center w-10 h-10 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-100 dark:border-robin-700 dark:text-slate-200 dark:hover:bg-dark-lighter touch-manipulation"
                    >
                        <Download size={18} />
                    </button>
                </div>
            </header>

            <div className="flex-1 min-h-0 flex">
                <Sidebar activeTab={sideTab} onTabChange={setSideTab} />
                {sideTab === 'toolpaths' && (
                    <>
                        {/* Canvas */}
                        <main
                            className="relative flex-1 min-w-0 bg-slate-100 dark:bg-slate-800 p-3 flex flex-col gap-2 min-h-0"
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={(e) => {
                                e.preventDefault();
                                void handleFiles(e.dataTransfer.files);
                            }}
                        >
                            <div className="relative flex-1 min-h-0">
                                <CanvasStage
                                    activeTool={activeTool}
                                    loops={loops}
                                    bounds={bounds}
                                    preview={preview}
                                    inspectorPreview={inspectorPreview}
                                    draftPreview={
                                        draftPreview.length
                                            ? draftPreview
                                            : offsetPreview.length
                                              ? offsetPreview
                                              : booleanPreview
                                    }
                                    draftProgress={draftProgress}
                                    darkMode={darkMode}
                                    selected={selected}
                                    onSelect={setSelected}
                                    tabMode={tabMode}
                                    tabMarkers={tabMarkers}
                                    onPlaceTab={handlePlaceTab}
                                    onMoveTab={handleMoveTab}
                                    onDeleteTab={handleDeleteTab}
                                    drawTool={
                                        activeTool === 'draw' ? drawTool : null
                                    }
                                    drawSides={drawSides}
                                    polygonMode={drawPolygonMode}
                                    grid={grid}
                                    guides={guides}
                                    guidePlacement={guidePlacement}
                                    onPlaceGuide={placeGuide}
                                    onCancelGuide={() => setGuidePlacement(null)}
                                    bitmaps={bitmaps}
                                    hidden={hidden}
                                    onCommitLoop={handleCommitLoop}
                                    onTrimAt={handleTrimAt}
                                    onTrimStroke={handleTrimStroke}
                                    onCommitText={(at) => setTextAnchor(snapToGuides(at, guides))}
                                    transformMode={transformMode}
                                    onTransformCommit={handleTransformCommit}
                                    cornerTool={cornerTool}
                                    cornerRadius={cornerRadius}
                                    onFilletCorner={handleCorner}
                                    preserveViewToken={preserveViewToken}
                                    viewportCommand={viewportCommand}
                                    units={units}
                                />
                                {treeOpen && (
                                    <ObjectTree
                                        units={units}
                                        loops={loops}
                                        bitmaps={bitmaps}
                                        selected={selected}
                                        hidden={hidden}
                                        onSelect={setSelected}
                                        onToggleHidden={(id) => {
                                            pushHistory();
                                            setHidden((h) =>
                                                h.includes(id)
                                                    ? h.filter((x) => x !== id)
                                                    : [...h, id],
                                            );
                                        }}
                                        onDelete={handleDeleteLoop}
                                        onGroup={toolbarProps.onGroup}
                                        onUngroup={toolbarProps.onUngroup}
                                        canGroup={toolbarProps.canGroup}
                                        canUngroup={toolbarProps.canUngroup}
                                        onEdit={() => setInspectorDismissed(null)}
                                        onMove={() => setTransformMode('move')}
                                        onResize={() => setTransformMode('scale')}
                                        onClose={() => setTreeOpen(false)}
                                    />
                                )}
                                {!loops.length && !emptyStateDismissed && (
                                    <div className="absolute inset-0 z-10 grid place-items-center pointer-events-none">
                                        <div className="pointer-events-auto w-full max-w-sm rounded-lg border border-slate-300 bg-white/95 px-6 py-5 text-center shadow-lg dark:border-robin-900 dark:bg-dark/95">
                                            <div className="font-medium text-slate-900 dark:text-white">
                                                How would you like to begin?
                                            </div>
                                            <div className="mt-3 flex items-center justify-center gap-2">
                                                <button
                                                    onClick={toolbarProps.onNewCanvas}
                                                    className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 dark:border-robin-900 dark:text-slate-200 dark:hover:bg-dark-lighter"
                                                >
                                                    New Empty Canvas
                                                </button>
                                                <button
                                                    onClick={() => fileRef.current?.click()}
                                                    className="rounded bg-green-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-800"
                                                >
                                                    Open DXF/SVG/Bitmap
                                                </button>
                                            </div>
                                            <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                                                or drag DXF/SVG/Bitmap here
                                            </p>
                                            <button
                                                onClick={() => void handleLoadSample()}
                                                disabled={loadingSample}
                                                className="mt-1 rounded border border-transparent px-2 py-1 text-xs text-slate-500 hover:border-slate-300 hover:text-slate-700 disabled:opacity-40 dark:text-slate-400 dark:hover:border-robin-900 dark:hover:text-slate-200"
                                            >
                                                {loadingSample ? 'Loading…' : 'Try Sample Vector'}
                                            </button>
                                        </div>
                                    </div>
                                )}
                                {showInspector && inspectorLoop && (
                                    <CadInspector
                                        key={inspectorLoop.id}
                                        loop={inspectorLoop}
                                        angle={
                                            Math.round(
                                                orientRef.current.angle * 10,
                                            ) / 10
                                        }
                                        onApply={handleInspectorApply}
                                        onPreview={(patch) =>
                                            setInspectorPreview(
                                                patch ? buildInspectorPreview(patch) : null,
                                            )
                                        }
                                        units={units}
                                        onClose={() =>
                                            (() => {
                                                setInspectorPreview(null);
                                                setInspectorDismissed(inspectorLoop.id);
                                            })()
                                        }
                                    />
                                )}
                            </div>
                            <div className="shrink-0 text-xs text-slate-500 dark:text-slate-400 truncate">
                                {status}
                            </div>
                        </main>

                        {/* Right rail — toolpath stack for the Toolpaths tab */}
                        <aside className="w-[340px] shrink-0 border-l border-slate-200 bg-white dark:border-robin-900 dark:bg-dark flex flex-col min-h-0">
                            <div className="p-3 border-b border-slate-200 dark:border-robin-900 flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                                <Layers size={18} className="text-robin-400" />
                                <span className="font-medium text-slate-900 dark:text-white">
                                    Assign Toolpaths
                                </span>
                            </div>
                            <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar">
                                <ToolpathPanel
                                    loops={loops}
                                    selected={selected}
                                    bitmaps={bitmaps}
                                    submitLabel="Add Toolpath"
                                    onResult={handleResult}
                                    defaultArcs={emitArcs}
                                    units={units}
                                    onDraftPreview={(c) =>
                                        setDraftPreview(c ?? [])
                                    }
                                    onDraftProgress={setDraftProgress}
                                    editEntry={
                                        editingEntry
                                            ? {
                                                  id: editingEntry.id,
                                                  args: editingEntry.args,
                                                  loops: editingEntry.args.loops.map(
                                                      (l, i) => ({
                                                          id:
                                                              l.id ??
                                                              `edit-${editingEntry.id}-${i}`,
                                                          points: l.points,
                                                          bitmapId: (
                                                              l as {
                                                                  bitmapId?: string;
                                                              }
                                                          ).bitmapId,
                                                      }),
                                                  ),
                                              }
                                            : null
                                    }
                                    onUpdate={handleUpdateResult}
                                    onCancelEdit={() => {
                                        setEditingId(null);
                                        setDraftPreview([]);
                                        setDraftProgress(null);
                                        setStatus('Edit cancelled.');
                                    }}
                                />
                                <div className="px-3 pb-3">
                                    <div className="flex items-center justify-between mb-1">
                                        <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                                            Created Toolpaths ({stack.length})
                                        </div>
                                        <button
                                            onClick={() =>
                                                setTabMode((m) => !m)
                                            }
                                            className={`rounded border px-2 py-0.5 text-xs ${
                                                tabMode
                                                    ? 'bg-robin-500 border-robin-500 text-white'
                                                    : 'border-slate-300 text-slate-600 hover:bg-slate-100 dark:border-robin-900 dark:text-slate-300 dark:hover:bg-dark-lighter'
                                            }`}
                                        >
                                            {tabMode
                                                ? 'Placing tabs…'
                                                : 'Add a Tab'}
                                        </button>
                                    </div>
                                    <div className="space-y-1">
                                        {stack.map((entry) => {
                                            const tabCount = (
                                                (entry.args.tabs as
                                                    | PlacedTab[]
                                                    | undefined) ?? []
                                            ).length;
                                            const tabEligible =
                                                operationUsesTabs(
                                                    entry.args.operation,
                                                );
                                            return (
                                                <div
                                                    key={entry.id}
                                                    className="rounded border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs dark:border-robin-900 dark:bg-dark-lighter"
                                                >
                                                    <div className="flex items-center gap-2">
                                                        <span className="flex-1 truncate text-slate-700 dark:text-slate-200">
                                                            {entry.label}
                                                        </span>
                                                        <button
                                                            aria-label={`Edit ${entry.label}`}
                                                            onClick={() => {
                                                                setEditingId(
                                                                    entry.id,
                                                                );
                                                                setSideTab(
                                                                    'toolpaths',
                                                                );
                                                                setStatus(
                                                                    `Editing ${entry.label} — Save or Cancel.`,
                                                                );
                                                            }}
                                                            className="text-slate-400 hover:text-robin-400"
                                                        >
                                                            <Pencil size={14} />
                                                        </button>
                                                        <button
                                                            aria-label={`Delete ${entry.label}`}
                                                            onClick={() => {
                                                                void (async () => {
                                                                    const ok =
                                                                        await confirm(
                                                                            {
                                                                                title: 'Delete toolpath?',
                                                                                message: `Delete ${entry.label}? You can undo this with Ctrl+Z.`,
                                                                                confirmLabel:
                                                                                    'Delete toolpath',
                                                                                destructive: true,
                                                                            },
                                                                        );
                                                                    if (!ok)
                                                                        return;
                                                                    if (
                                                                        editingId ===
                                                                        entry.id
                                                                    )
                                                                        setEditingId(
                                                                            null,
                                                                        );
                                                                    setStack(
                                                                        (
                                                                            prev,
                                                                        ) =>
                                                                            prev.filter(
                                                                                (
                                                                                    s,
                                                                                ) =>
                                                                                    s.id !==
                                                                                    entry.id,
                                                                            ),
                                                                    );
                                                                    showToast(
                                                                        'Toolpath deleted. Press Ctrl+Z to restore it.',
                                                                        'info',
                                                                        4200,
                                                                    );
                                                                })();
                                                            }}
                                                            className="text-slate-400 hover:text-red-400"
                                                        >
                                                            <Trash2 size={14} />
                                                        </button>
                                                    </div>
                                                    {tabEligible && (
                                                        <div className="mt-1 flex items-center gap-1">
                                                            <span className="flex-1 text-slate-500 dark:text-slate-400">
                                                                {tabCount
                                                                    ? `${tabCount} tab${tabCount === 1 ? '' : 's'}`
                                                                    : 'No tabs'}
                                                            </span>
                                                            <button
                                                                onClick={() =>
                                                                    rebuildEntryTabs(
                                                                        entry.id,
                                                                        defaultTabsForContours(
                                                                            entry.preview.map(
                                                                                (
                                                                                    p,
                                                                                ) =>
                                                                                    p.points,
                                                                            ),
                                                                        ),
                                                                    )
                                                                }
                                                                className="rounded border border-slate-300 dark:border-robin-900 px-1.5 py-0.5 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-dark"
                                                            >
                                                                Auto
                                                            </button>
                                                            {tabCount > 0 && (
                                                                <button
                                                                    onClick={() => {
                                                                        void (async () => {
                                                                            const ok =
                                                                                await confirm(
                                                                                    {
                                                                                        title: 'Clear tabs?',
                                                                                        message: `Remove all ${tabCount} tab${tabCount === 1 ? '' : 's'} from ${entry.label}?`,
                                                                                        confirmLabel:
                                                                                            'Clear tabs',
                                                                                        destructive: true,
                                                                                    },
                                                                                );
                                                                            if (
                                                                                !ok
                                                                            )
                                                                                return;
                                                                            rebuildEntryTabs(
                                                                                entry.id,
                                                                                [],
                                                                            );
                                                                        })();
                                                                    }}
                                                                    className="rounded border border-slate-300 dark:border-robin-900 px-1.5 py-0.5 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-dark"
                                                                >
                                                                    Clear
                                                                </button>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                        {!stack.length && (
                                            <div className="text-xs text-slate-500">
                                                No toolpaths yet — select
                                                vectors and generate one.
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </aside>
                    </>
                )}
                {sideTab === 'preview' && (
                        <main className="relative flex-1 min-w-0 bg-slate-100 dark:bg-slate-800 p-3 flex flex-col gap-3 min-h-0">
                        <div className="flex items-center gap-2 text-sm text-slate-300">
                            <Box size={18} className="text-robin-400" />
                            <span className="font-medium text-white">
                                3D Cut Preview
                            </span>
                            <span className="text-xs text-slate-500">
                                {stack.length
                                    ? `${stack.length} toolpath${stack.length === 1 ? '' : 's'}`
                                    : 'Add a toolpath to preview the cut'}
                            </span>
                        </div>
                        <div className="flex-1 min-h-0">
                            <CutPreview3DView
                                toolpaths={previewToolpaths}
                                darkMode={darkMode}
                                onControlsChange={setPreviewControls}
                            />
                        </div>
                        <div className="shrink-0 rounded border border-slate-200 bg-white p-3 dark:border-robin-900 dark:bg-dark">
                            <GcodePreview gcode={gcode} fileName={fileName} />
                        </div>
                    </main>
                )}
                {sideTab === 'gcode' && (
                        <main className="relative flex-1 min-w-0 bg-slate-100 dark:bg-slate-800 p-3 flex flex-col gap-3 min-h-0">
                        <div className="flex items-center gap-2 text-sm text-slate-300">
                            <Box size={18} className="text-robin-400" />
                            <span className="font-medium text-white">
                                G-code Viewer
                            </span>
                            <span className="text-xs text-slate-500">
                                {stack.length
                                    ? `${stack.length} toolpath${stack.length === 1 ? '' : 's'}`
                                    : 'Add a toolpath to preview the G-code'}
                            </span>
                        </div>
                        <div className="flex-1 min-h-0">
                            <GcodeViewer3DView
                                gcode={gcode}
                                darkMode={darkMode}
                            />
                        </div>
                        <div className="shrink-0 rounded border border-slate-200 bg-white p-3 dark:border-robin-900 dark:bg-dark">
                            <GcodePreview gcode={gcode} fileName={fileName} />
                        </div>
                    </main>
                )}
                {sideTab === 'config' && (
                        <main className="relative flex-1 min-w-0 bg-slate-100 dark:bg-slate-800 min-h-0">
                        <ConfigPanel
                            darkMode={darkMode}
                            onDarkModeChange={setDarkMode}
                            grid={grid}
                            onGridChange={setGrid}
                            emitArcs={emitArcs}
                            onEmitArcsChange={setEmitArcs}
                            units={units}
                            onUnitsChange={setUnits}
                            onActionsChange={setConfigActions}
                        />
                    </main>
                )}
            </div>
            {textAnchor && (
                <div
                    className="fixed inset-0 z-[9998] grid place-items-center bg-black/50 p-4"
                    onMouseDown={() => setTextAnchor(null)}
                >
                    <form
                        className="relative grid w-full max-w-sm gap-3 rounded-lg border border-slate-300 bg-slate-100 p-4 text-sm text-slate-900 shadow-xl dark:border-robin-900 dark:bg-dark dark:text-white"
                        onMouseDown={(event) => event.stopPropagation()}
                        onSubmit={(event) => {
                            event.preventDefault();
                            const anchor = textAnchor;
                            setTextAnchor(null);
                            void handleCommitText(anchor);
                        }}
                    >
                        <div className="text-base font-semibold">Add Vector Text</div>
                        <label className="grid gap-1">
                            <span>Text</span>
                            <input
                                autoFocus
                                value={drawText}
                                maxLength={40}
                                onChange={(event) => setDrawText(event.target.value)}
                                aria-label="Text to place"
                                className="rounded border border-slate-300 bg-white px-2 py-1.5 dark:border-robin-900 dark:bg-dark-lighter"
                            />
                        </label>
                        <label className="grid gap-1">
                            <span>Font</span>
                            <select
                                value={drawFont}
                                onChange={(event) => setDrawFont(event.target.value)}
                                aria-label="Text font"
                                className="rounded border border-slate-300 bg-white px-2 py-1.5 dark:border-robin-900 dark:bg-dark-lighter"
                            >
                                {FONT_OPTIONS.map((font) => (
                                    <option key={font.id} value={font.id}>{font.name}</option>
                                ))}
                            </select>
                        </label>
                        <label className="grid gap-1">
                            <span>Height ({lengthUnit(units)})</span>
                            <UnitInput
                                units={units}
                                minMm={1}
                                valueMm={drawTextHeight}
                                onChangeMm={setDrawTextHeight}
                                aria-label={`Text height in ${lengthUnit(units)}`}
                                className="rounded border border-slate-300 bg-white px-2 py-1.5 dark:border-robin-900 dark:bg-dark-lighter"
                            />
                        </label>
                        <div className="flex justify-end gap-2 pt-1">
                            <button
                                type="button"
                                onClick={() => setTextAnchor(null)}
                                className="rounded border border-slate-300 px-3 py-1.5 hover:bg-slate-200 dark:border-robin-900 dark:hover:bg-dark-lighter"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                className="rounded bg-green-700 px-3 py-1.5 font-medium text-white hover:bg-green-800"
                            >
                                Add Text
                            </button>
                        </div>
                    </form>
                </div>
            )}
            <ToastStack toasts={toasts} onDismiss={dismissToast} />
            {confirmDialog}
            {traceOpen && traceImg && traceBitmap && (
                <TraceModal
                    fileName={fileName || 'bitmap'}
                    img={traceImg}
                    originX={traceBitmap.x}
                    originY={traceBitmap.y}
                    widthMm={traceBitmap.w}
                    heightMm={traceBitmap.h}
                    onClose={() => setTraceOpen(false)}
                    onImport={(traced) => {
                        setTraceOpen(false);
                        commitTraced(traced);
                    }}
                />
            )}
        </div>
        </ErrorBoundary>
    );
}

function ToolButton({
    active,
    onClick,
    icon,
    label,
}: {
    active?: boolean;
    onClick?: () => void;
    icon: React.ReactNode;
    label: string;
}) {
    return (
        <button
            onClick={onClick}
            className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1.5 ${
                active
                    ? 'bg-robin-500 text-white'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-dark-lighter dark:hover:text-white'
            }`}
        >
            {icon}
            {label}
        </button>
    );
}

function PreviewToolbar({ controls }: { controls: PreviewControls }) {
    const buttonClass = (active = false) =>
        `inline-flex items-center gap-1.5 rounded px-2.5 py-1.5 text-sm ${
            active
                ? 'bg-robin-500 text-white'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-dark-lighter dark:hover:text-white'
        } disabled:opacity-40`;

    return (
        <div className="flex items-center gap-0.5 shrink-0" role="toolbar" aria-label="3D preview controls">
            <button
                onClick={controls.simulate}
                disabled={controls.empty}
                className={buttonClass(controls.running)}
            >
                <Play size={14} fill="currentColor" />
                {controls.running ? 'Simulating…' : 'Simulate'}
            </button>
            <button onClick={controls.iso} className={buttonClass()} title="Isometric view" aria-label="Isometric view">
                <Camera size={16} />
            </button>
            <button onClick={controls.top} className={buttonClass()} title="Top view" aria-label="Top view">
                <Box size={16} />
            </button>
        </div>
    );
}

function ConfigToolbar({ actions }: { actions: ConfigActions }) {
    const buttonClass =
        'inline-flex items-center gap-1.5 rounded px-2.5 py-1.5 text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-dark-lighter dark:hover:text-white';

    return (
        <div className="flex items-center gap-0.5 shrink-0" role="toolbar" aria-label="Configuration actions">
            <button onClick={actions.exportConfig} className={buttonClass}>
                <Download size={16} /> Export Config
            </button>
            <button onClick={actions.importConfig} className={buttonClass}>
                <Upload size={16} /> Import Config
            </button>
            <button
                onClick={actions.resetConfig}
                className={`${buttonClass} text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300`}
            >
                Reset All
            </button>
        </div>
    );
}
