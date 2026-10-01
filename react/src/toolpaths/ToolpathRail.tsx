/**
 * Purpose: Implementation module for ToolpathRail in the react domain.
 */
import { Layers, Pencil, Trash2 } from 'lucide-react';
import type { Dispatch, SetStateAction } from 'react';
import { ToolpathPanel } from './ToolpathPanel';
import type { ToolpathStackEntry } from './useToolpathStack';
import type { ViewLoop } from '../canvas/types';
import type { PlacedTab, ProfileArgs, ToolpathResult } from '../lib/engine';
import { defaultTabsForContours, operationUsesTabs } from '../lib/tabs';
import type { UnitSystem } from '../lib/units';
import type { JobStock } from '../job/stock';
import { JobStockSetup } from '../job/JobStockSetup';

type Bitmap = {
    id: string;
    x: number;
    y: number;
    w: number;
    h: number;
    img?: HTMLImageElement;
};

interface ToolpathRailProps {
    loops: ViewLoop[];
    selected: string[];
    bitmaps: Bitmap[];
    stack: ToolpathStackEntry[];
    units: UnitSystem;
    emitArcs: boolean;
    machineProfileId: string;
    stock: JobStock;
    setStock: Dispatch<SetStateAction<JobStock>>;
    editingId: string | null;
    editingEntry: ToolpathStackEntry | null;
    tabMode: boolean;
    setTabMode: Dispatch<SetStateAction<boolean>>;
    setEditingId: Dispatch<SetStateAction<string | null>>;
    setStack: Dispatch<SetStateAction<ToolpathStackEntry[]>>;
    setSideTab: (tab: 'toolpaths') => void;
    setStatus: (message: string) => void;
    setDraftPreview: Dispatch<SetStateAction<{ x: number; y: number }[][]>>;
    setDraftProgress: Dispatch<
        SetStateAction<{ percent: number; label: string } | null>
    >;
    onResult: (result: ToolpathResult, args: ProfileArgs) => void;
    onUpdate: (id: string, result: ToolpathResult, args: ProfileArgs) => void;
    rebuildEntryTabs: (id: string, tabs: PlacedTab[]) => void;
    confirm: (options: {
        title: string;
        message: string;
        confirmLabel?: string;
        destructive?: boolean;
    }) => Promise<boolean>;
    showToast: (message: string, tone: 'info', duration: number) => void;
}

/** The toolpath form and committed-stack rail; independent from canvas layout. */
export function ToolpathRail({
    loops,
    selected,
    bitmaps,
    stack,
    units,
    emitArcs,
    machineProfileId,
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
    onResult,
    onUpdate,
    rebuildEntryTabs,
    confirm,
    showToast,
}: ToolpathRailProps) {
    return (
        <aside className="w-[340px] shrink-0 border-l border-slate-200 bg-white dark:border-robin-900 dark:bg-dark flex flex-col min-h-0">
            <div className="p-3 border-b border-slate-200 dark:border-robin-900 flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                <Layers size={18} className="text-robin-400" />
                <span className="font-medium text-slate-900 dark:text-white">
                    Assign Toolpaths
                </span>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar">
                <JobStockSetup stock={stock} units={units} onChange={setStock} />
                <ToolpathPanel
                    loops={loops}
                    selected={selected}
                    bitmaps={bitmaps}
                    submitLabel="Add Toolpath"
                    onResult={onResult}
                    defaultArcs={emitArcs}
                    machineProfileId={machineProfileId}
                    stock={stock}
                    units={units}
                    onDraftPreview={(contours) =>
                        setDraftPreview(contours ?? [])
                    }
                    onDraftProgress={setDraftProgress}
                    editEntry={
                        editingEntry
                            ? {
                                  id: editingEntry.id,
                                  args: editingEntry.args,
                                  loops: editingEntry.args.loops.map(
                                      (loop, index) => ({
                                          id:
                                              loop.id ??
                                              `edit-${editingEntry.id}-${index}`,
                                          points: loop.points,
                                          bitmapId: (
                                              loop as { bitmapId?: string }
                                          ).bitmapId,
                                      }),
                                  ),
                              }
                            : null
                    }
                    onUpdate={onUpdate}
                    onCancelEdit={() => {
                        setEditingId(null);
                        setDraftPreview([]);
                        setDraftProgress(null);
                        setStatus('Edit cancelled.');
                    }}
                />
                <CommittedToolpaths
                    stack={stack}
                    editingId={editingId}
                    tabMode={tabMode}
                    setTabMode={setTabMode}
                    setEditingId={setEditingId}
                    setStack={setStack}
                    setSideTab={setSideTab}
                    setStatus={setStatus}
                    rebuildEntryTabs={rebuildEntryTabs}
                    confirm={confirm}
                    showToast={showToast}
                />
            </div>
        </aside>
    );
}

function CommittedToolpaths({
    stack,
    editingId,
    tabMode,
    setTabMode,
    setEditingId,
    setStack,
    setSideTab,
    setStatus,
    rebuildEntryTabs,
    confirm,
    showToast,
}: Omit<
    ToolpathRailProps,
    | 'loops'
    | 'selected'
    | 'bitmaps'
    | 'units'
    | 'emitArcs'
    | 'machineProfileId'
    | 'stock'
    | 'setStock'
    | 'editingEntry'
    | 'setDraftPreview'
    | 'setDraftProgress'
    | 'onResult'
    | 'onUpdate'
>) {
    return (
        <div className="px-3 pb-3">
            <div className="flex items-center justify-between mb-1">
                <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    Created Toolpaths ({stack.length})
                </div>
                <button
                    onClick={() => setTabMode((mode) => !mode)}
                    className={`rounded border px-2 py-0.5 text-xs ${tabMode ? 'bg-robin-500 border-robin-500 text-white' : 'border-slate-300 text-slate-600 hover:bg-slate-100 dark:border-robin-900 dark:text-slate-300 dark:hover:bg-dark-lighter'}`}
                >
                    {tabMode ? 'Placing tabs…' : 'Add a Tab'}
                </button>
            </div>
            <div className="space-y-1">
                {stack.map((entry) => {
                    const tabs =
                        (entry.args.tabs as PlacedTab[] | undefined) ?? [];
                    const tabEligible = operationUsesTabs(entry.args.operation);
                    return (
                        <div
                            key={entry.id}
                            className="animate-in fade-in slide-in-from-top-2 duration-300 rounded border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs dark:border-robin-900 dark:bg-dark-lighter"
                        >
                            <div className="flex items-center gap-2">
                                <span className="flex-1 truncate text-slate-700 dark:text-slate-200">
                                    {entry.label}
                                </span>
                                <button
                                    aria-label={`Edit ${entry.label}`}
                                    onClick={() => {
                                        setEditingId(entry.id);
                                        setSideTab('toolpaths');
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
                                    onClick={() =>
                                        void deleteEntry(
                                            entry,
                                            editingId,
                                            setEditingId,
                                            setStack,
                                            confirm,
                                            showToast,
                                        )
                                    }
                                    className="text-slate-400 hover:text-red-400"
                                >
                                    <Trash2 size={14} />
                                </button>
                            </div>
                            {tabEligible && (
                                <div className="mt-1 flex items-center gap-1">
                                    <span className="flex-1 text-slate-500 dark:text-slate-400">
                                        {tabs.length
                                            ? `${tabs.length} tab${tabs.length === 1 ? '' : 's'}`
                                            : 'No tabs'}
                                    </span>
                                    <button
                                        onClick={() =>
                                            rebuildEntryTabs(
                                                entry.id,
                                                defaultTabsForContours(
                                                    entry.preview.map(
                                                        (preview) =>
                                                            preview.points,
                                                    ),
                                                ),
                                            )
                                        }
                                        className="rounded border border-slate-300 dark:border-robin-900 px-1.5 py-0.5 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-dark"
                                    >
                                        Auto
                                    </button>
                                    {tabs.length > 0 && (
                                        <button
                                            onClick={() =>
                                                void clearTabs(
                                                    entry,
                                                    tabs.length,
                                                    rebuildEntryTabs,
                                                    confirm,
                                                )
                                            }
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
                        No toolpaths yet — select vectors and generate one.
                    </div>
                )}
            </div>
        </div>
    );
}

async function deleteEntry(
    entry: ToolpathStackEntry,
    editingId: string | null,
    setEditingId: Dispatch<SetStateAction<string | null>>,
    setStack: Dispatch<SetStateAction<ToolpathStackEntry[]>>,
    confirm: ToolpathRailProps['confirm'],
    showToast: ToolpathRailProps['showToast'],
) {
    const ok = await confirm({
        title: 'Delete toolpath?',
        message: `Delete ${entry.label}? You can undo this with Ctrl+Z.`,
        confirmLabel: 'Delete toolpath',
        destructive: true,
    });
    if (!ok) return;
    if (editingId === entry.id) setEditingId(null);
    setStack((current) => current.filter((item) => item.id !== entry.id));
    showToast('Toolpath deleted. Press Ctrl+Z to restore it.', 'info', 4200);
}

async function clearTabs(
    entry: ToolpathStackEntry,
    count: number,
    rebuildEntryTabs: ToolpathRailProps['rebuildEntryTabs'],
    confirm: ToolpathRailProps['confirm'],
) {
    const ok = await confirm({
        title: 'Clear tabs?',
        message: `Remove all ${count} tab${count === 1 ? '' : 's'} from ${entry.label}?`,
        confirmLabel: 'Clear tabs',
        destructive: true,
    });
    if (ok) rebuildEntryTabs(entry.id, []);
}
