import { useEffect, useRef, useState } from 'react';
import { Settings } from 'lucide-react';
import type { ViewLoop } from './CanvasStage';
import {
    buildToolpathGcode,
    buildToolpathGcodeAsync,
    type Operation,
    type PlacedTab,
    type ProfileArgs,
    type RasterBitmap,
    type ToolpathResult,
} from '../lib/engine';
import { imageDataOf } from '../lib/bitmap';
import { isConfigured, loadSlots, type ToolSlot } from '../lib/tools';
import { ToolLibraryModal } from './ToolLibraryModal';
import { displayValue, feedUnit, lengthUnit, type UnitSystem } from '../lib/units';
import { UnitInput } from './UnitInput';

const OPERATIONS: { value: Operation; label: string }[] = [
    { value: 'profile-outside', label: 'Outside' },
    { value: 'profile-inside', label: 'Inside' },
    { value: 'pocket', label: 'Pocket' },
    { value: 'engrave', label: 'Engrave' },
    { value: 'chamfer', label: 'Chamfer' },
    { value: 'vcarve', label: 'V-Carve' },
    { value: 'laser-cut', label: 'Laser Cut' },
    { value: 'laser-raster', label: 'Laser Raster' },
    { value: 'wavy-raster', label: 'Wavy' },
    { value: 'halftone', label: 'Halftone' },
];

const operationAsset = (name: string) => `${import.meta.env.BASE_URL}assets/operations/${name}.png`;

const OPERATION_IMAGES: Partial<Record<Operation, string>> = {
    'profile-outside': operationAsset('outside'),
    'profile-inside': operationAsset('inside'),
    pocket: operationAsset('pocket'),
    engrave: operationAsset('engrave'),
    chamfer: operationAsset('chamfer'),
    vcarve: operationAsset('vcarve'),
    'laser-cut': operationAsset('engrave'),
    'laser-raster': operationAsset('engrave'),
    'wavy-raster': operationAsset('pocket'),
    halftone: operationAsset('pocket'),
};

/**
 * Toolpath form on the real CAM engine: Clipper offsets, V-Carve worker,
 * plus the real GRBL emitter. Laser/tabs/trochoid follow.
 */
export function ToolpathPanel({
    loops,
    selected,
    bitmaps,
    submitLabel,
    onResult,
    defaultArcs = true,
    onDraftPreview,
    onDraftProgress,
    editEntry = null,
    onUpdate,
    onCancelEdit,
    units = 'metric',
}: {
    loops: ViewLoop[];
    selected: string[];
    bitmaps: {
        id: string;
        x: number;
        y: number;
        w: number;
        h: number;
        img?: HTMLImageElement;
    }[];
    submitLabel: string;
    onResult: (r: ToolpathResult, args: ProfileArgs) => void;
    defaultArcs?: boolean;
    onDraftPreview?: (contours: { x: number; y: number }[][] | null) => void;
    onDraftProgress?: (
        progress: { percent: number; label: string } | null,
    ) => void;
    editEntry?: {
        id: string;
        args: ProfileArgs;
        loops: ViewLoop[];
    } | null;
    onUpdate?: (id: string, r: ToolpathResult, args: ProfileArgs) => void;
    onCancelEdit?: () => void;
    units?: UnitSystem;
}) {
    const [operation, setOperation] = useState<Operation>('profile-outside');
    const [toolDiameter, setToolDiameter] = useState(6);
    const [cutDepth, setCutDepth] = useState(18);
    const [trochoid, setTrochoid] = useState(false);
    const [engagement, setEngagement] = useState(10);
    const [laserFeed, setLaserFeed] = useState(3000);
    const [laserPower, setLaserPower] = useState(1000);
    const [laserSpot, setLaserSpot] = useState(0.2);
    const [laserGamma, setLaserGamma] = useState(1);
    const [laserOverscan, setLaserOverscan] = useState(2);
    const [wavySpacing, setWavySpacing] = useState(2);
    const [wavyShallow, setWavyShallow] = useState(0);
    const [wavyDeep, setWavyDeep] = useState(3);
    const [halftoneRes, setHalftoneRes] = useState(50);
    const [halftoneInvert, setHalftoneInvert] = useState(false);
    const [feedRate, setFeedRate] = useState(1800);
    const [plungeRate, setPlungeRate] = useState(600);
    const [spindle, setSpindle] = useState(18000);
    const [safeZ, setSafeZ] = useState(6);
    const [passDepth, setPassDepth] = useState(3);
    const [arcs, setArcs] = useState(defaultArcs);
    const [toolNumber, setToolNumber] = useState(1);
    const [overlap, setOverlap] = useState(40);
    const [tabWidth, setTabWidth] = useState(9);
    const [tabHeight, setTabHeight] = useState(9);
    const [autoTabHeight, setAutoTabHeight] = useState(true);
    const [laserSMin, setLaserSMin] = useState(0);
    const [laserSMax, setLaserSMax] = useState(1000);
    const [wavyFeed, setWavyFeed] = useState(1800);
    const [slots, setSlots] = useState<ToolSlot[]>(() =>
        typeof window === 'undefined' ? [] : loadSlots(window.localStorage),
    );
    const [slotNum, setSlotNum] = useState(1);
    const [toolLibOpen, setToolLibOpen] = useState(false);
    const [toolLibSlot, setToolLibSlot] = useState<number | null>(null);

    // Keep the per-form arcs toggle in sync when the Config default changes.
    useEffect(() => {
        setArcs(defaultArcs);
    }, [defaultArcs]);

    const applySlot = (slot: ToolSlot) => {
        if (slot.cuttingDiameterMm != null)
            setToolDiameter(slot.cuttingDiameterMm);
        if (slot.feedRate != null) setFeedRate(slot.feedRate);
        if (slot.plungeRate != null) setPlungeRate(slot.plungeRate);
        if (slot.spindle != null) setSpindle(slot.spindle);
        if (slot.passDepthMm != null) setPassDepth(slot.passDepthMm);
        setToolNumber(slot.slot);
    };
    const activeSlot = slots.find((s) => s.slot === slotNum) ?? null;
    const cutterAngle = activeSlot?.fluteAngleDeg ?? 90;
    // V-bit operations need a V-bit slot (camcanvas validateToolSlotForOperation).
    const NEEDS_VBIT: Operation[] = [
        'vcarve',
        'chamfer',
        'wavy-raster',
        'halftone',
    ];
    const vbitMismatch =
        NEEDS_VBIT.includes(operation) && activeSlot?.toolType !== 'v-bit';
    const LASER_OPS: Operation[] = ['laser-cut', 'laser-raster'];
    const [busy, setBusy] = useState(false);
    const [status, setStatus] = useState(
        loops.length ? 'Vectors ready.' : 'Import vectors first.',
    );
    // Selected vectors drive the toolpath; all vectors when none selected.
    // In edit mode the entry's own source loops drive it instead.
    const byId = new Map(loops.map((l) => [l.id, l]));
    const active = editEntry
        ? editEntry.loops
        : selected.length > 0
          ? selected.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []))
          : loops;

    // Load a created toolpath back into the form for editing (legacy parity).
    const editId = editEntry?.id ?? null;
    useEffect(() => {
        if (!editEntry) return;
        const a = editEntry.args as ProfileArgs & Record<string, unknown>;
        const num = (v: unknown, fallback: number) =>
            typeof v === 'number' && Number.isFinite(v) ? v : fallback;
        setOperation(a.operation);
        setToolDiameter(num(a.toolDiameter, 6));
        setCutDepth(num(a.cutDepth, 18));
        setTrochoid(Boolean(a.trochoidEnabled));
        setEngagement(num(a.trochoidEngagementPercent, 10));
        setLaserFeed(num(a.laserFeed, 3000));
        setLaserPower(num(a.laserPower, 1000));
        setLaserSpot(num(a.laserSpot, 0.2));
        setLaserSMin(num(a.laserSMin, 0));
        setLaserSMax(num(a.laserSMax, 1000));
        setLaserGamma(num(a.laserGamma, 1));
        setLaserOverscan(num(a.laserOverscan, 2));
        setWavySpacing(num(a.wavySpot, 2));
        setWavyShallow(num(a.wavyMinDepth, 0));
        setWavyDeep(num(a.wavyMaxDepth, 3));
        setWavyFeed(num(a.wavyFeed, 1800));
        setHalftoneRes(num(a.halftoneResolution, 50));
        setHalftoneInvert(Boolean(a.halftoneInvert));
        setFeedRate(num(a.feedRate, 1800));
        setPlungeRate(num(a.plungeRate, 600));
        setSpindle(num(a.spindle, 18000));
        setSafeZ(num(a.safeZ, 6));
        setPassDepth(num(a.passDepth, num(a.cutDepth, 18)));
        setArcs(a.arcs !== false);
        setToolNumber(Math.max(1, Math.round(num(a.toolNumber, 1))));
        setOverlap(num(a.overlapPercent, 40));
        setTabWidth(num(a.tabWidth, 9));
        setTabHeight(num(a.tabHeight, 9));
        setAutoTabHeight(false);
        const slot = slots.find(
            (s) => s.slot === Math.max(1, Math.round(num(a.toolNumber, 1))),
        );
        if (slot) setSlotNum(slot.slot);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [editId]);

    // Only offer operations that fit the selection: bitmap ops need a
    // placed bitmap, vector ops need vector geometry.
    const RASTER_OPS: Operation[] = ['laser-raster', 'wavy-raster', 'halftone'];
    const hasBitmap = active.some((l) => l.bitmapId);
    const hasVector = active.some((l) => !l.bitmapId);
    const visibleOps = OPERATIONS.filter((op) => {
        const raster = RASTER_OPS.includes(op.value);
        if (hasBitmap && !hasVector) return raster;
        if (hasVector && !hasBitmap) return !raster;
        return true;
    });
    useEffect(() => {
        if (!visibleOps.some((op) => op.value === operation)) {
            setOperation(visibleOps[0]?.value ?? 'profile-outside');
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hasBitmap, hasVector]);

    const resolveRasterBitmap = (): RasterBitmap => {
        const loop = active.find((l) => l.bitmapId);
        const entry = loop && bitmaps.find((b) => b.id === loop.bitmapId);
        if (!entry?.img)
            throw new Error('Select an imported bitmap for Laser Raster.');
        return {
            imageData: imageDataOf(entry.img),
            bounds: {
                minX: entry.x,
                minY: entry.y,
                maxX: entry.x + entry.w,
                maxY: entry.y + entry.h,
            },
        };
    };

    // Legacy auto tab height: follows half the cut depth until edited.
    useEffect(() => {
        if (autoTabHeight) setTabHeight(Math.max(0.1, cutDepth / 2));
    }, [cutDepth, autoTabHeight]);

    const buildArgs = () => {
        let bitmap: RasterBitmap | undefined;
        if (
            operation === 'laser-raster' ||
            operation === 'wavy-raster' ||
            operation === 'halftone'
        ) {
            bitmap = resolveRasterBitmap();
        }
        // Editing preserves the entry's existing tabs.
        const tabs = editEntry
            ? (((editEntry.args as ProfileArgs).tabs as PlacedTab[]) ?? [])
            : [];
        return {
            loops: active,
            operation,
            toolDiameter,
            cutDepth,
            cutterAngle,
            laserFeed,
            laserPower,
            laserSpot,
            laserSMin,
            laserSMax,
            laserGamma,
            laserOverscan,
            wavySpot: wavySpacing,
            wavyMinDepth: wavyShallow,
            wavyMaxDepth: wavyDeep,
            wavyFeed,
            halftoneResolution: halftoneRes,
            halftoneInvert,
            bitmap,
            trochoidEnabled:
                trochoid &&
                (operation === 'profile-outside' ||
                    operation === 'profile-inside'),
            trochoidEngagementPercent: engagement,
            feedRate,
            plungeRate,
            spindle,
            safeZ,
            passDepth,
            arcs: defaultArcs,
            overlapPercent: overlap,
            tabWidth,
            tabHeight,
            toolNumber,
            tabs,
            fileName: 'gcam',
        };
    };

    const handleGenerate = () => {
        // Laser ops don't use endmills; mill ops need a configured slot.
        if (!LASER_OPS.includes(operation)) {
            if (!activeSlot || !isConfigured(activeSlot)) {
                setStatus(
                    'Set up and select an endmill slot before creating a toolpath.',
                );
                return;
            }
            if (vbitMismatch) {
                setStatus(
                    `${operation === 'chamfer' ? 'Chamfer' : operation === 'vcarve' ? 'V-Carve' : operation === 'wavy-raster' ? 'Wavy' : 'Halftone'} requires a V-bit — pick one from your tool rack.`,
                );
                return;
            }
        }
        setBusy(true);
        setStatus('Building toolpath…');
        let args: ReturnType<typeof buildArgs>;
        try {
            args = buildArgs();
        } catch (e) {
            setStatus(e instanceof Error ? e.message : 'Raster needs a bitmap');
            setBusy(false);
            return;
        }
        buildToolpathGcode(args).then(
            (result) => {
                if (editEntry && onUpdate) {
                    onUpdate(editEntry.id, result, args);
                } else {
                    onResult(result, args);
                }
                setStatus(
                    `${result.label} — ${result.gcode.split('\n').length} lines.`,
                );
                setBusy(false);
            },
            (e) => {
                setStatus(e instanceof Error ? e.message : 'Engine error');
                setBusy(false);
            },
        );
    };

    // Live dashed draft preview (camcanvas draftToolpath): rebuild the
    // current form debounced in the CAM worker with progress, so the
    // canvas previews before committing. Falls back to a sync build if
    // the worker is unavailable. Unlike commit, the draft uses the live
    // form values directly so a preview renders even before a tool slot
    // is configured.
    const draftToken = useRef(0);
    const [draftError, setDraftError] = useState<string | null>(null);
    useEffect(() => {
        if (!onDraftPreview && !onDraftProgress) return;
        if (selected.length === 0 || !active.length) {
            onDraftPreview?.(null);
            onDraftProgress?.(null);
            setDraftError(null);
            return;
        }
        if (vbitMismatch) {
            // Don't fire the worker with a tool that can't run this
            // operation — the amber alert above already tells the user to
            // pick a V-bit. Firing anyway only surfaces a cryptic engine
            // error for a condition we can detect locally.
            onDraftPreview?.(null);
            onDraftProgress?.(null);
            setDraftError(null);
            return;
        }
        const token = ++draftToken.current;
        // CAMCanvas shows the worker badge as soon as a draft job starts.
        // Set this before the debounce so a real long-running operation is
        // visible for its whole run rather than only after a later callback.
        onDraftProgress?.({ percent: 4, label: 'Calculating toolpath' });
        const timer = window.setTimeout(() => {
            let args: ReturnType<typeof buildArgs>;
            try {
                args = buildArgs();
            } catch (e) {
                if (token === draftToken.current) {
                    onDraftPreview?.(null);
                    onDraftProgress?.(null);
                    setDraftError(
                        e instanceof Error ? e.message : 'Preview unavailable',
                    );
                }
                return;
            }
            const report = (percent: number, label: string) => {
                if (token !== draftToken.current) return;
                const numericPercent = Number(percent);
                const safePercent = Number.isFinite(numericPercent)
                    ? Math.min(100, Math.max(0, numericPercent))
                    : 0;
                onDraftProgress?.({
                    percent: safePercent,
                    label: label || 'Calculating toolpath',
                });
            };
            report(4, 'Calculating toolpath');
            // Race the worker against a timeout so a hung worker still
            // falls back to the sync build instead of stalling the preview.
            const raced = new Promise<ToolpathResult>((resolve, reject) => {
                const timer = window.setTimeout(
                    () => reject(new Error('Preview timed out')),
                    20000,
                );
                buildToolpathGcodeAsync({
                    ...args,
                    tabs: [],
                    onProgress: report,
                }).then(
                    (result) => {
                        window.clearTimeout(timer);
                        resolve(result);
                    },
                    (e) => {
                        window.clearTimeout(timer);
                        reject(e);
                    },
                );
            });
            raced.then(
                (result) => {
                    if (token !== draftToken.current) return;
                    onDraftPreview?.(result.previewContours);
                    onDraftProgress?.(null);
                    setDraftError(null);
                },
                (workerError) => {
                    // Worker fallback: sync main-thread build. Keep the
                    // pill up (indeterminate) so the wait is visible.
                    if (token !== draftToken.current) return;
                    report(4, 'Calculating toolpath');
                    buildToolpathGcode({ ...args, tabs: [] }).then(
                        (result) => {
                            if (token === draftToken.current) {
                                onDraftPreview?.(result.previewContours);
                                onDraftProgress?.(null);
                                setDraftError(null);
                            }
                        },
                        (e) => {
                            if (token === draftToken.current) {
                                onDraftPreview?.(null);
                                setDraftError(
                                    e instanceof Error
                                        ? e.message
                                        : workerError instanceof Error
                                          ? workerError.message
                                          : 'Preview unavailable',
                                );
                            }
                        },
                    );
                },
            );
        }, 400);
        return () => {
            window.clearTimeout(timer);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        operation,
        vbitMismatch,
        toolDiameter,
        cutDepth,
        cutterAngle,
        trochoid,
        engagement,
        laserFeed,
        laserPower,
        laserSpot,
        laserSMin,
        laserSMax,
        laserGamma,
        wavySpacing,
        wavyShallow,
        wavyDeep,
        wavyFeed,
        halftoneRes,
        halftoneInvert,
        feedRate,
        plungeRate,
        spindle,
        safeZ,
        passDepth,
        arcs,
        overlap,
        tabWidth,
        tabHeight,
        toolNumber,
        slotNum,
        slots,
        selected,
        loops,
        bitmaps,
    ]);

    if (!editEntry && (selected.length === 0 || active.length === 0)) {
        return (
            <div className="p-6 text-center space-y-2">
                <div className="font-medium text-slate-900 dark:text-white">
                    No vectors selected
                </div>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                    Click or box-select vectors on the canvas to create a
                    toolpath.
                </p>
            </div>
        );
    }

    return (
        <div className="p-3 space-y-3 text-sm">
            <div className="space-y-1 rounded-lg border border-slate-300 bg-slate-50/70 p-1 dark:border-robin-900 dark:bg-slate-900/70">
                {visibleOps.map((op) => (
                    <button
                        key={op.value}
                        onClick={() => setOperation(op.value)}
                        className={`flex w-full items-center gap-2 rounded-md border px-1.5 py-1 text-left text-xs font-medium transition-colors touch-manipulation ${
                            operation === op.value
                                ? 'border-robin-500 bg-robin-500/20 text-white ring-1 ring-robin-500/60'
                                : 'border-transparent text-slate-600 hover:border-robin-900/60 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-dark-lighter'
                        }`}
                    >
                        <span className="grid h-8 w-10 shrink-0 place-items-center overflow-hidden rounded border border-slate-300 bg-white dark:border-robin-900 dark:bg-dark">
                            {OPERATION_IMAGES[op.value] ? (
                                <img
                                    src={OPERATION_IMAGES[op.value]}
                                    alt=""
                                    className="h-full w-full object-contain dark:invert dark:hue-rotate-180"
                                />
                            ) : (
                                <span className="px-1 text-center text-[10px] leading-tight text-slate-400">
                                    {op.label}
                                </span>
                            )}
                        </span>
                        <span>{op.label}</span>
                    </button>
                ))}
            </div>
            {vbitMismatch && (
                <p
                    role="alert"
                    className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-xs text-amber-600 dark:text-amber-300"
                >
                    {operation === 'chamfer'
                        ? 'Chamfer'
                        : operation === 'vcarve'
                          ? 'V-Carve'
                          : operation === 'wavy-raster'
                            ? 'Wavy'
                            : 'Halftone'}{' '}
                    requires a V-Bit — pick one from your tool rack.
                </p>
            )}
            {draftError && (
                <p
                    role="alert"
                    className="rounded-lg border border-red-500/40 bg-red-500/10 px-2 py-1.5 text-xs text-red-600 dark:text-red-300"
                >
                    Preview unavailable — {draftError}
                </p>
            )}
            <div className="space-y-1">
                <div className="flex items-center justify-between">
                    <span className="text-slate-500 dark:text-slate-400 text-sm">
                        Tool library
                    </span>
                    <button
                        type="button"
                    onClick={() => setToolLibOpen(true)}
                        title="Open tool library"
                        aria-label="Open tool library"
                        className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-slate-300 dark:border-robin-900 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-dark-lighter hover:text-slate-900 dark:hover:text-white touch-manipulation"
                    >
                        <Settings size={18} />
                    </button>
                </div>
                <select
                    value={slotNum}
                    onChange={(e) => {
                        const n = Number(e.target.value);
                        setSlotNum(n);
                        const slot = slots.find((s) => s.slot === n);
                        if (slot && isConfigured(slot)) {
                            applySlot(slot);
                        } else {
                            setToolLibSlot(n);
                            setToolLibOpen(true);
                        }
                    }}
                    className="w-full rounded-lg bg-slate-100 dark:bg-dark-lighter border border-slate-300 dark:border-robin-900 px-2 py-2.5 text-slate-900 dark:text-white text-sm"
                    aria-label="Tool library slot"
                >
                    {slots.map((s) => (
                        <option key={s.slot} value={s.slot}>
                            {`T${s.slot} — ${s.name || 'empty'}${s.cuttingDiameterMm != null ? ` — Ø${displayValue(s.cuttingDiameterMm, units)}${lengthUnit(units)}` : ''}`}
                        </option>
                    ))}
                </select>
            </div>
            <ToolLibraryModal
                isOpen={toolLibOpen}
                initialSlot={toolLibSlot}
                units={units}
                onClose={() => {
                    setToolLibOpen(false);
                    setToolLibSlot(null);
                    if (typeof window !== 'undefined')
                        setSlots(loadSlots(window.localStorage));
                }}
                onSlotChange={(slot) => {
                    if (slot.slot === slotNum && isConfigured(slot))
                        applySlot(slot);
                }}
            />
            <div>
                {operation === 'pocket' && (
                    <label className="space-y-1">
                        <span className="text-slate-500 dark:text-slate-400">
                            Overlap %
                        </span>
                        <input
                            type="number"
                            min={0}
                            max={95}
                            step={1}
                            value={overlap}
                            onChange={(e) => setOverlap(Number(e.target.value))}
                            className="w-full rounded bg-slate-100 dark:bg-dark-lighter border border-slate-300 dark:border-robin-900 px-2 py-1 text-slate-900 dark:text-white"
                        />
                    </label>
                )}
            </div>
            {operation === 'halftone' && (
                <div className="grid grid-cols-2 gap-2">
                    <label className="space-y-1">
                        <span className="text-slate-500 dark:text-slate-400">
                            Holes across
                        </span>
                        <input
                            type="number"
                            min={2}
                            max={100}
                            value={halftoneRes}
                            onChange={(e) =>
                                setHalftoneRes(Number(e.target.value))
                            }
                            className="w-full rounded bg-slate-100 dark:bg-dark-lighter border border-slate-300 dark:border-robin-900 px-2 py-1 text-slate-900 dark:text-white"
                        />
                    </label>
                    <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 mt-5">
                        <input
                            type="checkbox"
                            checked={halftoneInvert}
                            onChange={(e) =>
                                setHalftoneInvert(e.target.checked)
                            }
                            className="accent-robin-500"
                        />
                        Light = large
                    </label>
                </div>
            )}
            {operation === 'wavy-raster' && (
                <div className="grid grid-cols-3 gap-2">
                    <label className="space-y-1">
                        <span className="text-slate-500 dark:text-slate-400">
                            Spacing ({lengthUnit(units)})
                        </span>
                        <UnitInput
                            units={units}
                            stepMm={0.1}
                            minMm={0.2}
                            valueMm={wavySpacing}
                            onChangeMm={setWavySpacing}
                            className="w-full rounded bg-slate-100 dark:bg-dark-lighter border border-slate-300 dark:border-robin-900 px-2 py-1 text-slate-900 dark:text-white"
                        />
                    </label>
                    <label className="space-y-1">
                        <span className="text-slate-500 dark:text-slate-400">
                            Feed ({feedUnit(units)})
                        </span>
                        <UnitInput
                            units={units}
                            kind="feed"
                            stepMm={10}
                            minMm={100}
                            valueMm={wavyFeed}
                            onChangeMm={setWavyFeed}
                            className="w-full rounded bg-slate-100 dark:bg-dark-lighter border border-slate-300 dark:border-robin-900 px-2 py-1 text-slate-900 dark:text-white"
                        />
                    </label>
                    <label className="space-y-1">
                        <span className="text-slate-500 dark:text-slate-400">
                            Shallow ({lengthUnit(units)})
                        </span>
                        <UnitInput
                            units={units}
                            stepMm={0.1}
                            minMm={0}
                            valueMm={wavyShallow}
                            onChangeMm={setWavyShallow}
                            className="w-full rounded bg-slate-100 dark:bg-dark-lighter border border-slate-300 dark:border-robin-900 px-2 py-1 text-slate-900 dark:text-white"
                        />
                    </label>
                    <label className="space-y-1">
                        <span className="text-slate-500 dark:text-slate-400">
                            Deep ({lengthUnit(units)})
                        </span>
                        <UnitInput
                            units={units}
                            stepMm={0.1}
                            minMm={0.1}
                            valueMm={wavyDeep}
                            onChangeMm={setWavyDeep}
                            className="w-full rounded bg-slate-100 dark:bg-dark-lighter border border-slate-300 dark:border-robin-900 px-2 py-1 text-slate-900 dark:text-white"
                        />
                    </label>
                </div>
            )}
            {operation === 'laser-raster' && (
                <div className="grid grid-cols-2 gap-2">
                    <label className="space-y-1">
                        <span className="text-slate-500 dark:text-slate-400">
                            Spot ({lengthUnit(units)})
                        </span>
                        <UnitInput
                            units={units}
                            stepMm={0.05}
                            minMm={0.05}
                            valueMm={laserSpot}
                            onChangeMm={setLaserSpot}
                            className="w-full rounded bg-slate-100 dark:bg-dark-lighter border border-slate-300 dark:border-robin-900 px-2 py-1 text-slate-900 dark:text-white"
                        />
                    </label>
                    <label className="space-y-1">
                        <span className="text-slate-500 dark:text-slate-400">
                            Gamma
                        </span>
                        <input
                            type="number"
                            step={0.1}
                            min={0.1}
                            value={laserGamma}
                            onChange={(e) =>
                                setLaserGamma(Number(e.target.value))
                            }
                            className="w-full rounded bg-slate-100 dark:bg-dark-lighter border border-slate-300 dark:border-robin-900 px-2 py-1 text-slate-900 dark:text-white"
                        />
                    </label>
                    <label className="space-y-1">
                        <span className="text-slate-500 dark:text-slate-400">
                            Min Power S
                        </span>
                        <input
                            type="number"
                            min={0}
                            max={1000}
                            value={laserSMin}
                            onChange={(e) =>
                                setLaserSMin(Number(e.target.value))
                            }
                            className="w-full rounded bg-slate-100 dark:bg-dark-lighter border border-slate-300 dark:border-robin-900 px-2 py-1 text-slate-900 dark:text-white"
                        />
                    </label>
                    <label className="space-y-1">
                        <span className="text-slate-500 dark:text-slate-400">
                            Overscan ({lengthUnit(units)})
                        </span>
                        <UnitInput
                            units={units}
                            stepMm={0.1}
                            minMm={0}
                            valueMm={laserOverscan}
                            onChangeMm={setLaserOverscan}
                            className="w-full rounded bg-slate-100 dark:bg-dark-lighter border border-slate-300 dark:border-robin-900 px-2 py-1 text-slate-900 dark:text-white"
                        />
                    </label>
                    <label className="space-y-1">
                        <span className="text-slate-500 dark:text-slate-400">
                            Max Power S
                        </span>
                        <input
                            type="number"
                            min={0}
                            max={1000}
                            value={laserSMax}
                            onChange={(e) =>
                                setLaserSMax(Number(e.target.value))
                            }
                            className="w-full rounded bg-slate-100 dark:bg-dark-lighter border border-slate-300 dark:border-robin-900 px-2 py-1 text-slate-900 dark:text-white"
                        />
                    </label>
                </div>
            )}
            {(operation === 'laser-cut' || operation === 'laser-raster') && (
                <div className="grid grid-cols-2 gap-2">
                    <label className="space-y-1">
                        <span className="text-slate-500 dark:text-slate-400">
                            Feed ({feedUnit(units)})
                        </span>
                        <UnitInput
                            units={units}
                            kind="feed"
                            valueMm={laserFeed}
                            onChangeMm={setLaserFeed}
                            className="w-full rounded bg-slate-100 dark:bg-dark-lighter border border-slate-300 dark:border-robin-900 px-2 py-1 text-slate-900 dark:text-white"
                        />
                    </label>
                    <label className="space-y-1">
                        <span className="text-slate-500 dark:text-slate-400">
                            Power S
                        </span>
                        <input
                            type="number"
                            min={0}
                            max={1000}
                            value={laserPower}
                            onChange={(e) =>
                                setLaserPower(Number(e.target.value))
                            }
                            className="w-full rounded bg-slate-100 dark:bg-dark-lighter border border-slate-300 dark:border-robin-900 px-2 py-1 text-slate-900 dark:text-white"
                        />
                    </label>
                </div>
            )}
            {(operation === 'profile-outside' ||
                operation === 'profile-inside') && (
                <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                    <input
                        type="checkbox"
                        checked={trochoid}
                        onChange={(e) => setTrochoid(e.target.checked)}
                        className="accent-robin-500"
                    />
                    Trochoidal clearing
                    {trochoid && (
                        <span className="inline-flex items-center gap-1">
                            <input
                                type="number"
                                min={2}
                                max={40}
                                value={engagement}
                                onChange={(e) =>
                                    setEngagement(Number(e.target.value))
                                }
                                className="w-14 rounded bg-slate-100 dark:bg-dark-lighter border border-slate-300 dark:border-robin-900 px-1 py-0.5 text-slate-900 dark:text-white"
                            />
                            %
                        </span>
                    )}
                </label>
            )}
            {(operation === 'profile-outside' ||
                operation === 'profile-inside' ||
                operation === 'laser-cut') && (
                <div className="grid grid-cols-2 gap-2">
                    <label className="space-y-1">
                        <span className="text-slate-500 dark:text-slate-400">
                            Tab width ({lengthUnit(units)})
                        </span>
                        <UnitInput
                            units={units}
                            stepMm={0.1}
                            minMm={3}
                            maxMm={50}
                            valueMm={tabWidth}
                            onChangeMm={setTabWidth}
                            className="w-full rounded bg-slate-100 dark:bg-dark-lighter border border-slate-300 dark:border-robin-900 px-2 py-1 text-slate-900 dark:text-white"
                        />
                    </label>
                    <label className="space-y-1">
                        <span className="text-slate-500 dark:text-slate-400">
                            Tab height ({lengthUnit(units)})
                        </span>
                        <UnitInput
                            units={units}
                            stepMm={0.1}
                            minMm={0}
                            valueMm={tabHeight}
                            onChangeMm={(v) => {
                                setTabHeight(v);
                                setAutoTabHeight(
                                    Math.abs(v - Math.max(0.1, cutDepth / 2)) <
                                        0.0001,
                                );
                            }}
                            className="w-full rounded bg-slate-100 dark:bg-dark-lighter border border-slate-300 dark:border-robin-900 px-2 py-1 text-slate-900 dark:text-white"
                        />
                    </label>
                </div>
            )}
            <button
                onClick={handleGenerate}
                disabled={!active.length || busy}
                className="w-full rounded-lg bg-green-500 hover:bg-green-600 disabled:opacity-40 text-white px-3 py-3 text-base font-medium touch-manipulation"
            >
                {busy ? 'Building…' : editEntry ? 'Save Toolpath' : submitLabel}
                {!editEntry && selected.length > 0
                    ? ` (${selected.length} selected)`
                    : ''}
            </button>
            {editEntry && onCancelEdit && (
                <button
                    onClick={onCancelEdit}
                    className="w-full rounded-lg border border-slate-300 dark:border-robin-900 px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-dark-lighter touch-manipulation"
                >
                    Cancel Edit
                </button>
            )}
            <p className="text-xs text-slate-500 dark:text-slate-400">
                {status}
            </p>
        </div>
    );
}
