/**
 * Purpose: Implementation module for ToolpathPanel in the react domain.
 */
import { useEffect, useRef, useState } from 'react';
import type { ViewLoop } from '../canvas/types';
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
import { isConfigured, loadSlots, type ToolSlot } from '../tools/library';
import { displayValue, type UnitSystem } from '../lib/units';
import { OPERATIONS, RASTER_OPERATIONS } from './operationCatalog';
import { ToolpathOperationPicker } from './ToolpathOperationPicker';
import { TextureFields } from './TextureFields';
import { CuttingFields } from './CuttingFields';
import { RasterLaserFields } from './RasterLaserFields';
import { VBitRasterFields } from './VBitRasterFields';
import { ToolSelectionFields } from './ToolSelectionFields';
import { ToolpathFormAlerts } from './ToolpathFormAlerts';
import { ToolpathSubmitControls } from './ToolpathSubmitControls';
import { ToolpathEmptyState } from './ToolpathEmptyState';

type DraftContour = { x: number; y: number }[] & {
    _intensity?: number;
    _solidPreview?: boolean;
};

function canvasDraftContours(
    contours: { x: number; y: number }[][],
    solid: boolean,
): DraftContour[] {
    if (!solid) return contours;
    return contours.map((points) =>
        Object.assign([...points], {
            _intensity: (points as DraftContour)._intensity,
            _solidPreview: true,
        }),
    );
}

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
    const [textureSpacing, setTextureSpacing] = useState(5);
    const [crosshatchAngle, setCrosshatchAngle] = useState(45);
    const [textureType, setTextureType] = useState<'voronoi' | 'crosshatch'>(
        'voronoi',
    );
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
    const NEEDS_VBIT: Operation[] = [
        'vcarve',
        'texture-fill',
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
        setTextureSpacing(num(a.textureSpacing, 5));
        setCrosshatchAngle(num(a.crosshatchAngle, 45));
        setTextureType(
            a.textureType === 'crosshatch' ? 'crosshatch' : 'voronoi',
        );
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
    const hasBitmap = active.some((l) => l.bitmapId);
    const hasVector = active.some((l) => !l.bitmapId);
    const visibleOps = OPERATIONS.filter((op) => {
        const raster = RASTER_OPERATIONS.includes(op.value);
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
            textureType,
            textureSpacing,
            crosshatchAngle,
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
                    `${operation === 'chamfer' ? 'Chamfer' : operation === 'vcarve' ? 'V-Carve' : operation === 'texture-fill' ? 'Texture Fill' : operation === 'wavy-raster' ? 'Wavy' : 'Halftone'} requires a V-bit — pick one from your tool rack.`,
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
    const solidDraftPreview =
        operation === 'laser-raster' ||
        (operation === 'texture-fill' && textureType === 'crosshatch');
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
                    onDraftPreview?.(
                        canvasDraftContours(
                            result.previewContours,
                            solidDraftPreview,
                        ),
                    );
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
                                onDraftPreview?.(
                                    canvasDraftContours(
                                        result.previewContours,
                                        solidDraftPreview,
                                    ),
                                );
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
        textureType,
        textureSpacing,
        crosshatchAngle,
        solidDraftPreview,
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
        return <ToolpathEmptyState />;
    }

    return (
        <div className="p-3 space-y-3 text-sm">
            <ToolpathOperationPicker
                operation={operation}
                operations={visibleOps}
                onChange={setOperation}
            />
            <ToolpathFormAlerts
                operation={operation}
                vbitMismatch={vbitMismatch}
                draftError={draftError}
            />
            <ToolSelectionFields
                slots={slots}
                slotNum={slotNum}
                units={units}
                libraryOpen={toolLibOpen}
                librarySlot={toolLibSlot}
                onOpenLibrary={() => setToolLibOpen(true)}
                onSelectSlot={(slotNumber) => {
                    setSlotNum(slotNumber);
                    const slot = slots.find((item) => item.slot === slotNumber);
                    if (slot && isConfigured(slot)) {
                        applySlot(slot);
                    } else {
                        setToolLibSlot(slotNumber);
                        setToolLibOpen(true);
                    }
                }}
                onCloseLibrary={() => {
                    setToolLibOpen(false);
                    setToolLibSlot(null);
                    if (typeof window !== 'undefined')
                        setSlots(loadSlots(window.localStorage));
                }}
                onConfiguredSlot={applySlot}
            />
            <CuttingFields
                operation={operation}
                units={units}
                overlap={overlap}
                onOverlapChange={setOverlap}
                trochoid={trochoid}
                onTrochoidChange={setTrochoid}
                engagement={engagement}
                onEngagementChange={setEngagement}
                tabWidth={tabWidth}
                onTabWidthChange={setTabWidth}
                tabHeight={tabHeight}
                onTabHeightChange={(value) => {
                    setTabHeight(value);
                    setAutoTabHeight(
                        Math.abs(value - Math.max(0.1, cutDepth / 2)) < 0.0001,
                    );
                }}
            />
            <VBitRasterFields
                operation={operation}
                units={units}
                halftoneResolution={halftoneRes}
                onHalftoneResolutionChange={setHalftoneRes}
                halftoneInvert={halftoneInvert}
                onHalftoneInvertChange={setHalftoneInvert}
                wavySpacing={wavySpacing}
                onWavySpacingChange={setWavySpacing}
                wavyFeed={wavyFeed}
                onWavyFeedChange={setWavyFeed}
                wavyShallow={wavyShallow}
                onWavyShallowChange={setWavyShallow}
                wavyDeep={wavyDeep}
                onWavyDeepChange={setWavyDeep}
            />
            {operation === 'texture-fill' && (
                <TextureFields
                    units={units}
                    textureType={textureType}
                    textureSpacing={textureSpacing}
                    crosshatchAngle={crosshatchAngle}
                    onTypeChange={setTextureType}
                    onSpacingChange={setTextureSpacing}
                    onCrosshatchAngleChange={setCrosshatchAngle}
                />
            )}
            <RasterLaserFields
                operation={operation}
                units={units}
                laserFeed={laserFeed}
                onLaserFeedChange={setLaserFeed}
                laserPower={laserPower}
                onLaserPowerChange={setLaserPower}
                laserSpot={laserSpot}
                onLaserSpotChange={setLaserSpot}
                laserGamma={laserGamma}
                onLaserGammaChange={setLaserGamma}
                laserSMin={laserSMin}
                onLaserSMinChange={setLaserSMin}
                laserSMax={laserSMax}
                onLaserSMaxChange={setLaserSMax}
                laserOverscan={laserOverscan}
                onLaserOverscanChange={setLaserOverscan}
            />
            <ToolpathSubmitControls
                busy={busy}
                hasActiveGeometry={active.length > 0}
                editEntry={editEntry !== null}
                submitLabel={submitLabel}
                selectedCount={selected.length}
                status={status}
                onGenerate={handleGenerate}
                onCancelEdit={onCancelEdit}
            />
        </div>
    );
}
