import {
    MM_PER_INCH,
    displayFeed,
    displayValue,
    feedUnit,
    fromMm,
    fromMmPerMinute,
    gcodeForUnits,
    lengthUnit,
    toMm,
    toMmPerMinute,
} from './units';

describe('unit conversion', () => {
    it('converts dimensions exactly between mm and inches', () => {
        expect(fromMm(25.4, 'imperial')).toBe(1);
        expect(toMm(1, 'imperial')).toBe(MM_PER_INCH);
        expect(fromMm(12.5, 'metric')).toBe(12.5);
        expect(toMm(12.5, 'metric')).toBe(12.5);
    });

    it('converts feeds using the same length ratio', () => {
        expect(fromMmPerMinute(2540, 'imperial')).toBe(100);
        expect(toMmPerMinute(100, 'imperial')).toBe(2540);
        expect(displayFeed(1800, 'imperial')).toBeCloseTo(70.9, 1);
    });

    it('uses concise, stable display values and labels', () => {
        expect(displayValue(6.35, 'imperial')).toBe(0.25);
        expect(lengthUnit('metric')).toBe('mm');
        expect(lengthUnit('imperial')).toBe('in');
        expect(feedUnit('metric')).toBe('mm/min');
        expect(feedUnit('imperial')).toBe('in/min');
    });

    it('emits inch-mode G-code and converts only length words', () => {
        const source = 'G21\nG0 X25.4 Y12.7 Z6\nG2 X50.8 I25.4 J-12.7 R6.35 F2540\nM3 S18000';
        expect(gcodeForUnits(source, 'imperial')).toBe(
            'G20\nG0 X1 Y0.5 Z0.23622\nG2 X2 I1 J-0.5 R0.25 F100\nM3 S18000',
        );
        expect(gcodeForUnits(source, 'metric')).toBe(source);
    });

    it('converts metric dimensions in generated operation comments', () => {
        expect(gcodeForUnits('(Profile - 6.35mm tool - 25.4mm deep - 3.175mm/pass)', 'imperial')).toBe(
            '(Profile - 0.25in tool - 1in deep - 0.125in/pass)',
        );
    });
});
