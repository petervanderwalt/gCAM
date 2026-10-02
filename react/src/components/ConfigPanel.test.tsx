import { jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react';
import { ConfigPanel, type GridState } from './ConfigPanel';
import { EMPTY_MACHINE_TRAVEL_LIMITS } from '../cutting-parameters/types';

test('edits optional machine travel bounds in configuration', () => {
    const grid: GridState = { visible: true, spacingMm: 10, snap: true, style: 'lines' };
    const onMachineTravelLimitsChange = jest.fn();
    render(
        <ConfigPanel
            darkMode={true}
            onDarkModeChange={() => {}}
            grid={grid}
            onGridChange={() => {}}
            emitArcs={true}
            onEmitArcsChange={() => {}}
            units="metric"
            onUnitsChange={() => {}}
            machineProfileId="longmill-router"
            onMachineProfileChange={() => {}}
            machineTravelLimits={EMPTY_MACHINE_TRAVEL_LIMITS}
            onMachineTravelLimitsChange={onMachineTravelLimitsChange}
        />,
    );

    fireEvent.change(screen.getByLabelText('Max X (mm)'), { target: { value: '500' } });
    expect(onMachineTravelLimitsChange).toHaveBeenLastCalledWith({
        ...EMPTY_MACHINE_TRAVEL_LIMITS,
        maxXTravelMm: 500,
    });
    fireEvent.change(screen.getByLabelText('Min Z (mm)'), { target: { value: '-125' } });
    expect(onMachineTravelLimitsChange).toHaveBeenLastCalledWith({
        ...EMPTY_MACHINE_TRAVEL_LIMITS,
        minZTravelMm: -125,
    });
});
