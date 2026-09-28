/**
 * Purpose: Regression coverage for cutting-parameter recommendation math.
 * Tests: Material recipes drive RPM/feed/depth; machine and tool limits can only reduce a recommendation.
 */
import { recommendCuttingParameters } from './recommend';

const machine = {
    id: 'fixture',
    displayName: 'Fixture CNC',
    revision: '1',
    maxXYFeedMmMin: 4000,
    maxZFeedMmMin: 1000,
    spindleMinRpm: 10000,
    spindleMaxRpm: 24000,
};
const cutter = {
    toolType: 'flat' as const,
    diameterMm: 6.35,
    flutes: 2,
    cuttingLengthMm: 20,
};

test('different material recipes produce different recommendations', () => {
    const wood = recommendCuttingParameters({
        material: 'hardwood',
        machine,
        cutter,
        operation: 'pocket',
    });
    const aluminium = recommendCuttingParameters({
        material: 'aluminium',
        machine,
        cutter,
        operation: 'pocket',
    });
    expect(wood.feedMmMin).toBeGreaterThan(aluminium.feedMmMin);
    expect(wood.passDepthMm).toBeGreaterThan(aluminium.passDepthMm);
    expect(aluminium.recipe.primaryConstraint).toBe('force-power');
    expect(wood.feedMmMin % 10).toBe(0);
    expect(wood.rpm % 100).toBe(0);
    expect(Number.isInteger(wood.passDepthMm)).toBe(true);
});

test('sub-millimetre DOC keeps one decimal place', () => {
    const recommendation = recommendCuttingParameters({
        material: 'aluminium',
        machine,
        cutter: { ...cutter, diameterMm: 1, cuttingLengthMm: 4 },
        operation: 'profile-outside',
    });
    expect(recommendation.passDepthMm).toBeGreaterThan(0);
    expect(recommendation.passDepthMm).toBeLessThan(1);
    expect(recommendation.passDepthMm * 10).toBeCloseTo(
        Math.round(recommendation.passDepthMm * 10),
    );
});

test('cutter length and machine speed limits reduce rather than increase the result', () => {
    const baseline = recommendCuttingParameters({
        material: 'softwood',
        machine,
        cutter,
        operation: 'pocket',
    });
    const limited = recommendCuttingParameters({
        material: 'softwood',
        machine: { ...machine, maxXYFeedMmMin: 500 },
        cutter: { ...cutter, cuttingLengthMm: 2 },
        operation: 'pocket',
    });
    expect(limited.feedMmMin).toBeLessThanOrEqual(baseline.feedMmMin);
    expect(limited.passDepthMm).toBeLessThanOrEqual(baseline.passDepthMm);
    expect(limited.constraints).toEqual(
        expect.arrayContaining([
            'Machine XY feed limit applied.',
            'Cutter or stock depth limit applied.',
        ]),
    );
});
