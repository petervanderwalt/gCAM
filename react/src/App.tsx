/**
 * Purpose: Implementation module for App in the react domain.
 */
import { useState } from 'react';
import type { ViewLoop } from './canvas/types';
import { useConfirmation } from './components/ConfirmDialog';
import { useToasts } from './components/Toasts';
import { useAppKeyboardShortcuts } from './interactions/useAppKeyboardShortcuts';
import { useGuideCommands } from './interactions/useGuideCommands';
import { useFileLoading } from './document/useFileLoading';
import { useArrangeCommands } from './interactions/useArrangeCommands';
import { useTransformCommands } from './interactions/useTransformCommands';
import { useCornerCommands } from './interactions/useCornerCommands';
import {
    type ToolpathStackEntry,
    useToolpathStack,
} from './toolpaths/useToolpathStack';
import { useToolpathPresentation } from './toolpaths/useToolpathPresentation';
import { formatLength as formatLengthValue } from './lib/units';
import { snapToGuides } from './lib/guides';
import { useSelectionFrame } from './interactions/useSelectionFrame';
import { ErrorBoundary } from './app/ErrorBoundary';
import { AppWorkspace } from './app/AppWorkspace';
import { AppHeader } from './app/AppHeader';
import { AppModalLayer } from './app/AppModalLayer';
import { useAppPreferences } from './app/useAppPreferences';
import { useDrawingWorkspaceState } from './app/useDrawingWorkspaceState';
import { useTransformWorkspaceState } from './app/useTransformWorkspaceState';
import { useArrangeWorkspaceState } from './app/useArrangeWorkspaceState';
import { usePreviewState } from './app/usePreviewState';
import { useVisibleSelection } from './interactions/useVisibleSelection';
import { useDocumentWorkspace } from './document/useDocumentWorkspace';
import type { PlacedBitmapRecord } from './document/useBitmapCommands';
import type { Guide } from './lib/guides';
import { useCadInspector } from './interactions/useCadInspector';
import { useEditorLifecycle } from './app/useEditorLifecycle';
import { createToolbarProps } from './app/createToolbarProps';
import { createWorkspaceModel } from './app/createWorkspaceModel';
import { useDocumentEditingCommands } from './app/useDocumentEditingCommands';

type StackEntry = ToolpathStackEntry;
type PlacedBitmap = PlacedBitmapRecord;

/**
 * gCAM React shell — gSender visual language (robin/blue palette, dark slate
 * chrome, compact panels) with the gCAM workflow: import → select → toolpath
 * stack → combined export for gSender.
 */
export default function App() {
    const drawing = useDrawingWorkspaceState();
    const transforms = useTransformWorkspaceState();
    const arrange = useArrangeWorkspaceState();
    const previews = usePreviewState();
    const {
        activeTool,
        setActiveTool,
        emptyStateDismissed,
        setEmptyStateDismissed,
        bitmapImportChoice,
        setBitmapImportChoice,
        pendingTraceBitmap,
        setPendingTraceBitmap,
        traceOpen,
        setTraceOpen,
        tabMode,
        setTabMode,
        drawTool,
        setDrawTool,
        drawSides,
        drawPolygonMode,
        drawText,
        setDrawText,
        drawTextHeight,
        setDrawTextHeight,
        drawFont,
        setDrawFont,
        textAnchor,
        setTextAnchor,
        treeOpen,
        setTreeOpen,
        guidePlacement,
        setGuidePlacement,
    } = drawing;
    const {
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
    } = transforms;
    const {
        offsetAmount,
        setOffsetAmount,
        sheetW,
        setSheetW,
        sheetH,
        setSheetH,
        nestBorder,
        setNestBorder,
        nestSpacing,
        setNestSpacing,
        cornerRadius,
        setCornerRadius,
        cornerTool,
        setCornerTool,
    } = arrange;
    const {
        draftPreview,
        setDraftPreview,
        offsetPreview,
        setOffsetPreview,
        booleanPreview,
        setBooleanPreview,
        draftProgress,
        setDraftProgress,
    } = previews;
    const [viewportCommand, setViewportCommand] = useState<{
        type: 'fit' | 'zoomIn' | 'zoomOut';
        token: number;
    }>();
    const [preserveViewToken, setPreserveViewToken] = useState(0);
    const {
        grid,
        setGrid,
        sideTab,
        setSideTab,
        previewControls,
        setPreviewControls,
        configActions,
        setConfigActions,
        darkMode,
        setDarkMode,
        emitArcs,
        setEmitArcs,
        units,
        setUnits,
        machineProfileId,
        setMachineProfileId,
        machineTravelLimits,
        setMachineTravelLimits,
    } = useAppPreferences();
    const formatLength = (valueMm: number, decimals = 2) =>
        formatLengthValue(valueMm, units, decimals);
    const [status, setStatus] = useState('Import a DXF or SVG to begin.');
    const document = useDocumentWorkspace({
        setStatus,
        setDraftPreview,
        setBitmapImportChoice,
    });
    const {
        bounds,
        setBounds,
        fileName,
        setFileName,
        fileRef,
        projectRef,
        loops,
        setLoops,
        selected,
        setSelected,
        hidden,
        setHidden,
        stack,
        setStack,
        bitmaps,
        setBitmaps,
        guides,
        setGuides,
        stock,
        setStock,
        pushHistory,
        restore,
        undoDocument,
        redoDocument,
        canUndo,
        canRedo,
        newLoopId,
        withIds,
        refreshBounds,
        importVector,
        handleBitmapFile,
        commitBitmapPlacement,
        updateSurfaceSetupOrientation,
        commitTraced,
        isBitmapFile,
    } = document;
    // Toolpath being edited back in the form (legacy edit flow).
    const [editingId, setEditingId] = useState<string | null>(null);
    const { toasts, showToast, dismiss: dismissToast } = useToasts();
    const { confirm, dialog: confirmDialog } = useConfirmation();
    const { expandedSelectedIds, selectedLoops, offsetSource, booleanLoops } =
        useVisibleSelection(loops, selected, hidden);
    const undo = () => {
        if (!undoDocument()) return;
        setStatus('Undone.');
    };

    const redo = () => {
        if (!redoDocument()) return;
        setStatus('Redone.');
    };

    const { selectionFrame, orientRef } = useSelectionFrame({
        loops,
        selected,
        hidden,
        selectedLoops,
        setMoveX,
        setMoveY,
        setSizeW,
        setSizeH,
        setRotateDeg,
    });

    const {
        handleResult,
        handleUpdateResult,
        rebuildEntryTabs,
        handlePlaceTab,
        handleMoveTab,
        handleDeleteTab,
    } = useToolpathStack({
        stack,
        setStack,
        setSelected,
        pushHistory,
        setStatus,
        setDraftPreview,
        setDraftProgress,
        setEditingId,
        showToast,
    });

    const traceTarget =
        selected.length === 1 ? (selectedLoops()[0]?.bitmapId ?? null) : null;
    const traceBitmap = bitmaps.find((b) => b.id === traceTarget) ?? null;
    const traceSource = pendingTraceBitmap?.entry ?? traceBitmap;
    const traceImg = traceSource?.img ?? null;

    const {
        inspectorPreview,
        inspector: buildInspector,
        dismiss: dismissInspector,
    } = useCadInspector({
        selected,
        selectedLoops,
        transformMode,
        orientRef,
        newLoopId,
        pushHistory,
        refreshBounds,
        setLoops,
        setSelected,
        setStack,
        setDraftPreview,
        setStatus,
    });

    const [loadingSample, setLoadingSample] = useState(false);
    const { handleFiles, handleLoadSample } = useFileLoading({
        isBitmapFile,
        loadBitmap: handleBitmapFile,
        isSurfaceModelFile: (file) => /\.(stl|obj)$/i.test(file.name),
        loadSurfaceModel: document.handleSurfaceModelFile,
        importVector,
        setStatus,
        setLoadingSample,
    });

    const { handleFillet, handleDogbone, handleCorner, handleChamfer } =
        useCornerCommands<ViewLoop, StackEntry>({
            loops,
            cornerRadius,
            cornerTool,
            selectedLoops,
            withIds,
            formatLength,
            replaceSelection: (items, note) => replaceSelection(items, note),
            pushHistory,
            refreshBounds,
            setLoops,
            setSelected,
            setStack,
            setCornerTool,
            setTransformMode,
            setStatus,
        });

    const {
        applyAbsoluteMove,
        applyAbsoluteRotate,
        applyAbsoluteSize,
        setSizeWLocked,
        setSizeHLocked,
        handleTransformCommit,
    } = useTransformCommands<ViewLoop, StackEntry, PlacedBitmap>({
        selectionFrame,
        selectedLoops,
        moveX,
        moveY,
        rotateDeg,
        sizeW,
        sizeH,
        aspectLock,
        orientRef,
        formatLength,
        pushHistory,
        refreshBounds,
        setLoops,
        setBitmaps,
        setStack,
        setDraftPreview,
        setTransformMode,
        setPreserveViewToken,
        setStatus,
        setRotateDeg,
        setSizeW,
        setSizeH,
    });

    const { startGuidePlacement, placeGuide, handleDeleteGuide } =
        useGuideCommands({
            formatLength,
            pushHistory,
            setGuides,
            setGuidePlacement,
            setStatus,
        });

    const { handleNest, handleBoolean, handleOffset, replaceSelection } =
        useArrangeCommands<ViewLoop, StackEntry>({
            loops,
            selected,
            offsetAmount,
            sheetW,
            sheetH,
            nestBorder,
            nestSpacing,
            selectedLoops,
            expandedSelectedIds,
            withIds,
            formatLength,
            pushHistory,
            refreshBounds,
            setLoops,
            setSelected,
            setStack,
            setDraftPreview,
            setOffsetPreview,
            setStatus,
        });

    const {
        handleExportProject,
        handleImportProject,
        handleTrimAt,
        handleTrimStroke,
        handleCommitLoop,
        handleCommitText,
        handleDeleteLoop,
        handleDeleteSelected,
        handleDuplicateSelected,
        handleGroup,
        handleUngroup,
        canGroup,
        canUngroup,
        handleNewCanvas,
    } = useDocumentEditingCommands({
        document,
        drawing,
        transforms,
        expandedSelectedIds,
        confirm,
        setStatus,
        setDraftPreview,
        setEmptyStateDismissed,
        setDraftProgress,
        setOffsetPreview,
        setBooleanPreview,
        setEditingId,
    });

    const { editingEntry, preview, tabMarkers, gcode, previewToolpaths } =
        useToolpathPresentation({
            stack,
            editingId,
            fileName,
            emitArcs,
            units,
        });

    useEditorLifecycle({
        textAnchor,
        clearTextAnchor: () => setTextAnchor(null),
        loops,
        selected,
        moveAfterCloneRef,
        setTransformMode,
    });

    useAppKeyboardShortcuts({
        hasSelection: selected.length > 0,
        setActiveTool: () => setActiveTool('select'),
        clearTransform: () => setTransformMode(null),
        clearGuidePlacement: () => setGuidePlacement(null),
        fitViewport: () =>
            setViewportCommand({ type: 'fit', token: Date.now() }),
        undo,
        redo,
        deleteSelected: handleDeleteSelected,
        duplicateSelected: handleDuplicateSelected,
    });

    const toolbarProps = createToolbarProps({
        units,
        drawing,
        transforms,
        arrange,
        loops,
        selected,
        guides,
        offsetSource,
        booleanSource: booleanLoops,
        canUndo,
        canRedo,
        canGroup,
        canUngroup,
        traceAvailable: traceImg !== null,
        darkMode,
        snapToGrid: grid.snap,
        fileRef,
        projectRef,
        setGrid,
        setSideTab,
        setDarkMode,
        setViewportCommand,
        setOffsetPreview,
        setBooleanPreview,
        actions: {
            applyMove: applyAbsoluteMove,
            applyRotate: applyAbsoluteRotate,
            applyScale: applyAbsoluteSize,
            setSizeW: setSizeWLocked,
            setSizeH: setSizeHLocked,
            applyFillet: handleFillet,
            applyChamfer: handleChamfer,
            applyDogbone: handleDogbone,
            applyOffset: handleOffset,
            applyBoolean: handleBoolean,
            applyNest: handleNest,
            addGuide: startGuidePlacement,
            deleteGuide: handleDeleteGuide,
            duplicate: handleDuplicateSelected,
            deleteSelected: handleDeleteSelected,
            trace: () => setTraceOpen(true),
            undo,
            redo,
            exportProject: handleExportProject,
            importProject: () => projectRef.current?.click(),
            newCanvas: handleNewCanvas,
            group: handleGroup,
            ungroup: handleUngroup,
        },
    });

    const inspector = buildInspector(units);
    const toolpathRailProps = {
        loops,
        selected,
        bitmaps,
        stack,
        gcode,
        fileName,
        units,
        emitArcs,
        machineProfileId,
        machineTravelLimits,
        stock,
        setStock,
        editingId,
        editingEntry,
        tabMode,
        setTabMode,
        setEditingId,
        setStack,
        setSideTab,
        setStatus,
        setDraftPreview,
        setDraftProgress,
        onResult: handleResult,
        onUpdate: handleUpdateResult,
        rebuildEntryTabs,
        confirm,
        showToast,
    };
    const previewWorkspaceProps = {
        toolpaths: previewToolpaths,
        gcode,
        fileName,
        darkMode,
        stock,
        onPreviewControlsChange: setPreviewControls,
    };
    const configPanelProps = {
        darkMode,
        onDarkModeChange: setDarkMode,
        grid,
        onGridChange: setGrid,
        emitArcs,
        onEmitArcsChange: setEmitArcs,
        units,
        onUnitsChange: setUnits,
        machineProfileId,
        onMachineProfileChange: setMachineProfileId,
        machineTravelLimits,
        onMachineTravelLimitsChange: setMachineTravelLimits,
        onActionsChange: setConfigActions,
    };
    const workspaceModel = createWorkspaceModel({
        activeTab: sideTab,
        onTabChange: setSideTab,
        drawing,
        transforms,
        arrange,
        previews,
        document,
        inspectorPreview,
        preview,
        tabMarkers,
        canvasActions: {
            onPlaceTab: handlePlaceTab,
            onMoveTab: handleMoveTab,
            onDeleteTab: handleDeleteTab,
            onPlaceGuide: placeGuide,
            onCancelGuide: () => setGuidePlacement(null),
            onCommitLoop: handleCommitLoop,
            onTrimAt: handleTrimAt,
            onTrimStroke: handleTrimStroke,
            onCommitText: (at) => setTextAnchor(snapToGuides(at, guides)),
            onTransformCommit: handleTransformCommit,
            onFilletCorner: handleCorner,
            preserveViewToken,
            viewportCommand,
        },
        objectTreeActions: {
            onToggleHidden: (id) => {
                pushHistory();
                setHidden((current) =>
                    current.includes(id)
                        ? current.filter((hiddenId) => hiddenId !== id)
                        : [...current, id],
                );
            },
            onDelete: handleDeleteLoop,
            onGroup: toolbarProps.onGroup,
            onUngroup: toolbarProps.onUngroup,
            canGroup: toolbarProps.canGroup,
            canUngroup: toolbarProps.canUngroup,
            onEdit: dismissInspector,
            onMove: () => setTransformMode('move'),
            onResize: () => setTransformMode('scale'),
            onClose: () => setTreeOpen(false),
        },
        showEmptyState: !loops.length && !emptyStateDismissed,
        onNewCanvas: handleNewCanvas,
        onImport: () => fileRef.current?.click(),
        onLoadSample: () => void handleLoadSample(),
        loadingSample,
        status,
        onDropFiles: (files) => void handleFiles(files),
        inspector,
        toolpathRailProps,
        previewWorkspaceProps,
        configPanelProps,
    });

    return (
        <ErrorBoundary>
            <div className="h-screen w-screen overflow-hidden flex flex-col bg-slate-100 text-slate-900 dark:bg-dark-darker dark:text-slate-200">
                <AppHeader
                    activeTab={sideTab}
                    toolbarProps={toolbarProps}
                    previewControls={previewControls}
                    configActions={configActions}
                />

                <input
                    ref={fileRef}
                    type="file"
                    accept=".dxf,.svg,.png,.jpg,.jpeg,.webp,.bmp,.stl,.obj"
                    className="hidden"
                    aria-label="Import drawing file"
                    onChange={(event) => {
                        void handleFiles(event.currentTarget.files);
                        event.currentTarget.value = '';
                    }}
                />
                <input
                    ref={projectRef}
                    type="file"
                    accept=".gcam,.json,application/json"
                    className="hidden"
                    aria-label="Import project file"
                    onChange={(event) => {
                        void handleImportProject(event.currentTarget.files);
                        event.currentTarget.value = '';
                    }}
                />

                <AppWorkspace model={workspaceModel} />
                <AppModalLayer
                    units={units}
                    textAnchor={textAnchor}
                    drawText={drawText}
                    drawFont={drawFont}
                    drawTextHeight={drawTextHeight}
                    setDrawText={setDrawText}
                    setDrawFont={setDrawFont}
                    setDrawTextHeight={setDrawTextHeight}
                    onCommitText={handleCommitText}
                    setTextAnchor={setTextAnchor}
                    setStatus={setStatus}
                    toasts={toasts}
                    dismissToast={dismissToast}
                    confirmation={confirmDialog}
                    bitmapImportChoice={bitmapImportChoice}
                    commitBitmapPlacement={commitBitmapPlacement}
                    updateSurfaceSetupOrientation={updateSurfaceSetupOrientation}
                    setBitmapImportChoice={setBitmapImportChoice}
                    setPendingTraceBitmap={setPendingTraceBitmap}
                    traceOpen={traceOpen}
                    setTraceOpen={setTraceOpen}
                    traceSource={traceSource}
                    fileName={fileName}
                    commitTraced={commitTraced}
                />
            </div>
        </ErrorBoundary>
    );
}
