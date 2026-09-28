/**
 * Purpose: Application composition module for ModalLayer.
 */
import type { ComponentProps, ReactNode } from 'react';
import { TraceModal } from '../components/TraceModal';
import { TextPlacementModal } from '../draw/TextPlacementModal';
import {
    BitmapImportModal,
    type BitmapImportModalProps,
} from '../document/BitmapImportModal';

interface TextModalProps {
    open: boolean;
    props: Omit<ComponentProps<typeof TextPlacementModal>, 'onClose'>;
    onClose: () => void;
}

interface TraceModalProps {
    open: boolean;
    props: ComponentProps<typeof TraceModal> | null;
}

interface ModalLayerProps {
    text: TextModalProps;
    bitmap: BitmapImportModalProps | null;
    trace: TraceModalProps;
    toast: ReactNode;
    confirmation: ReactNode;
}

/** Transient editors and dialogs that sit above every workspace tab. */
export function ModalLayer({
    text,
    bitmap,
    trace,
    toast,
    confirmation,
}: ModalLayerProps) {
    return (
        <>
            {text.open && (
                <TextPlacementModal {...text.props} onClose={text.onClose} />
            )}
            {toast}
            {confirmation}
            {bitmap && <BitmapImportModal {...bitmap} />}
            {trace.open && trace.props && <TraceModal {...trace.props} />}
        </>
    );
}
