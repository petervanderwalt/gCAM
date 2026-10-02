/**
 * Purpose: Application composition module for AppModalLayer.
 */
import type {
    ComponentProps,
    Dispatch,
    ReactNode,
    SetStateAction,
} from 'react';
import { ToastStack } from '../components/Toasts';
import { TraceModal } from '../components/TraceModal';
import { type ViewLoop } from '../canvas/types';
import {
    type BitmapImportChoice,
    type PlacedBitmapRecord,
} from '../document/useBitmapCommands';
import { type UnitSystem } from '../lib/units';
import { type PlacedTrace } from '../lib/trace';
import { ModalLayer } from './ModalLayer';

type Point = { x: number; y: number };

interface AppModalLayerProps {
    units: UnitSystem;
    textAnchor: Point | null;
    drawText: string;
    drawFont: string;
    drawTextHeight: number;
    setDrawText: Dispatch<SetStateAction<string>>;
    setDrawFont: Dispatch<SetStateAction<string>>;
    setDrawTextHeight: Dispatch<SetStateAction<number>>;
    onCommitText(anchor: Point): Promise<void>;
    setTextAnchor: Dispatch<SetStateAction<Point | null>>;
    setStatus: Dispatch<SetStateAction<string>>;
    toasts: ComponentProps<typeof ToastStack>['toasts'];
    dismissToast: ComponentProps<typeof ToastStack>['onDismiss'];
    confirmation: ReactNode;
    bitmapImportChoice: BitmapImportChoice<ViewLoop> | null;
    commitBitmapPlacement(choice: BitmapImportChoice<ViewLoop>): void;
    updateSurfaceSetupOrientation(
        choice: BitmapImportChoice<ViewLoop>,
        machineUp: [number, number, number],
    ): Promise<void>;
    setBitmapImportChoice: Dispatch<
        SetStateAction<BitmapImportChoice<ViewLoop> | null>
    >;
    setPendingTraceBitmap: Dispatch<
        SetStateAction<BitmapImportChoice<ViewLoop> | null>
    >;
    traceOpen: boolean;
    setTraceOpen: Dispatch<SetStateAction<boolean>>;
    traceSource: PlacedBitmapRecord | null;
    fileName: string;
    commitTraced(traced: PlacedTrace[], replaceBitmapId?: string): void;
}

/** Binds document commands to the shared transient-dialog layer. */
export function AppModalLayer({
    units,
    textAnchor,
    drawText,
    drawFont,
    drawTextHeight,
    setDrawText,
    setDrawFont,
    setDrawTextHeight,
    onCommitText,
    setTextAnchor,
    setStatus,
    toasts,
    dismissToast,
    confirmation,
    bitmapImportChoice,
    commitBitmapPlacement,
    updateSurfaceSetupOrientation,
    setBitmapImportChoice,
    setPendingTraceBitmap,
    traceOpen,
    setTraceOpen,
    traceSource,
    fileName,
    commitTraced,
}: AppModalLayerProps) {
    const traceImage = traceSource?.img ?? null;
    return (
        <ModalLayer
            text={{
                open: textAnchor !== null,
                props: {
                    units,
                    text: drawText,
                    font: drawFont,
                    heightMm: drawTextHeight,
                    onTextChange: setDrawText,
                    onFontChange: setDrawFont,
                    onHeightChange: setDrawTextHeight,
                    onSubmit: async () => {
                        if (!textAnchor) return;
                        try {
                            await onCommitText(textAnchor);
                            setTextAnchor(null);
                        } catch (error) {
                            setStatus(
                                error instanceof Error
                                    ? error.message
                                    : 'Could not add text.',
                            );
                        }
                    },
                },
                onClose: () => setTextAnchor(null),
            }}
            toast={<ToastStack toasts={toasts} onDismiss={dismissToast} />}
            confirmation={confirmation}
            bitmap={
                bitmapImportChoice
                    ? {
                          choice: {
                              ...bitmapImportChoice,
                              isSurfaceModel: Boolean(bitmapImportChoice.entry.surfaceMesh),
                              surfaceMachinableTopDown: bitmapImportChoice.entry.surfaceMachinableTopDown,
                              surfacePreviewUrl: bitmapImportChoice.entry.dataUrl,
                              machineUp: bitmapImportChoice.entry.surfaceMesh?.machineUp,
                          },
                          onSetupOrientation: (machineUp) => updateSurfaceSetupOrientation(bitmapImportChoice, machineUp),
                          onUseBitmap: () => {
                              commitBitmapPlacement(bitmapImportChoice);
                              setBitmapImportChoice(null);
                          },
                          onTrace: () => {
                              setPendingTraceBitmap(bitmapImportChoice);
                              setBitmapImportChoice(null);
                              setTraceOpen(true);
                          },
                          onCancel: () => setBitmapImportChoice(null),
                      }
                    : null
            }
            trace={{
                open: traceOpen,
                props:
                    traceImage && traceSource
                        ? {
                              fileName: fileName || 'bitmap',
                              img: traceImage,
                              originX: traceSource.x,
                              originY: traceSource.y,
                              widthMm: traceSource.w,
                              heightMm: traceSource.h,
                              onClose: () => {
                                  setTraceOpen(false);
                                  setPendingTraceBitmap(null);
                              },
                              onImport: (traced) => {
                                  setTraceOpen(false);
                                  commitTraced(traced, traceSource.id);
                                  setPendingTraceBitmap(null);
                              },
                          }
                        : null,
            }}
        />
    );
}
