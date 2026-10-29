import { clonePoints, sampleProfile } from './profileModel';
import { defaultFixtureSettings, fixtureXClearance } from './fixtureClearance';
import { ROTARY_MAX_DIAMETER, rotaryMaxLength } from './stockLimits';
import type { ProfilePoint, RotaryStock, RotaryToolpathEntry } from './types';

export function fitTemplateStock(
    points: ProfilePoint[],
    stock: RotaryStock,
    entries: Pick<RotaryToolpathEntry, 'tool' | 'ops'>[],
) {
    const margins = entries.map(({ tool, ops }) => {
        const settings = ops.mesh ?? defaultFixtureSettings;
        return {
            chuck: fixtureXClearance(tool, settings),
            tail: settings.tailClearance + fixtureXClearance(tool, settings),
        };
    });
    const minX = Math.min(...points.map((point) => point.x));
    const shift = Math.max(
        0,
        Math.ceil(
            stock.grip +
                Math.max(...margins.map((margin) => margin.chuck)) +
                0.001 -
                minX,
        ),
    );
    const fitted = clonePoints(points);
    for (const point of fitted) {
        point.x += shift;
        point.h1.x += shift;
        point.h2.x += shift;
    }
    const samples = sampleProfile(fitted, 16, 0.005);
    const length =
        Math.ceil(
            (Math.max(...samples.map((point) => point.x)) +
                Math.max(...margins.map((margin) => margin.tail)) +
                0.001) /
                5,
        ) * 5;
    const diameter = Math.ceil(
        Math.max(
            2 * Math.max(...samples.map((point) => point.r)) + 2,
            stock.supports?.enabled ? stock.supports.endDiameter : 0,
        ),
    );
    if (
        !Number.isFinite(length) ||
        !Number.isFinite(diameter) ||
        length > rotaryMaxLength(stock.ext) ||
        diameter > ROTARY_MAX_DIAMETER
    )
        throw new Error(
            'This template and cutter clearance do not fit the selected machine capacity.',
        );
    return { points: fitted, stock: { ...stock, length, diameter } };
}

/** Uniformly resize the part inside the measured blank, retaining fixture clearance. */
export function fitProfileToStock(
    points: ProfilePoint[],
    stock: RotaryStock,
    entries: Pick<RotaryToolpathEntry, 'tool' | 'ops'>[],
): ProfilePoint[] {
    const margins = entries.map(({ tool, ops }) => {
        const settings = ops.mesh ?? defaultFixtureSettings;
        const clearance = fixtureXClearance(tool, settings);
        return { chuck: clearance, tail: settings.tailClearance + clearance };
    });
    const start = stock.grip + Math.max(...margins.map((m) => m.chuck)) + 0.001;
    const end = stock.length - Math.max(...margins.map((m) => m.tail)) - 0.001;
    const samples = sampleProfile(points, 16, 0.005);
    const minX = Math.min(...samples.map((p) => p.x));
    const length = Math.max(...samples.map((p) => p.x)) - minX;
    const radius = Math.max(...samples.map((p) => p.r)) + 0.005;
    const factor = Math.min(
        (end - start) / length,
        stock.diameter / (2 * radius),
    );
    if (
        points.length < 2 ||
        ![start, end, length, radius, factor, stock.grip].every(
            Number.isFinite,
        ) ||
        stock.grip < 0 ||
        length <= 0 ||
        radius <= 0 ||
        factor <= 0
    )
        throw new Error(
            'The profile and cutter clearances must fit inside a positive stock length and diameter.',
        );
    if (
        stock.supports?.enabled &&
        (stock.supports.endDiameter > stock.diameter ||
            stock.supports.chuckOverlap + stock.supports.tailOverlap >=
                length * factor)
    )
        throw new Error(
            'The stock supports do not fit the resized part. Reduce their diameters or end overlaps first.',
        );
    const scale = (p: { x: number; r: number }) => ({
        x: start + (p.x - minX) * factor,
        r: p.r * factor,
    });
    return points.map((p) => ({
        ...p,
        ...scale(p),
        h1: scale(p.h1),
        h2: scale(p.h2),
    }));
}
