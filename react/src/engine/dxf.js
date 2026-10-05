/**
 * Purpose: Implementation module for dxf in the engine domain.
 */
const DXF_INSUNITS_TO_MM = {
    1: 25.4, // Inches
    2: 304.8, // Feet
    3: 1609344, // Miles
    4: 1, // Millimetres
    5: 10, // Centimetres
    6: 1000, // Metres
    7: 1000000, // Kilometres
    8: 0.0000254, // Microinches
    9: 0.0254, // Mils
    10: 914.4, // Yards
    11: 1e-7, // Angstroms
    12: 1e-6, // Nanometres
    13: 0.001, // Microns
    14: 100, // Decimetres
    15: 10000, // Decametres
    16: 100000, // Hectometres
    17: 1e12, // Gigametres
    18: 149597870700000, // Astronomical units
    19: 9.4607304725808e18, // Light years
    20: 3.08567758149137e19, // Parsecs
};

/** Read the DXF header's $INSUNITS scale as millimetres per drawing unit. */
export function dxfUnitScaleToMm(text) {
    const lines = text.replace(/\r/g, '').split('\n');
    const pairs = [];
    for (let index = 0; index + 1 < lines.length; index += 2) {
        const code = Number.parseInt(lines[index].trim(), 10);
        if (!Number.isNaN(code))
            pairs.push({ code, value: lines[index + 1].trim() });
    }
    let inHeader = false;
    for (let index = 0; index < pairs.length; index += 1) {
        const pair = pairs[index];
        if (pair.code === 0 && pair.value === 'SECTION') {
            inHeader =
                pairs[index + 1]?.code === 2 &&
                pairs[index + 1]?.value === 'HEADER';
            continue;
        }
        if (pair.code === 0 && pair.value === 'ENDSEC') {
            inHeader = false;
            continue;
        }
        if (inHeader && pair.code === 9 && pair.value === '$INSUNITS') {
            for (
                let next = index + 1;
                next < pairs.length && pairs[next].code !== 9;
                next += 1
            ) {
                if (pairs[next].code === 70) {
                    return (
                        DXF_INSUNITS_TO_MM[
                            Number.parseInt(pairs[next].value, 10)
                        ] ?? null
                    );
                }
            }
            return null;
        }
    }
    return null;
}

export function parseDxf(text) {
    const rawLines = text.replace(/\r/g, '').split('\n');
    const pairs = [];
    for (let i = 0; i < rawLines.length - 1; i += 2) {
        const code = Number.parseInt(rawLines[i].trim(), 10);
        if (Number.isNaN(code)) {
            continue;
        }
        pairs.push({ code, value: rawLines[i + 1] });
    }

    let inEntities = false;
    const entities = [];
    let currentType = null;
    let current = null;
    let activePolyline = null;
    let activeVertex = null;

    function buildRawEntityState() {
        return { values: new Map(), arrays: new Map(), pairs: [] };
    }

    function appendPair(target, pair) {
        target.pairs.push({ code: pair.code, value: pair.value.trim() });
        if (!target.arrays.has(pair.code)) {
            target.arrays.set(pair.code, []);
        }
        target.arrays.get(pair.code).push(pair.value.trim());
        target.values.set(pair.code, pair.value.trim());
    }

    function pushEntity() {
        if (!currentType || !current) {
            return;
        }
        const entity = buildEntity(currentType, current);
        if (entity) {
            entities.push(entity);
        }
    }

    for (let i = 0; i < pairs.length; i += 1) {
        const pair = pairs[i];
        if (pair.code === 0 && pair.value.trim() === 'SECTION') {
            const namePair = pairs[i + 1];
            if (namePair && namePair.code === 2) {
                inEntities = namePair.value.trim() === 'ENTITIES';
            }
            activePolyline = null;
            activeVertex = null;
            currentType = null;
            current = null;
            continue;
        }

        if (!inEntities) {
            continue;
        }

        if (pair.code === 0 && pair.value.trim() === 'ENDSEC') {
            if (activePolyline && activeVertex) {
                activePolyline.vertices.push(activeVertex);
                activeVertex = null;
            }
            if (activePolyline) {
                currentType = 'POLYLINE';
                current = activePolyline;
                pushEntity();
                activePolyline = null;
                currentType = null;
                current = null;
            }
            pushEntity();
            currentType = null;
            current = null;
            inEntities = false;
            continue;
        }

        if (pair.code === 0) {
            const nextType = pair.value.trim();

            if (activePolyline) {
                if (nextType === 'VERTEX') {
                    if (activeVertex) {
                        activePolyline.vertices.push(activeVertex);
                    }
                    activeVertex = buildRawEntityState();
                    continue;
                }
                if (nextType === 'SEQEND') {
                    if (activeVertex) {
                        activePolyline.vertices.push(activeVertex);
                        activeVertex = null;
                    }
                    currentType = 'POLYLINE';
                    current = activePolyline;
                    pushEntity();
                    activePolyline = null;
                    currentType = null;
                    current = null;
                    continue;
                }
                if (activeVertex) {
                    activePolyline.vertices.push(activeVertex);
                    activeVertex = null;
                }
                currentType = 'POLYLINE';
                current = activePolyline;
                pushEntity();
                activePolyline = null;
                currentType = null;
                current = null;
            }

            pushEntity();
            currentType = nextType;
            if (currentType === 'POLYLINE') {
                activePolyline = buildRawEntityState();
                activePolyline.vertices = [];
                currentType = null;
                current = null;
                continue;
            }
            current = buildRawEntityState();
            continue;
        }

        if (activeVertex) {
            appendPair(activeVertex, pair);
            continue;
        }

        if (activePolyline) {
            appendPair(activePolyline, pair);
            continue;
        }

        if (!current) {
            continue;
        }

        appendPair(current, pair);
    }

    return entities;
}

function buildEntity(type, data) {
    const v = (code, fallback = null) => {
        const value = data.values.get(code);
        return value == null ? fallback : value;
    };
    const a = (code) => data.arrays.get(code) || [];
    const number = (code, fallback = 0) => {
        const value = Number.parseFloat(v(code, String(fallback)));
        return Number.isFinite(value) ? value : fallback;
    };

    const common = {
        type,
        layer: v(8, '0'),
        handle: v(5, ''),
        color: Number.parseInt(v(62, '256'), 10),
    };

    if (type === 'LINE') {
        return {
            ...common,
            x1: number(10),
            y1: number(20),
            x2: number(11),
            y2: number(21),
        };
    }

    if (type === 'ARC') {
        return {
            ...common,
            cx: number(10),
            cy: number(20),
            radius: number(40),
            startAngleDeg: number(50),
            endAngleDeg: number(51),
        };
    }

    if (type === 'CIRCLE') {
        return {
            ...common,
            cx: number(10),
            cy: number(20),
            radius: number(40),
        };
    }

    if (type === 'LWPOLYLINE') {
        const flags = Number.parseInt(v(70, '0'), 10);
        const vertices = [];
        let currentVertex = null;
        for (const pair of data.pairs || []) {
            if (pair.code === 10) {
                if (currentVertex) {
                    vertices.push(currentVertex);
                }
                currentVertex = {
                    x: Number.parseFloat(pair.value) || 0,
                    y: 0,
                    bulge: 0,
                };
                continue;
            }
            if (!currentVertex) {
                continue;
            }
            if (pair.code === 20) {
                currentVertex.y = Number.parseFloat(pair.value) || 0;
                continue;
            }
            if (pair.code === 42) {
                currentVertex.bulge = Number.parseFloat(pair.value) || 0;
            }
        }
        if (currentVertex) {
            vertices.push(currentVertex);
        }
        return {
            ...common,
            vertices,
            closed: (flags & 1) === 1,
        };
    }

    if (type === 'POLYLINE') {
        const flags = Number.parseInt(v(70, '0'), 10);
        const vertices = (data.vertices || []).map((vertex) => {
            const vertexValue = (code, fallback = '0') =>
                vertex.values.get(code) ?? fallback;
            return {
                x: Number.parseFloat(vertexValue(10, '0')) || 0,
                y: Number.parseFloat(vertexValue(20, '0')) || 0,
                bulge: Number.parseFloat(vertexValue(42, '0')) || 0,
            };
        });
        return {
            ...common,
            vertices,
            closed: (flags & 1) === 1,
        };
    }

    if (type === 'SPLINE') {
        const degree = Number.parseInt(v(71, '3'), 10);
        const flags = Number.parseInt(v(70, '0'), 10);
        const knots = a(40).map(Number.parseFloat);
        const weights = a(41).map(Number.parseFloat);
        const xs = a(10).map(Number.parseFloat);
        const ys = a(20).map(Number.parseFloat);
        const zs = a(30).map(Number.parseFloat);
        const controlPoints = xs.map((x, index) => ({
            x,
            y: ys[index] || 0,
            z: zs[index] || 0,
            w: weights[index] || 1,
        }));
        return {
            ...common,
            degree,
            flags,
            closed: (flags & 1) === 1,
            knots,
            controlPoints,
        };
    }

    if (type === 'TEXT' || type === 'MTEXT') {
        return buildTextEntity(type, common, data, v, number);
    }

    return null;
}

function buildTextEntity(type, common, data, value, number) {
    const rawText =
        type === 'MTEXT'
            ? (data.arrays.get(3) || []).join('') + (value(1, '') || '')
            : value(1, '');
    const text = normalizeDxfText(rawText);
    const baseHeight = Math.abs(number(40, 1)) || 1;
    const leadingHeight =
        type === 'MTEXT'
            ? rawText.match(/^\s*\{?\\H([+-]?(?:\d+\.?\d*|\.\d+))(x?);/i)
            : null;
    const height = leadingHeight
        ? baseHeight *
          Number(leadingHeight[1]) *
          (leadingHeight[2] ? 1 : 1 / baseHeight)
        : baseHeight;
    const insertion = { x: number(10), y: number(20) };
    return {
        ...common,
        type: 'CAD_TEXT',
        text,
        x: insertion.x,
        y: insertion.y,
        height,
        rotationDeg: number(50),
        attachmentPoint: type === 'MTEXT' ? number(71, 1) : null,
        lineSpacingFactor: type === 'MTEXT' ? number(44, 1) : 1,
        fontStyle: value(7, ''),
        strokes: [],
        __cadTextMode: 'stroke',
    };
}

function normalizeDxfText(value) {
    return String(value || '')
        .replace(/\\P/g, '\n')
        .replace(/\\~/g, ' ')
        .replace(/\\[HWCQTAF][^;]*;/gi, '')
        .replace(/\\\\/g, '\\')
        .replace(/\\([{}])/g, '$1')
        .replace(/[{}]/g, '')
        .replace(/%%[dD]/g, '°')
        .replace(/%%[pP]/g, '±')
        .replace(/%%[cC]/g, 'Ø');
}
