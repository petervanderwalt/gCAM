import { fireEvent, render, screen } from '@testing-library/react';
import { jest } from '@jest/globals';
import type { CuttingRecommendation } from '../cutting-parameters/types';
import { CuttingRecipeFields } from './CuttingRecipeFields';

const recommendation = {
    rpm: 12000,
    feedMmMin: 2400,
    plungeMmMin: 500,
    passDepthMm: 2,
    stepoverPercent: 40,
    recipe: {} as CuttingRecommendation['recipe'],
    constraints: [],
} satisfies CuttingRecommendation;

test('edits suggested values in place and applies the override as a group', () => {
    const onManualChange = jest.fn();
    const onFeedRateChange = jest.fn();
    const onPlungeRateChange = jest.fn();
    const onSpindleChange = jest.fn();
    const onMaxDepthChange = jest.fn();
    render(
        <CuttingRecipeFields
            recommendation={recommendation}
            units="metric"
            manual={false}
            onManualChange={onManualChange}
            feedRate={1800}
            onFeedRateChange={onFeedRateChange}
            plungeRate={400}
            onPlungeRateChange={onPlungeRateChange}
            spindle={10000}
            onSpindleChange={onSpindleChange}
            maxDepth={1}
            maxDepthLabel="Max DOC"
            onMaxDepthChange={onMaxDepthChange}
        />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Change' }));
    expect(screen.getByLabelText('Feed (mm/min)')).toBeInTheDocument();
    expect(screen.getByLabelText('Plunge (mm/min)')).toBeInTheDocument();
    expect(screen.getByLabelText('Spindle (RPM)')).toBeInTheDocument();
    expect(screen.getByLabelText('Max DOC (mm)')).toBeInTheDocument();
    expect(screen.getByLabelText('Feed (mm/min)')).toHaveValue(2400);

    fireEvent.change(screen.getByLabelText('Feed (mm/min)'), { target: { value: '1900' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    expect(onFeedRateChange).toHaveBeenCalledWith(1900);
    expect(onPlungeRateChange).toHaveBeenCalledWith(500);
    expect(onSpindleChange).toHaveBeenCalledWith(12000);
    expect(onMaxDepthChange).toHaveBeenCalledWith(2);
    expect(onManualChange).toHaveBeenCalledWith(true);
    expect(screen.queryByRole('button', { name: 'Apply' })).not.toBeInTheDocument();
});

test('shows imperial units and converts edited feed and depth back to millimetres', () => {
    const onFeedRateChange = jest.fn();
    const onMaxDepthChange = jest.fn();
    render(
        <CuttingRecipeFields
            recommendation={recommendation}
            units="imperial"
            manual={false}
            onManualChange={jest.fn()}
            feedRate={1800}
            onFeedRateChange={onFeedRateChange}
            plungeRate={400}
            onPlungeRateChange={jest.fn()}
            spindle={10000}
            onSpindleChange={jest.fn()}
            maxDepth={1}
            maxDepthLabel="Max DOC"
            onMaxDepthChange={onMaxDepthChange}
        />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Change' }));
    expect(screen.getByLabelText('Feed (in/min)')).toHaveValue(94.5);
    expect(screen.getByLabelText('Max DOC (in)')).toHaveValue(0.079);
    fireEvent.change(screen.getByLabelText('Feed (in/min)'), { target: { value: '100' } });
    fireEvent.change(screen.getByLabelText('Max DOC (in)'), { target: { value: '0.1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    expect(onFeedRateChange).toHaveBeenCalledWith(2540);
    expect(onMaxDepthChange).toHaveBeenCalledWith(2.54);
});
