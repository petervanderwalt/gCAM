import { rulerStep } from './draw';

test('ruler step keeps ticks 48px apart or wider', () => {
    expect(rulerStep(10)).toBe(5);
    expect(rulerStep(1)).toBe(50);
    expect(rulerStep(100)).toBe(0.5);
    for (const scale of [0.1, 0.5, 2, 20, 200]) {
        expect(rulerStep(scale) * scale).toBeGreaterThanOrEqual(48);
    }
});
