export type UnitSystem = 'metric' | 'imperial';

export const MM_PER_INCH = 25.4;

export function lengthUnit(units: UnitSystem): 'mm' | 'in' {
    return units === 'imperial' ? 'in' : 'mm';
}

export function feedUnit(units: UnitSystem): 'mm/min' | 'in/min' {
    return units === 'imperial' ? 'in/min' : 'mm/min';
}

export function fromMm(mm: number, units: UnitSystem): number {
    return units === 'imperial' ? mm / MM_PER_INCH : mm;
}

export function toMm(value: number, units: UnitSystem): number {
    return units === 'imperial' ? value * MM_PER_INCH : value;
}

export function fromMmPerMinute(value: number, units: UnitSystem): number {
    return fromMm(value, units);
}

export function toMmPerMinute(value: number, units: UnitSystem): number {
    return toMm(value, units);
}

/** Stable display precision without leaking binary conversion noise into inputs. */
export function displayValue(valueMm: number, units: UnitSystem, decimals = 3): number {
    const value = fromMm(valueMm, units);
    const factor = 10 ** decimals;
    return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function displayFeed(valueMmPerMinute: number, units: UnitSystem, decimals = 1): number {
    return displayValue(valueMmPerMinute, units, decimals);
}

/**
 * Convert G-code generated internally in millimetres to inch mode. Only axis,
 * arc-centre/radius and feed words are length values; spindle power and codes
 * remain unchanged.
 */
export function gcodeForUnits(gcodeMm: string, units: UnitSystem): string {
    if (units === 'metric') return gcodeMm;
    const converted = gcodeMm
        .replace(/^G21$/m, 'G20')
        .replace(/\b([XYZIJRKF])(-?(?:\d+\.?\d*|\.\d+))/g, (_word, axis: string, raw: string) => {
            const converted = Number(raw) / MM_PER_INCH;
            const precision = axis === 'F' ? 4 : 5;
            return `${axis}${Number(converted.toFixed(precision))}`;
        });
    // Operation comments are user-visible output too. Convert their metric
    // dimensions while leaving program words and arbitrary prose intact.
    return converted
        .split(/(\r?\n)/)
        .map((line) => line.trimStart().startsWith('(')
            ? line
                .replace(/(-?(?:\d+\.?\d*|\.\d+))(?=mm|→)/g, (_value, raw: string) =>
                    String(Number((Number(raw) / MM_PER_INCH).toFixed(5))))
                .replace(/mm/g, 'in')
            : line)
        .join('');
}
