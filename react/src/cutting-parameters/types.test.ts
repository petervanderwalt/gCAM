import { EMPTY_MACHINE_TRAVEL_LIMITS, normalizeMachineTravelLimits } from './types';

test('normalizes optional machine travel bounds and rejects invalid directions', () => {
    expect(normalizeMachineTravelLimits({
        maxXTravelMm: 800,
        maxYTravelMm: 600,
        minZTravelMm: -100,
        maxZTravelMm: 40,
    })).toEqual({
        maxXTravelMm: 800,
        maxYTravelMm: 600,
        minZTravelMm: -100,
        maxZTravelMm: 40,
    });
    expect(normalizeMachineTravelLimits({
        maxXTravelMm: -1,
        maxYTravelMm: Number.POSITIVE_INFINITY,
        minZTravelMm: 1,
        maxZTravelMm: -1,
    })).toEqual(EMPTY_MACHINE_TRAVEL_LIMITS);
    expect(normalizeMachineTravelLimits(null)).toEqual(EMPTY_MACHINE_TRAVEL_LIMITS);
});
