import { useEffect, useRef, useState } from 'react';
import {
    Box,
    Grid,
    Layers,
    Lightbulb,
    Ruler,
    Settings,
} from 'lucide-react';
import cx from 'classnames';
import { lengthUnit, type UnitSystem } from '../lib/units';
import { UnitInput } from './UnitInput';

export type GridStyle = 'lines' | 'dots';

export interface GridState {
    visible: boolean;
    spacingMm: number;
    snap: boolean;
    style: GridStyle;
}

const GRID_STORAGE_KEY = 'gcam.grid.v1';

export function loadGrid(): GridState {    const fallback: GridState = {
        visible: true,
        spacingMm: 10,
        snap: true,
        style: 'lines',
    };
    if (typeof window === 'undefined') return fallback;
    try {
        const raw = JSON.parse(
            window.localStorage.getItem(GRID_STORAGE_KEY) ?? 'null',
        );
        if (!raw || typeof raw !== 'object') return fallback;
        return {
            visible: typeof raw.visible === 'boolean' ? raw.visible : true,
            spacingMm:
                typeof raw.spacingMm === 'number' && raw.spacingMm >= 0.5
                    ? raw.spacingMm
                    : 10,
            snap: typeof raw.snap === 'boolean' ? raw.snap : true,
            style: raw.style === 'dots' ? 'dots' : 'lines',
        };
    } catch {
        return fallback;
    }
}

export function saveGrid(grid: GridState): void {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.setItem(GRID_STORAGE_KEY, JSON.stringify(grid));
    } catch {
        /* storage unavailable — grid stays in memory */
    }
}

interface ConfigPanelProps {
    darkMode: boolean;
    onDarkModeChange: (v: boolean) => void;
    grid: GridState;
    onGridChange: (g: GridState) => void;
    emitArcs: boolean;
    onEmitArcsChange: (v: boolean) => void;
    units: UnitSystem;
    onUnitsChange: (units: UnitSystem) => void;
    onActionsChange?: (actions: ConfigActions | null) => void;
}

export interface ConfigActions {
    exportConfig: () => void;
    importConfig: () => void;
    resetConfig: () => void;
}

const inputCls = cx(
    'px-3 py-2.5 rounded-lg border text-right',
    'bg-white dark:bg-dark border-slate-300 dark:border-robin-900 text-slate-900 dark:text-white text-base',
    'focus:outline-none focus:ring-2 focus:ring-robin-500/50',
);

/**
 * Application preferences panel (gSender Config-tab equivalent).
 * All state is lifted to App so changes apply live to canvas + toolpaths.
 */
export function ConfigPanel({
    darkMode,
    onDarkModeChange,
    grid,
    onGridChange,
    emitArcs,
    onEmitArcsChange,
    units,
    onUnitsChange,
    onActionsChange,
}: ConfigPanelProps) {
    const importInputRef = useRef<HTMLInputElement>(null);
    const [toastTimeout, setToastTimeout] = useState(() => {
        if (typeof window === 'undefined') return 3000;
        return Number.parseInt(
            localStorage.getItem('gcam.toastTimeout') ?? '3000',
            10,
        );
    });
    const [status, setStatus] = useState('');

    useEffect(() => {
        localStorage.setItem('gcam.toastTimeout', String(toastTimeout));
    }, [toastTimeout]);

    const flash = (msg: string) => {
        setStatus(msg);
        window.setTimeout(() => setStatus(''), 2000);
    };

    const handleExportConfig = () => {
        const config = {
            darkMode,
            grid,
            emitArcs,
            units,
            toastTimeout,
        };
        const blob = new Blob([JSON.stringify(config, null, 2)], {
            type: 'application/json',
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'gcam-config.json';
        a.click();
        URL.revokeObjectURL(url);
        flash('Configuration exported');
    };

    const handleImportConfig = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            try {
                const config = JSON.parse(ev.target?.result as string);
                if (typeof config.darkMode === 'boolean')
                    onDarkModeChange(config.darkMode);
                if (config.grid) onGridChange(config.grid);
                if (typeof config.emitArcs === 'boolean')
                    onEmitArcsChange(config.emitArcs);
                if (config.units === 'metric' || config.units === 'imperial')
                    onUnitsChange(config.units);
                if (typeof config.toastTimeout === 'number')
                    setToastTimeout(config.toastTimeout);
                flash('Configuration imported');
            } catch {
                flash('Failed to import configuration');
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    };

    const handleResetConfig = () => {
        onDarkModeChange(true);
        onGridChange({ visible: true, spacingMm: 10, snap: true, style: grid.style });
        onEmitArcsChange(true);
        onUnitsChange('metric');
        setToastTimeout(3000);
        flash('Configuration reset to defaults');
    };

    useEffect(() => {
        onActionsChange?.({
            exportConfig: handleExportConfig,
            importConfig: () => importInputRef.current?.click(),
            resetConfig: handleResetConfig,
        });
    }, [darkMode, emitArcs, grid, onActionsChange, toastTimeout, units]);

    return (
        <div className="flex flex-col h-full overflow-y-auto p-4 space-y-6 bg-slate-100 dark:bg-slate-800">
            <header className="border-b border-slate-300 dark:border-robin-900 pb-4">
                <h2 className="text-xl font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                    <Settings size={22} className="text-robin-400" />
                    Configuration
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                    Application preferences and defaults
                </p>
            </header>

            <section className="space-y-4">
                <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 flex items-center gap-2">
                    <Lightbulb size={16} className="text-robin-400" />
                    Appearance
                </h3>
                <div className="space-y-3 bg-white dark:bg-slate-800/80 rounded-lg border border-slate-300 dark:border-robin-900/70 p-4 shadow-sm dark:shadow-[0_4px_16px_rgba(2,6,23,0.18)]">
                    <SettingRow
                        label="Dark Mode"
                        description="Dark theme is the gSender default; light theme is on the roadmap"
                    >
                        <Toggle
                            checked={darkMode}
                            onChange={onDarkModeChange}
                        />
                    </SettingRow>
                </div>
            </section>

            <section className="space-y-4">
                <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 flex items-center gap-2">
                    <Ruler size={16} className="text-robin-400" />
                    Units
                </h3>
                <div className="space-y-3 bg-white dark:bg-slate-800/80 rounded-lg border border-slate-300 dark:border-robin-900/70 p-4 shadow-sm dark:shadow-[0_4px_16px_rgba(2,6,23,0.18)]">
                    <SettingRow
                        label="Measurement System"
                        description="Convert displayed dimensions, feeds and generated G-code"
                    >
                        <div className="flex rounded-lg border border-slate-300 dark:border-robin-900 overflow-hidden" role="radiogroup" aria-label="Measurement units">
                            <button
                                role="radio"
                                aria-checked={units === 'metric'}
                                onClick={() => onUnitsChange('metric')}
                                className={`px-3 py-2 text-sm touch-manipulation ${units === 'metric' ? 'bg-robin-500 text-white' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-dark-lighter'}`}
                            >
                                mm (Metric)
                            </button>
                            <button
                                role="radio"
                                aria-checked={units === 'imperial'}
                                onClick={() => onUnitsChange('imperial')}
                                className={`px-3 py-2 text-sm touch-manipulation ${units === 'imperial' ? 'bg-robin-500 text-white' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-dark-lighter'}`}
                            >
                                inch (Imperial)
                            </button>
                        </div>
                    </SettingRow>
                </div>
            </section>

            <section className="space-y-4">
                <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 flex items-center gap-2">
                    <Grid size={16} className="text-robin-400" />
                    Canvas &amp; Grid
                </h3>
                <div className="space-y-3 bg-white dark:bg-slate-800/80 rounded-lg border border-slate-300 dark:border-robin-900/70 p-4 shadow-sm dark:shadow-[0_4px_16px_rgba(2,6,23,0.18)]">
                    <SettingRow
                        label="Show Grid"
                        description="Display grid lines on canvas"
                    >
                        <Toggle
                            checked={grid.visible}
                            onChange={(v) =>
                                onGridChange({ ...grid, visible: v })
                            }
                        />
                    </SettingRow>
                    <SettingRow
                        label="Snap to Grid"
                        description="Force drawing points to align with grid"
                    >
                        <Toggle
                            checked={grid.snap}
                            onChange={(v) => onGridChange({ ...grid, snap: v })}
                            disabled={!grid.visible}
                        />
                    </SettingRow>
                    <SettingRow
                        label="Grid Style"
                        description="Lines or dots"
                    >
                        <div
                            className="flex rounded-lg border border-slate-300 dark:border-robin-900 overflow-hidden"
                            role="radiogroup"
                            aria-label="Grid style"
                        >
                            {(['lines', 'dots'] as const).map((style) => (
                                <button
                                    key={style}
                                    role="radio"
                                    aria-checked={grid.style === style}
                                    onClick={() =>
                                        onGridChange({ ...grid, style })
                                    }
                                    className={`px-3 py-2 text-sm capitalize touch-manipulation ${
                                        grid.style === style
                                            ? 'bg-robin-500 text-white'
                                            : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-dark-lighter'
                                    }`}
                                >
                                    {style}
                                </button>
                            ))}
                        </div>
                    </SettingRow>
                    <SettingRow
                        label={`Grid Spacing (${lengthUnit(units)})`}
                        description="Distance between grid lines"
                    >
                        <UnitInput
                            units={units}
                            minMm={0.5}
                            maxMm={100}
                            stepMm={0.5}
                            valueMm={grid.spacingMm}
                            onChangeMm={(valueMm) =>
                                onGridChange({
                                    ...grid,
                                    spacingMm: Math.max(
                                        0.5,
                                        valueMm || 0.5,
                                    ),
                                })
                            }
                            className={cx(inputCls, 'w-24')}
                            aria-label={`Grid spacing in ${lengthUnit(units)}`}
                        />
                    </SettingRow>
                </div>
            </section>

            <section className="space-y-4">
                <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 flex items-center gap-2">
                    <Layers size={16} className="text-robin-400" />
                    G-code Output
                </h3>
                <div className="space-y-3 bg-white dark:bg-slate-800/80 rounded-lg border border-slate-300 dark:border-robin-900/70 p-4 shadow-sm dark:shadow-[0_4px_16px_rgba(2,6,23,0.18)]">
                    <SettingRow
                        label="Emit G2/G3 Arcs"
                        description="Default for new toolpaths (circular interpolation vs G1 segments)"
                    >
                        <Toggle
                            checked={emitArcs}
                            onChange={onEmitArcsChange}
                        />
                    </SettingRow>
                </div>
            </section>

            <section className="space-y-4">
                <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 flex items-center gap-2">
                    <Box size={16} className="text-robin-400" />
                    Notifications
                </h3>
                <div className="space-y-3 bg-white dark:bg-slate-800/80 rounded-lg border border-slate-300 dark:border-robin-900/70 p-4 shadow-sm dark:shadow-[0_4px_16px_rgba(2,6,23,0.18)]">
                    <SettingRow
                        label="Toast Duration (ms)"
                        description="How long status messages stay visible"
                    >
                        <input
                            type="number"
                            min={1000}
                            max={10000}
                            step={500}
                            value={toastTimeout}
                            onChange={(e) =>
                                setToastTimeout(
                                    Number.parseInt(e.target.value, 10) || 1000,
                                )
                            }
                            className={cx(inputCls, 'w-28')}
                            aria-label="Toast duration in ms"
                        />
                    </SettingRow>
                </div>
            </section>

            <input
                ref={importInputRef}
                type="file"
                accept=".json"
                onChange={handleImportConfig}
                className="hidden"
            />

            {status && (
                <div
                    role="status"
                    className="fixed bottom-4 right-4 bg-robin-500/90 text-slate-900 dark:text-white px-4 py-2 rounded-lg text-sm z-50"
                >
                    {status}
                </div>
            )}
        </div>
    );
}

function SettingRow({
    label,
    description,
    children,
}: {
    label: string;
    description: string;
    children: React.ReactNode;
}) {
    return (
        <div className="flex items-center justify-between gap-4 min-h-[48px]">
            <div className="flex-1 min-w-0">
                <div className="font-medium text-slate-900 dark:text-white text-sm">
                    {label}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                    {description}
                </p>
            </div>
            <div className="flex-shrink-0">{children}</div>
        </div>
    );
}

function Toggle({
    checked,
    onChange,
    disabled,
}: {
    checked: boolean;
    onChange: (checked: boolean) => void;
    disabled?: boolean;
}) {
    return (
        <button
            onClick={() => {
                if (!disabled) onChange(!checked);
            }}
            disabled={disabled}
            className={cx(
                'relative w-14 h-8 rounded-full transition-colors touch-manipulation',
                'focus:outline-none focus:ring-2 focus:ring-robin-500/50 focus:ring-offset-2 focus:ring-offset-white dark:ring-offset-dark',
                checked ? 'bg-robin-500' : 'bg-slate-700',
                disabled && 'opacity-50 cursor-not-allowed',
            )}
            role="switch"
            aria-checked={checked}
            aria-disabled={disabled}
        >
            <span
                className={cx(
                    'absolute top-1 left-1 w-6 h-6 rounded-full bg-white transition-transform shadow-lg',
                    checked ? 'translate-x-6' : 'translate-x-0',
                )}
            />
        </button>
    );
}
