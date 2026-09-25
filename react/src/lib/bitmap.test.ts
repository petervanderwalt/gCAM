import { placeBitmap } from './bitmap';

test('wide image caps at 80mm preserving aspect', () => {
    const p = placeBitmap(200, 100);
    expect(p.wMm).toBeCloseTo(80);
    expect(p.hMm).toBeCloseTo(40);
    expect(p.x).toBeCloseTo(10);
    expect(p.y).toBeCloseTo(30);
});

test('tall image caps at 120mm height', () => {
    const p = placeBitmap(100, 400);
    expect(p.hMm).toBeCloseTo(120);
    expect(p.wMm).toBeCloseTo(30);
});

test('placement centers on the given view center', () => {
    const p = placeBitmap(100, 100, 0, 0);
    expect(p.x).toBeCloseTo(-40);
    expect(p.y).toBeCloseTo(-40);
});
