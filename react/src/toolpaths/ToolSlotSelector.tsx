import { Settings } from 'lucide-react';
import { displayValue, lengthUnit, type UnitSystem } from '../lib/units';
import type { ToolSlot } from '../tools/library';

interface ToolSlotSelectorProps {
    slots: ToolSlot[];
    slotNum: number;
    units: UnitSystem;
    onSelect: (slot: number) => void;
    onOpenLibrary: () => void;
}

/** The tool-rack chooser is shared form chrome, not operation parameters. */
export function ToolSlotSelector({
    slots,
    slotNum,
    units,
    onSelect,
    onOpenLibrary,
}: ToolSlotSelectorProps) {
    return (
        <div className="space-y-1">
            <div className="flex items-center justify-between">
                <span className="text-slate-500 dark:text-slate-400 text-sm">
                    Tool library
                </span>
                <button
                    type="button"
                    onClick={onOpenLibrary}
                    title="Open tool library"
                    aria-label="Open tool library"
                    className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-slate-300 dark:border-robin-900 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-dark-lighter hover:text-slate-900 dark:hover:text-white touch-manipulation"
                >
                    <Settings size={18} />
                </button>
            </div>
            <select
                value={slotNum}
                onChange={(event) => onSelect(Number(event.target.value))}
                className="w-full rounded-lg bg-slate-100 dark:bg-dark-lighter border border-slate-300 dark:border-robin-900 px-2 py-2.5 text-slate-900 dark:text-white text-sm"
                aria-label="Tool library slot"
            >
                {slots.map((slot) => (
                    <option key={slot.slot} value={slot.slot}>
                        {`T${slot.slot} — ${slot.name || 'empty'}${slot.cuttingDiameterMm != null ? ` — Ø${displayValue(slot.cuttingDiameterMm, units)}${lengthUnit(units)}` : ''}`}
                    </option>
                ))}
            </select>
        </div>
    );
}
