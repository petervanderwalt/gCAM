/**
 * Purpose: Implementation module for ToolSelectionFields in the react domain.
 */
import type { ToolSlot } from '../tools/library';
import { isConfigured } from '../tools/library';
import { ToolLibraryModal } from '../tools/ToolLibraryModal';
import type { UnitSystem } from '../lib/units';
import { ToolSlotSelector } from './ToolSlotSelector';

interface ToolSelectionFieldsProps {
    slots: ToolSlot[];
    slotNum: number;
    units: UnitSystem;
    libraryOpen: boolean;
    librarySlot: number | null;
    onOpenLibrary(): void;
    onSelectSlot(slotNumber: number): void;
    onCloseLibrary(): void;
    onConfiguredSlot(slot: ToolSlot): void;
}

/** Tool rack selection and its editor modal, independent of operation fields. */
export function ToolSelectionFields({
    slots,
    slotNum,
    units,
    libraryOpen,
    librarySlot,
    onOpenLibrary,
    onSelectSlot,
    onCloseLibrary,
    onConfiguredSlot,
}: ToolSelectionFieldsProps) {
    return (
        <>
            <ToolSlotSelector
                slots={slots}
                slotNum={slotNum}
                units={units}
                onOpenLibrary={onOpenLibrary}
                onSelect={onSelectSlot}
            />
            <ToolLibraryModal
                isOpen={libraryOpen}
                initialSlot={librarySlot}
                units={units}
                onClose={onCloseLibrary}
                onSlotChange={(slot) => {
                    if (slot.slot === slotNum && isConfigured(slot)) {
                        onConfiguredSlot(slot);
                    }
                }}
            />
        </>
    );
}
