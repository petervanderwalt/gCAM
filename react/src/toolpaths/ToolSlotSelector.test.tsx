import { fireEvent, render, screen } from '@testing-library/react';
import { jest } from '@jest/globals';
import { blankSlots } from '../tools/library';
import { ToolSlotSelector } from './ToolSlotSelector';

test('offers a direct setup action when the tool library is empty', () => {
    const onSelect = jest.fn();
    const onSetupTools = jest.fn();
    render(
        <ToolSlotSelector
            slots={blankSlots()}
            slotNum={1}
            units="metric"
            hasAnyConfiguredTool={false}
            onSelect={onSelect}
            onOpenLibrary={() => {}}
            onSetupTools={onSetupTools}
        />,
    );

    expect(screen.getByText('No tools set up yet')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Set up your tools' }));
    expect(onSetupTools).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
});

test('keeps the tool picker when at least one cutter is configured', () => {
    const slots = blankSlots();
    slots[0] = {
        ...slots[0],
        name: '1/4 inch end mill',
        cuttingDiameterMm: 6.35,
        flutes: 2,
    };
    render(
        <ToolSlotSelector
            slots={slots}
            slotNum={1}
            units="metric"
            hasAnyConfiguredTool={true}
            onSelect={() => {}}
            onOpenLibrary={() => {}}
            onSetupTools={() => {}}
        />,
    );

    expect(screen.getByRole('button', { name: 'Tool library slot' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Set up your tools' })).not.toBeInTheDocument();
});

test('explains when a tool exists but none match the selected operation', () => {
    const onOpenLibrary = jest.fn();
    render(
        <ToolSlotSelector
            slots={[]}
            slotNum={1}
            units="metric"
            hasAnyConfiguredTool={true}
            onSelect={() => {}}
            onOpenLibrary={onOpenLibrary}
            onSetupTools={() => {}}
        />,
    );

    expect(screen.getByText('No matching tool set up')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Review tools' }));
    expect(onOpenLibrary).toHaveBeenCalledTimes(1);
});
