import { jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react';
import { ConfigPanel, type GridState } from './ConfigPanel';
import { EMPTY_MACHINE_TRAVEL_LIMITS } from '../cutting-parameters/types';

test('custom machine exposes only max travel distances', () => {
    const grid: GridState = {
        visible: true,
        spacingMm: 10,
        snap: true,
        style: 'lines',
    };
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
            machineProfileId="custom"
            onMachineProfileChange={() => {}}
            machineTravelLimits={EMPTY_MACHINE_TRAVEL_LIMITS}
            onMachineTravelLimitsChange={onMachineTravelLimitsChange}
        />,
    );

    expect(screen.getByLabelText('Max X (mm)')).toBeInTheDocument();
    expect(screen.getByLabelText('Max Y (mm)')).toBeInTheDocument();
    expect(screen.getByLabelText('Max Z (mm)')).toBeInTheDocument();
    expect(screen.queryByLabelText('Min Z (mm)')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Max X (mm)'), {
        target: { value: '500' },
    });
    expect(onMachineTravelLimitsChange).toHaveBeenLastCalledWith({
        ...EMPTY_MACHINE_TRAVEL_LIMITS,
        maxXTravelMm: 500,
    });
    fireEvent.change(screen.getByLabelText('Max Z (mm)'), {
        target: { value: '125' },
    });
    expect(onMachineTravelLimitsChange).toHaveBeenLastCalledWith({
        ...EMPTY_MACHINE_TRAVEL_LIMITS,
        minZTravelMm: -125,
    });
});

test('selecting a named machine fills its profile travel distances', () => {
    const grid: GridState = {
        visible: true,
        spacingMm: 10,
        snap: true,
        style: 'lines',
    };
    const onMachineProfileChange = jest.fn();
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
            onMachineProfileChange={onMachineProfileChange}
            machineTravelLimits={EMPTY_MACHINE_TRAVEL_LIMITS}
            onMachineTravelLimitsChange={onMachineTravelLimitsChange}
        />,
    );

    fireEvent.change(screen.getByLabelText('Machine profile'), {
        target: { value: 'altmill-spindle' },
    });
    expect(onMachineProfileChange).toHaveBeenCalledWith('altmill-spindle');
    expect(onMachineTravelLimitsChange).toHaveBeenCalledWith({
        maxXTravelMm: 1260,
        maxYTravelMm: 1248,
        minZTravelMm: -170,
        maxZTravelMm: null,
    });
});
