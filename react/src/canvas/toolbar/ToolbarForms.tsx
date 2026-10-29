/**
 * Purpose: Implementation module for ToolbarForms in the canvas domain.
 */
import { ToolbarMiniForm } from './ToolbarControls';
import { numericInput } from './styles';
import type { BooleanOperation } from '../../lib/engine';
import { lengthUnit } from '../../lib/units';
import { UnitInput } from '../../components/UnitInput';
import type { CanvasToolbarProps, ToolbarAction } from './types';

interface ToolbarFormsProps {
    props: CanvasToolbarProps;
    open: ToolbarAction;
    booleanOperation: BooleanOperation;
    onBooleanOperation: (operation: BooleanOperation) => void;
    close: () => void;
}

/** Inline parameter forms for modify operations. Kept separate from command menus. */
export function ToolbarForms({
    props,
    open,
    booleanOperation,
    onBooleanOperation,
    close,
}: ToolbarFormsProps) {
    const unit = lengthUnit(props.units);
    const lengthField = (
        label: string,
        value: number,
        onChange: (value: number) => void,
        className = numericInput,
        minimum = 0.5,
    ) => (
        <label className="flex items-center gap-1 text-sm text-slate-600 dark:text-slate-300">
            {label} ({unit})
            <UnitInput
                units={props.units}
                minMm={minimum}
                stepMm={0.5}
                valueMm={value}
                onChangeMm={onChange}
                aria-label={`${label} in ${unit}`}
                className={className}
            />
        </label>
    );

    if (open === 'fillet')
        return (
            <ToolbarMiniForm
                fields={lengthField(
                    'Radius',
                    props.cornerRadius,
                    props.onCornerRadius,
                )}
                onApply={() => {
                    props.onApplyFillet();
                    close();
                }}
                onCancel={close}
                title="Fillet Corners"
                applyLabel="Fillet"
            />
        );
    if (open === 'chamfer')
        return (
            <ToolbarMiniForm
                fields={lengthField(
                    'Distance',
                    props.cornerRadius,
                    props.onCornerRadius,
                    'w-56 rounded-lg bg-white dark:bg-dark-lighter border border-slate-300 dark:border-robin-900 px-2 py-1.5 text-slate-900 dark:text-white text-sm',
                )}
                onApply={() => {
                    props.onApplyChamfer?.();
                    close();
                }}
                onCancel={close}
                title="Chamfer Corners"
                applyLabel="Chamfer"
            />
        );
    if (open === 'offset')
        return (
            <ToolbarMiniForm
                fields={lengthField(
                    'Amount',
                    props.offsetAmount,
                    props.onOffsetAmount,
                )}
                onApply={() => {
                    props.onApplyOffset();
                    close();
                }}
                onCancel={close}
                title="Offset Shapes"
                applyLabel="Offset"
            />
        );
    if (open === 'boolean')
        return (
            <ToolbarMiniForm
                fields={
                    <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                        Operation
                        <select
                            value={booleanOperation}
                            onChange={(event) =>
                                onBooleanOperation(
                                    event.target.value as BooleanOperation,
                                )
                            }
                            className={numericInput.replace(
                                'w-16',
                                'w-48 max-w-full',
                            )}
                        >
                            <option value="union">Combine</option>
                            <option value="difference">Subtract</option>
                            <option value="intersection">Keep overlap</option>
                            <option value="xor">Remove overlap</option>
                        </select>
                    </label>
                }
                onApply={() => {
                    props.onBoolean(booleanOperation);
                    close();
                }}
                onCancel={close}
                title="Combine / Subtract"
                applyLabel="Apply"
                canApply={props.canBoolean}
            />
        );
    if (open === 'nest')
        return (
            <ToolbarMiniForm
                fields={
                    <>
                        {lengthField('W', props.sheetW, props.onSheetW)}
                        {lengthField('H', props.sheetH, props.onSheetH)}
                        {props.onNestSpacing &&
                            lengthField(
                                'Part gap',
                                props.nestSpacing ?? 5,
                                props.onNestSpacing,
                                numericInput,
                                0,
                            )}
                        {props.onNestBorder &&
                            lengthField(
                                'Edge margin',
                                props.nestBorder ?? 5,
                                props.onNestBorder,
                                numericInput,
                                0,
                            )}
                        <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                            Rotation
                            <select
                                aria-label="Nesting rotation"
                                value={props.nestRotation ?? 90}
                                onChange={(event) =>
                                    props.onNestRotation?.(
                                        Number(event.target.value),
                                    )
                                }
                                className="rounded border border-slate-300 bg-transparent p-1 dark:border-robin-900"
                            >
                                <option value={0}>Off</option>
                                <option value={90}>90° steps</option>
                                <option value={15}>15° steps</option>
                            </select>
                        </label>
                        <p className="w-full text-xs text-slate-500">
                            Part gap is between outlines. Allow for the endmill
                            diameter plus material for holding tabs.
                        </p>
                    </>
                }
                onApply={() => {
                    props.onApplyNest();
                    close();
                }}
                onCancel={close}
                title="Nest Parts"
                applyLabel="Nest"
            />
        );
    return null;
}
