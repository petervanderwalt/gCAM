import { Edit2, Trash2 } from 'lucide-react';
import cx from 'classnames';
import {
    displayFeed,
    displayValue,
    feedUnit,
    lengthUnit,
    type UnitSystem,
} from '../lib/units';
import { isConfigured, type ToolSlot } from './library';
import { toolTypeLabel } from './toolCatalog';

export function ToolSlotRow({
    slot,
    units,
    onEdit,
    onClear,
}: {
    slot: ToolSlot;
    units: UnitSystem;
    onEdit: () => void;
    onClear: () => void;
}) {
    const configured = isConfigured(slot);
    return (
        <div
            className={cx(
                'rounded-lg border p-4 transition-all',
                configured
                    ? 'border-slate-300 dark:border-robin-900 bg-slate-100 dark:bg-dark-lighter'
                    : 'border-slate-200 dark:border-robin-900/50 bg-white dark:bg-dark',
            )}
        >
            <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-4 flex-1 min-w-0">
                    <div
                        className={cx(
                            'w-10 h-10 rounded-lg flex items-center justify-center',
                            'font-mono text-sm font-semibold flex-shrink-0',
                            configured
                                ? 'bg-robin-500/20 text-robin-400 border border-robin-500/30'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-500 border border-slate-200 dark:border-robin-900/50',
                        )}
                    >
                        T{slot.slot}
                    </div>
                    <div className="min-w-0">
                        <div
                            className={cx(
                                'font-medium truncate',
                                configured
                                    ? 'text-slate-900 dark:text-white'
                                    : 'text-slate-500',
                            )}
                        >
                            {slot.name || 'Empty'}
                            {configured && (
                                <span className="ml-2 text-xs font-normal text-slate-500 dark:text-slate-400">
                                    {toolTypeLabel(slot.toolType)}
                                </span>
                            )}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 truncate font-mono">
                            {configured
                                ? [
                                      `Ø${displayValue(slot.cuttingDiameterMm ?? 0, units)}${lengthUnit(units)}`,
                                      slot.toolType === 'v-bit'
                                          ? `${slot.fluteAngleDeg}°`
                                          : null,
                                      `F${displayFeed(slot.feedRate ?? 0, units)} ${feedUnit(units)}`,
                                      `P${displayFeed(slot.plungeRate ?? 0, units)} ${feedUnit(units)}`,
                                      `S${slot.spindle}`,
                                      `D${displayValue(slot.passDepthMm ?? 0, units)}${lengthUnit(units)}`,
                                      slot.vendorDisplayName || null,
                                  ]
                                      .filter(Boolean)
                                      .join(' · ')
                                : 'Not configured'}
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                        onClick={onEdit}
                        className="p-2 rounded-lg transition-colors text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-robin-900/50"
                        aria-label={`Edit tool T${slot.slot}`}
                    >
                        <Edit2 size={16} />
                    </button>
                    {configured && (
                        <button
                            onClick={onClear}
                            className="p-2 rounded-lg transition-colors text-slate-500 hover:text-red-400 hover:bg-red-900/20 dark:text-slate-400"
                            aria-label={`Clear tool T${slot.slot}`}
                        >
                            <Trash2 size={16} />
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
