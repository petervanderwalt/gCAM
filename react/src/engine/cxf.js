/** Parse the QCAD CXF stroke-font format into glyph stroke polylines. */
export function parseCxf(source) {
    const font = {
        name: 'Unknown',
        letterSpacing: 0,
        wordSpacing: 0,
        lineSpacingFactor: 1,
        glyphs: new Map(),
    };
    let glyph = null;

    for (const rawLine of String(source).split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) {
            const metadata = line.match(/^#\s*(Name|LetterSpacing|WordSpacing|LineSpacingFactor):\s*(.*?)\s*$/i);
            if (metadata) {
                const key = metadata[1].toLowerCase();
                if (key === 'name') font.name = metadata[2];
                else {
                    const property = {
                        letterspacing: 'letterSpacing',
                        wordspacing: 'wordSpacing',
                        linespacingfactor: 'lineSpacingFactor',
                    }[key.toLowerCase()];
                    if (property) font[property] = Number(metadata[2]);
                }
            }
            continue;
        }

        const header = line.match(/^\[([\da-f]+)\]/i);
        if (header) {
            glyph = { codePoint: Number.parseInt(header[1], 16), strokes: [] };
            font.glyphs.set(glyph.codePoint, glyph);
            continue;
        }
        if (!glyph) continue;

        const commandMatch = line.match(/^(PLC|PL|L|A)\s+(.+)$/i);
        if (!commandMatch) continue;
        const command = commandMatch[1].toUpperCase();
        const values = commandMatch[2].split(',').map(Number);
        if (!values.every(Number.isFinite)) continue;

        if (command === 'L' && values.length >= 4) {
            glyph.strokes.push([
                { x: values[0], y: values[1] },
                { x: values[2], y: values[3] },
            ]);
        } else if ((command === 'PL' || command === 'PLC') && values.length >= 6) {
            const vertices = [];
            for (let index = 0; index + 2 < values.length; index += 3) {
                vertices.push({ x: values[index], y: values[index + 1], bulge: values[index + 2] });
            }
            const points = [];
            const count = command === 'PLC' ? vertices.length : vertices.length - 1;
            for (let index = 0; index < count; index += 1) {
                const start = vertices[index];
                const end = vertices[(index + 1) % vertices.length];
                if (!points.length) points.push({ x: start.x, y: start.y });
                points.push(...sampleBulge(start, end));
            }
            if (command === 'PLC' && points.length > 1) points.push(points[0]);
            if (points.length > 1) glyph.strokes.push(points);
        } else if (command === 'A' && values.length >= 5) {
            const [cx, cy, radius, startDeg, endDeg] = values;
            glyph.strokes.push(sampleArc(cx, cy, radius, startDeg, endDeg));
        }
    }
    return font;
}

function sampleBulge(start, end) {
    const bulge = start.bulge || 0;
    if (Math.abs(bulge) < 1e-8) return [{ x: end.x, y: end.y }];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const chord = Math.hypot(dx, dy);
    const sweep = 4 * Math.atan(bulge);
    const offset = (chord * (1 - bulge * bulge)) / (4 * bulge);
    const cx = (start.x + end.x) / 2 - (dy / chord) * offset;
    const cy = (start.y + end.y) / 2 + (dx / chord) * offset;
    const radius = Math.hypot(start.x - cx, start.y - cy);
    const initial = Math.atan2(start.y - cy, start.x - cx);
    const steps = Math.max(2, Math.ceil((Math.abs(sweep) * 180) / (Math.PI * 8)));
    return Array.from({ length: steps }, (_, index) => {
        const angle = initial + (sweep * (index + 1)) / steps;
        return { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) };
    });
}

function sampleArc(cx, cy, radius, startDeg, endDeg) {
    let sweepDeg = endDeg - startDeg;
    if (sweepDeg <= 0) sweepDeg += 360;
    if (sweepDeg > 360) sweepDeg = 360;
    const steps = Math.max(2, Math.ceil(Math.abs(sweepDeg) / 8));
    return Array.from({ length: steps + 1 }, (_, index) => {
        const angle = ((startDeg + (sweepDeg * index) / steps) * Math.PI) / 180;
        return { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) };
    });
}

/** Lay out CXF glyphs as single-line CAM strokes, honoring their actual case. */
export function cxfTextStrokes(text, font, options) {
    const {
        x,
        y,
        height,
        rotationDeg = 0,
        lineSpacingFactor = 1,
        attachmentPoint = 1,
    } = options;
    const scale = height / 9;
    const lines = String(text || '').split('\n');
    const baselineStep = height * (1 + 0.2 * lineSpacingFactor * (font.lineSpacingFactor || 1));
    const blockHeight = height + Math.max(0, lines.length - 1) * baselineStep;
    const verticalAlignment = Math.floor((attachmentPoint - 1) / 3);
    const horizontalAlignment = (attachmentPoint - 1) % 3;
    const blockTop = verticalAlignment === 0 ? 0 : verticalAlignment === 1 ? blockHeight / 2 : blockHeight;
    const angle = (rotationDeg * Math.PI) / 180;
    const strokes = [];

    lines.forEach((line, lineIndex) => {
        let cursor = 0;
        const widths = [...line].map((character) =>
            /\s/.test(character) ? font.wordSpacing : 9 + font.letterSpacing,
        );
        const lineWidth = widths.reduce((sum, width) => sum + width, 0) - (widths.length ? font.letterSpacing : 0);
        const lineStart = horizontalAlignment === 1 ? -lineWidth / 2 : horizontalAlignment === 2 ? -lineWidth : 0;
        const lineOffset = blockTop - lineIndex * baselineStep;
        for (const character of line) {
            if (/\s/.test(character)) {
                cursor += font.wordSpacing;
                continue;
            }
            const glyph = font.glyphs.get(character.codePointAt(0)) || font.glyphs.get(63);
            if (!glyph) {
                cursor += font.letterSpacing + 9;
                continue;
            }
            for (const stroke of glyph.strokes) {
                const points = stroke.map((point) => {
                    const localX = (lineStart + cursor + point.x) * scale;
                    const localY = lineOffset + (point.y - 9) * scale;
                    return {
                        x: x + localX * Math.cos(angle) - localY * Math.sin(angle),
                        y: y + localX * Math.sin(angle) + localY * Math.cos(angle),
                    };
                });
                if (points.length > 1) strokes.push(points);
            }
            cursor += 9 + font.letterSpacing;
        }
    });
    return strokes;
}
