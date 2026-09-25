import { useEffect, useRef, useState } from 'react';
import {
    ExternalLink,
    RotateCcw,
    Save,
    Trash2,
    Edit2,
    Layers,
    X,
} from 'lucide-react';
import cx from 'classnames';
import {
    blankSlots,
    isConfigured,
    loadSlots,
    saveSlots,
    type ToolSlot,
    type ToolType,
} from '../lib/tools';
import {
    loadToolLibraries,
    type LibraryTool,
} from '../lib/library';
import {
    displayFeed,
    displayValue,
    feedUnit,
    lengthUnit,
    toMm,
    toMmPerMinute,
    type UnitSystem,
} from '../lib/units';

interface ToolLibraryModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSlotChange?: (slot: ToolSlot) => void;
    initialSlot?: number | null;
    units?: UnitSystem;
}

const REQUIRED_LABELS: Record<string, string> = {
    name: 'Tool name',
    cuttingDiameterMm: 'Diameter',
    feedRate: 'Feed Rate',
    plungeRate: 'Plunge Rate',
    spindle: 'Spindle RPM',
    passDepthMm: 'Pass Depth',
    fluteAngleDeg: 'V Angle',
};

const TOOL_TYPE_GROUPS: { value: ToolType; label: string }[] = [
    { value: 'flat', label: 'Flat End Mills' },
    { value: 'ball', label: 'Ball End Mills' },
    { value: 'ballnose', label: 'Ball Nose Bits' },
    { value: 'surfacing', label: 'Surfacing Bits' },
    { value: 'drill', label: 'Drill Bits' },
    { value: 'v-bit', label: 'V-Bits' },
    { value: 'specialty', label: 'Specialty Bits' },
];

function toolTypeLabel(toolType: ToolType): string {
    return TOOL_TYPE_GROUPS.find((group) => group.value === toolType)?.label ?? 'Specialty Bits';
}

function catalogGroups(catalog: LibraryTool[]) {
    return TOOL_TYPE_GROUPS.map((group) => ({
        ...group,
        tools: catalog
            .filter((tool) => tool.toolType === group.value)
            .sort((a, b) => {
                const aSize = a.cuttingDiameterMm;
                const bSize = b.cuttingDiameterMm;
                if (aSize == null && bSize == null)
                    return a.name.localeCompare(b.name);
                if (aSize == null) return 1;
                if (bSize == null) return -1;
                return aSize - bSize || a.name.localeCompare(b.name);
            }),
    })).filter((group) => group.tools.length > 0);
}

function slotIssues(slot: ToolSlot): string[] {
    const missing: string[] = [];
    const need = (v: unknown) => v === null || v === undefined || v === '';
    if (!slot.name.trim()) missing.push(REQUIRED_LABELS.name);
    if (need(slot.cuttingDiameterMm))
        missing.push(REQUIRED_LABELS.cuttingDiameterMm);
    if (need(slot.feedRate)) missing.push(REQUIRED_LABELS.feedRate);
    if (need(slot.plungeRate)) missing.push(REQUIRED_LABELS.plungeRate);
    if (need(slot.spindle)) missing.push(REQUIRED_LABELS.spindle);
    if (need(slot.passDepthMm)) missing.push(REQUIRED_LABELS.passDepthMm);
    if (slot.toolType === 'v-bit' && need(slot.fluteAngleDeg))
        missing.push(REQUIRED_LABELS.fluteAngleDeg);
    return missing;
}

/** A row with any data must be fully valid before it can be saved. */
function rowHasAnyData(slot: ToolSlot): boolean {
    return Boolean(
        slot.libraryToolId ||
            slot.name.trim() ||
            slot.cuttingDiameterMm ||
            slot.fluteAngleDeg ||
            slot.feedRate ||
            slot.plungeRate ||
            slot.spindle ||
            slot.passDepthMm,
    );
}

export function ToolLibraryModal({
    isOpen,
    onClose,
    onSlotChange,
    initialSlot = null,
    units = 'metric',
}: ToolLibraryModalProps) {
    const [slots, setSlots] = useState<ToolSlot[]>(() =>
        typeof window !== 'undefined'
            ? loadSlots(window.localStorage)
            : blankSlots(),
    );
    const [editingSlot, setEditingSlot] = useState<number | null>(null);
    const [catalog, setCatalog] = useState<LibraryTool[]>([]);
    const [catalogError, setCatalogError] = useState('');
    const modalRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (typeof window !== 'undefined') {
            setSlots(loadSlots(window.localStorage));
        }
        let cancelled = false;
        loadToolLibraries()
            .then((tools) => {
                if (!cancelled) setCatalog(tools);
            })
            .catch((e: unknown) => {
                if (!cancelled)
                    setCatalogError(
                        e instanceof Error ? e.message : 'Catalog load failed',
                    );
            });
        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        if (isOpen) setEditingSlot(initialSlot);
    }, [isOpen, initialSlot]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isOpen) onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        }
        return () => {
            document.body.style.overflow = 'unset';
        };
    }, [isOpen]);

    if (!isOpen) return null;

    const persist = (updated: ToolSlot[]) => {
        setSlots(updated);
        if (typeof window !== 'undefined') {
            saveSlots(window.localStorage, updated);
        }
    };

    const handleSave = (slotNum: number, data: Partial<ToolSlot>) => {
        const updated = slots.map((s) =>
            s.slot === slotNum ? { ...s, ...data } : s,
        );
        persist(updated);
        const saved = updated.find((s) => s.slot === slotNum);
        if (saved && onSlotChange) onSlotChange(saved);
        setEditingSlot(null);
    };

    const handleClear = (slotNum: number) => {
        const updated = slots.map((s) =>
            s.slot === slotNum ? { ...blankSlots()[slotNum - 1] } : s,
        );
        persist(updated);
        const cleared = updated.find((s) => s.slot === slotNum);
        if (cleared && onSlotChange) onSlotChange(cleared);
        setEditingSlot(null);
    };

    const handleResetAll = () => {
        persist(blankSlots());
        setEditingSlot(null);
    };

    // First blocking issue across partially-filled rows (camcanvas parity).
    const firstIssue = slots.flatMap((s) =>
        rowHasAnyData(s) && !isConfigured(s)
            ? [`T${s.slot}: ${slotIssues(s).join(', ')}`]
            : [],
    )[0];

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 animate-fade-in"
            onClick={onClose}
            role="dialog"
            aria-modal="true"
            aria-labelledby="tool-library-title"
        >
            <div
                ref={modalRef}
                className={cx(
                    'w-full max-w-3xl max-h-[90vh] overflow-auto',
                    'rounded-lg bg-gray-100 dark:bg-dark border border-gray-300 dark:border-gray-700',
                    'animate-slide-up',
                )}
                onClick={(e) => e.stopPropagation()}
            >
                <header className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-robin-900">
                    <h2
                        id="tool-library-title"
                        className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2"
                    >
                        <Layers size={20} className="text-robin-400" />
                        Tool Library
                    </h2>
                    <button
                        onClick={onClose}
                        className={cx(
                            'p-2 rounded-lg transition-colors',
                            'text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-robin-900/50',
                        )}
                        aria-label="Close tool library"
                    >
                        <X size={20} />
                    </button>
                </header>

                <div className="p-4 space-y-3">
                    {slots.map((slot) =>
                        editingSlot === slot.slot ? (
                            <ToolSlotEditor
                                key={slot.slot}
                                slot={slot}
                                catalog={catalog}
                                catalogError={catalogError}
                                units={units}
                                onSave={(data) => handleSave(slot.slot, data)}
                                onCancel={() => setEditingSlot(null)}
                            />
                        ) : (
                            <ToolSlotRow
                                key={slot.slot}
                                slot={slot}
                                units={units}
                                onEdit={() => setEditingSlot(slot.slot)}
                                onClear={() => handleClear(slot.slot)}
                            />
                        ),
                    )}
                </div>

                <footer className="px-4 py-3 border-t border-slate-200 dark:border-robin-900 flex items-center gap-3">
                    {firstIssue && (
                        <span
                            role="alert"
                            className="me-auto text-sm text-red-500"
                        >
                            {firstIssue}
                        </span>
                    )}
                    <span className="flex-1" />
                    <button
                        onClick={handleResetAll}
                        className={cx(
                            'flex items-center gap-2 px-4 py-2 rounded-lg',
                            'text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-robin-900/50',
                            'transition-colors text-sm font-medium',
                        )}
                    >
                        <RotateCcw size={16} />
                        Reset All
                    </button>
                    <button
                        onClick={onClose}
                        className={cx(
                            'flex items-center gap-2 px-5 py-2 rounded-lg',
                            'bg-robin-500 hover:bg-robin-600 text-white',
                            'transition-colors text-sm font-medium',
                        )}
                    >
                        <Save size={16} />
                        Done
                    </button>
                </footer>
            </div>
        </div>
    );
}

function catalogMetaLine(tool: LibraryTool, units: UnitSystem): string {
    const parts: string[] = [];
    if (tool.cuttingDiameterMm != null)
        parts.push(`Ø${displayValue(tool.cuttingDiameterMm, units)}${lengthUnit(units)}`);
    if (tool.toolType === 'v-bit' && tool.fluteAngleDeg != null)
        parts.push(`${tool.fluteAngleDeg}°`);
    if (tool.vendorDisplayName) parts.push(tool.vendorDisplayName);
    return parts.join(' · ');
}

function ToolSlotRow({
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
    const typeLabel = toolTypeLabel(slot.toolType);
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
                                    {typeLabel}
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
                        className={cx(
                            'p-2 rounded-lg transition-colors',
                            'text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-robin-900/50',
                        )}
                        aria-label={`Edit tool T${slot.slot}`}
                    >
                        <Edit2 size={16} />
                    </button>
                    {configured && (
                        <button
                            onClick={onClear}
                            className={cx(
                                'p-2 rounded-lg transition-colors',
                                'text-slate-500 hover:text-red-400 hover:bg-red-900/20 dark:text-slate-400',
                            )}
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

function ToolSlotEditor({
    slot,
    catalog,
    catalogError,
    units,
    onSave,
    onCancel,
}: {
    slot: ToolSlot;
    catalog: LibraryTool[];
    catalogError: string;
    units: UnitSystem;
    onSave: (data: Partial<ToolSlot>) => void;
    onCancel: () => void;
}) {
    const [name, setName] = useState(slot.name);
    const [toolType, setToolType] = useState<ToolType>(slot.toolType);
    const [libraryToolId, setLibraryToolId] = useState(
        slot.libraryToolId ?? '',
    );
    const [diameter, setDiameter] = useState(
        slot.cuttingDiameterMm?.toString() ?? '',
    );
    const [angle, setAngle] = useState(slot.fluteAngleDeg?.toString() ?? '');
    const [feed, setFeed] = useState(slot.feedRate?.toString() ?? '');
    const [plunge, setPlunge] = useState(slot.plungeRate?.toString() ?? '');
    const [rpm, setRpm] = useState(slot.spindle?.toString() ?? '');
    const [pass, setPass] = useState(slot.passDepthMm?.toString() ?? '');
    const [touched, setTouched] = useState(false);

    const num = (v: string) => {
        const n = Number.parseFloat(v);
        return v.trim() !== '' && Number.isFinite(n) ? n : null;
    };
    const displayLength = (v: string) => {
        const n = num(v);
        return n == null ? '' : displayValue(n, units);
    };
    const displayRate = (v: string) => {
        const n = num(v);
        return n == null ? '' : displayFeed(n, units);
    };
    const draft: ToolSlot = {
        ...slot,
        name,
        toolType,
        libraryToolId: libraryToolId || null,
        cuttingDiameterMm: num(diameter),
        fluteAngleDeg: num(angle),
        feedRate: num(feed),
        plungeRate: num(plunge),
        spindle: num(rpm),
        passDepthMm: num(pass),
    };
    const issues = rowHasAnyData(draft) ? slotIssues(draft) : [];
    const invalid = (field: string) =>
        touched && issues.includes(REQUIRED_LABELS[field]);
    const valid = issues.length === 0;

    const fieldCls = (bad: boolean) =>
        cx(
            'w-full px-3 py-2.5 rounded-lg border text-sm',
            'bg-white dark:bg-dark border-slate-300 dark:border-robin-900 text-slate-900 dark:text-white',
            'placeholder:text-slate-400 dark:placeholder:text-slate-500',
            'focus:outline-none focus:ring-2 focus:ring-robin-500/50',
            bad && 'border-red-500 ring-2 ring-red-500/40',
        );

    const applyCatalogTool = (id: string) => {
        setLibraryToolId(id);
        const tool = catalog.find((t) => t.id === id);
        if (!tool) return;
        setName(tool.name);
        setToolType(tool.toolType);
        if (tool.cuttingDiameterMm != null)
            setDiameter(String(tool.cuttingDiameterMm));
        if (tool.fluteAngleDeg != null) setAngle(String(tool.fluteAngleDeg));
    };

    const catalogGroupsByType = catalogGroups(catalog);

    return (
        <div className="rounded-lg border border-robin-500/50 bg-slate-100 dark:bg-dark-lighter p-4 space-y-4 animate-slide-up">
            <header className="flex items-center justify-between">
                <span className="font-mono text-robin-400">
                    Editing T{slot.slot}
                </span>
                <button
                    onClick={onCancel}
                    className="p-1 rounded hover:bg-slate-200 dark:hover:bg-robin-900/50 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                    aria-label="Cancel editing"
                >
                    <X size={18} />
                </button>
            </header>

            <div className="space-y-1">
                <span className="text-xs text-slate-500 dark:text-slate-400">
                    Catalog tool
                </span>
                <select
                    value={libraryToolId}
                    onChange={(e) => applyCatalogTool(e.target.value)}
                    className={fieldCls(false)}
                    aria-label="Catalog tool"
                >
                    <option value="">Custom tool (manual entry)</option>
                    {catalogGroupsByType.map((group) => (
                        <optgroup key={group.value} label={group.label}>
                            {group.tools.map((t) => (
                                <option key={t.id} value={t.id}>
                                    {t.name} — {catalogMetaLine(t, units)}
                                </option>
                            ))}
                        </optgroup>
                    ))}
                </select>
                {catalogError && (
                    <p className="text-xs text-red-500">{catalogError}</p>
                )}
                {libraryToolId &&
                    (() => {
                        const tool = catalog.find(
                            (t) => t.id === libraryToolId,
                        );
                        return tool?.storeUrl ? (
                            <a
                                href={tool.storeUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-xs text-robin-400 hover:text-robin-300"
                            >
                                <ExternalLink size={12} /> Store page
                            </a>
                        ) : null;
                    })()}
            </div>

            <div className="grid grid-cols-2 gap-3">
                <label className="col-span-2 space-y-1">
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                        Tool Name *
                    </span>
                    <input
                        value={name}
                        onChange={(e) => {
                            setName(e.target.value);
                            setTouched(true);
                        }}
                        placeholder='e.g. 1/4" End Mill'
                        aria-invalid={invalid('name')}
                        className={fieldCls(invalid('name'))}
                    />
                </label>
                <label className="space-y-1">
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                        Type
                    </span>
                    <select
                        value={toolType}
                        onChange={(e) => {
                            setToolType(e.target.value as ToolType);
                            setTouched(true);
                        }}
                        className={fieldCls(false)}
                    >
                        <option value="flat">Flat</option>
                        <option value="ball">Ball</option>
                        <option value="ballnose">Ball Nose</option>
                        <option value="surfacing">Surfacing</option>
                        <option value="drill">Drill</option>
                        <option value="v-bit">V-Bit</option>
                        <option value="specialty">Specialty</option>
                    </select>
                </label>
                <label className="space-y-1">
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                        Diameter ({lengthUnit(units)}) *
                    </span>
                    <input
                        type="number"
                        step={displayValue(0.1, units)}
                        min={displayValue(0.1, units)}
                        value={displayLength(diameter)}
                        onChange={(e) => {
                            setDiameter(e.target.value === '' ? '' : String(toMm(Number(e.target.value), units)));
                            setTouched(true);
                        }}
                        aria-invalid={invalid('cuttingDiameterMm')}
                        className={fieldCls(invalid('cuttingDiameterMm'))}
                    />
                </label>
                {toolType === 'v-bit' && (
                    <label className="space-y-1">
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                            V Angle (°) *
                        </span>
                        <input
                            type="number"
                            min={1}
                            max={179}
                            value={angle}
                            onChange={(e) => {
                                setAngle(e.target.value);
                                setTouched(true);
                            }}
                            aria-invalid={invalid('fluteAngleDeg')}
                            className={fieldCls(invalid('fluteAngleDeg'))}
                        />
                    </label>
                )}
                <label className="space-y-1">
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                        Feed ({feedUnit(units)}) *
                    </span>
                    <input
                        type="number"
                        min={displayFeed(1, units)}
                        value={displayRate(feed)}
                        onChange={(e) => {
                            setFeed(e.target.value === '' ? '' : String(toMmPerMinute(Number(e.target.value), units)));
                            setTouched(true);
                        }}
                        aria-invalid={invalid('feedRate')}
                        className={fieldCls(invalid('feedRate'))}
                    />
                </label>
                <label className="space-y-1">
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                        Plunge ({feedUnit(units)}) *
                    </span>
                    <input
                        type="number"
                        min={displayFeed(1, units)}
                        value={displayRate(plunge)}
                        onChange={(e) => {
                            setPlunge(e.target.value === '' ? '' : String(toMmPerMinute(Number(e.target.value), units)));
                            setTouched(true);
                        }}
                        aria-invalid={invalid('plungeRate')}
                        className={fieldCls(invalid('plungeRate'))}
                    />
                </label>
                <label className="space-y-1">
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                        Spindle (RPM) *
                    </span>
                    <input
                        type="number"
                        min={1}
                        value={rpm}
                        onChange={(e) => {
                            setRpm(e.target.value);
                            setTouched(true);
                        }}
                        aria-invalid={invalid('spindle')}
                        className={fieldCls(invalid('spindle'))}
                    />
                </label>
                <label className="space-y-1">
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                        Pass Depth ({lengthUnit(units)}) *
                    </span>
                    <input
                        type="number"
                        step={displayValue(0.1, units)}
                        min={displayValue(0.1, units)}
                        value={displayLength(pass)}
                        onChange={(e) => {
                            setPass(e.target.value === '' ? '' : String(toMm(Number(e.target.value), units)));
                            setTouched(true);
                        }}
                        aria-invalid={invalid('passDepthMm')}
                        className={fieldCls(invalid('passDepthMm'))}
                    />
                </label>
            </div>

            <footer className="flex items-center gap-3 pt-3 border-t border-slate-200 dark:border-robin-900">
                {issues.length > 0 && (
                    <span role="alert" className="me-auto text-sm text-red-500">
                        Missing: {issues.join(', ')}
                    </span>
                )}
                <span className="flex-1" />
                <button
                    onClick={onCancel}
                    className={cx(
                        'px-4 py-2 rounded-lg',
                        'text-slate-600 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-robin-900/50',
                        'transition-colors text-sm font-medium',
                    )}
                >
                    Cancel
                </button>
                <button
                    onClick={() => {
                        const tool = catalog.find(
                            (t) => t.id === libraryToolId,
                        );
                        onSave({
                            name: name.trim(),
                            toolType,
                            libraryToolId: libraryToolId || null,
                            vendor: tool?.vendor ?? '',
                            vendorDisplayName: tool?.vendorDisplayName ?? '',
                            storeUrl: tool?.storeUrl ?? '',
                            image: tool?.image ?? '',
                            cuttingDiameterMm: num(diameter),
                            fluteAngleDeg: num(angle),
                            feedRate: num(feed),
                            plungeRate: num(plunge),
                            spindle: num(rpm),
                            passDepthMm: num(pass),
                        });
                    }}
                    disabled={!valid}
                    title={valid ? undefined : issues.join(' | ')}
                    className={cx(
                        'flex items-center gap-2 px-5 py-2 rounded-lg',
                        'bg-robin-500 hover:bg-robin-600 text-white',
                        'transition-colors text-sm font-medium',
                        'disabled:opacity-40 disabled:cursor-not-allowed',
                    )}
                >
                    <Save size={16} />
                    Save Tool
                </button>
            </footer>
        </div>
    );
}
