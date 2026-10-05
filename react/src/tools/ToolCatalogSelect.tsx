/**
 * Purpose: Implementation module for ToolCatalogSelect in the react domain.
 */
import { ExternalLink } from 'lucide-react';
import type { LibraryTool } from '../lib/library';
import type { UnitSystem } from '../lib/units';
import { displayValue, lengthUnit } from '../lib/units';
import { ImagePicker } from './ImagePicker';
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
            <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                Choose the cutter installed in this tool slot. A catalog choice
                fills in its details; use Custom for a cutter that is not
                listed.
            </p>
            <ImagePicker
                ariaLabel="Catalog tool"
                value={selectedId}
                onChange={onSelect}
                className={className}
                placeholder="Custom tool (manual entry)"
                groups={[
                    {
                        options: [
                            { id: '', label: 'Custom tool (manual entry)' },
                        ],
                    },
                    ...catalogGroups(catalog).map((group) => ({
                        label: group.label,
                        options: group.tools.map((tool) => ({
                            id: tool.id,
                            label: tool.name,
                            detail: catalogMetaLine(tool, units),
                            image: tool.image,
                        })),
                    })),
                ]}
            />
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
