import type { InputHTMLAttributes } from 'react';
import {
    displayFeed,
    displayValue,
    fromMm,
    toMm,
    toMmPerMinute,
    type UnitSystem,
} from '../lib/units';

type Kind = 'length' | 'feed';

interface UnitInputProps
    extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'min' | 'max' | 'step'> {
    units: UnitSystem;
    kind?: Kind;
    valueMm: number;
    onChangeMm: (valueMm: number) => void;
    minMm?: number;
    maxMm?: number;
    stepMm?: number;
    decimals?: number;
}

/** A numeric field backed by millimetres while displaying the selected units. */
export function UnitInput({
    units,
    kind = 'length',
    valueMm,
    onChangeMm,
    minMm,
    maxMm,
    stepMm,
    decimals = kind === 'feed' ? 1 : 3,
    ...props
}: UnitInputProps) {
    const display = kind === 'feed'
        ? displayFeed(valueMm, units, decimals)
        : displayValue(valueMm, units, decimals);
    const convert = kind === 'feed' ? toMmPerMinute : toMm;
    return (
        <input
            {...props}
            type="number"
            value={display}
            min={minMm == null ? undefined : displayValue(minMm, units, decimals)}
            max={maxMm == null ? undefined : displayValue(maxMm, units, decimals)}
            step={stepMm == null ? undefined : displayValue(stepMm, units, decimals)}
            onChange={(event) => {
                const next = Number(event.target.value);
                if (Number.isFinite(next)) onChangeMm(convert(next, units));
            }}
        />
    );
}

export { fromMm };
