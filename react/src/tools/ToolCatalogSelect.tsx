/**
 * Purpose: Implementation module for ToolCatalogSelect in the react domain.
 */
import { ExternalLink } from 'lucide-react';
import type { LibraryTool } from '../lib/library';
import type { UnitSystem } from '../lib/units';
import { displayValue, lengthUnit } from '../lib/units';
import { catalogGroups } from './toolCatalog';

function catalogMetaLine(tool: LibraryTool, units: UnitSystem): string {
    const parts: string[] = [];
    if (tool.cuttingDiameterMm != null)
        parts.push(
            `Ø${displayValue(tool.cuttingDiameterMm, units)}${lengthUnit(units)}`,
        );
    if (tool.toolType === 'v-bit' && tool.fluteAngleDeg != null)
        parts.push(`${tool.fluteAngleDeg}°`);
    if (tool.vendorDisplayName) parts.push(tool.vendorDisplayName);
    return parts.join(' · ');
}

export function ToolCatalogSelect({
    catalog,
    catalogError,
    selectedId,
    units,
    className,
    onSelect,
}: {
    catalog: LibraryTool[];
    catalogError: string;
    selectedId: string;
    units: UnitSystem;
    className: string;
    onSelect: (id: string) => void;
}) {
    const selected = catalog.find((tool) => tool.id === selectedId);
    return (
        <div className="space-y-1">
            <span className="text-xs text-slate-500 dark:text-slate-400">
                Catalog tool
            </span>
            <select
                value={selectedId}
                onChange={(event) => onSelect(event.target.value)}
                className={className}
                aria-label="Catalog tool"
            >
                <option value="">Custom tool (manual entry)</option>
                {catalogGroups(catalog).map((group) => (
                    <optgroup key={group.value} label={group.label}>
                        {group.tools.map((tool) => (
                            <option key={tool.id} value={tool.id}>
                                {tool.name} — {catalogMetaLine(tool, units)}
                            </option>
                        ))}
                    </optgroup>
                ))}
            </select>
            {catalogError && (
                <p className="text-xs text-red-500">{catalogError}</p>
            )}
            {selected?.storeUrl && (
                <a
                    href={selected.storeUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-robin-400 hover:text-robin-300"
                >
                    <ExternalLink size={12} /> Store page
                </a>
            )}
        </div>
    );
}
