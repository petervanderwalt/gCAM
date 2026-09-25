// G-code → toolpath geometry worker (gSender-style: fast, responsive).
//
// Design notes (mirrors src/app/src/workers/Visualize.worker.ts approach):
// - Single pass over the raw string: no split(), no per-line substring,
//   no regex, no per-line allocations. Words are scanned inline by char code.
// - Growable Float32/Uint32 buffers with capacity doubling (no JS-array push
//   churn, no second bounds pass — bounds track inline).
// - Cooperative scheduling: yields every 4096 lines with progress posts and
//   honours version cancellation, so rapid edits never queue up stale parses.

let latestVersion = 0;

const yieldWorker = () => new Promise((resolve) => setTimeout(resolve, 0));

function makeF32(initial) {
    return { data: new Float32Array(initial), length: 0 };
}

function makeU32(initial) {
    return { data: new Uint32Array(initial), length: 0 };
}

function ensureF32(buf, extra) {
    const required = buf.length + extra;
    if (required <= buf.data.length) return;
    let next = buf.data.length > 0 ? buf.data.length : 1024;
    while (next < required) next *= 2;
    const grown = new Float32Array(next);
    grown.set(buf.data.subarray(0, buf.length));
    buf.data = grown;
}

function ensureU32(buf, extra) {
    const required = buf.length + extra;
    if (required <= buf.data.length) return;
    let next = buf.data.length > 0 ? buf.data.length : 1024;
    while (next < required) next *= 2;
    const grown = new Uint32Array(next);
    grown.set(buf.data.subarray(0, buf.length));
    buf.data = grown;
}

async function build(version, gcode) {
    const content = typeof gcode === 'string' ? gcode : String(gcode ?? '');
    const total = content.length;

    const positions = makeF32(65536);
    const colors = makeF32(65536);
    const frames = makeU32(4096);

    // Modal state. motion: 0 = none yet, 1 = G0, 2 = G1, 3 = G2, 4 = G3.
    let motion = 0;
    let absolute = true;
    let unitScale = 1;
    let x = 0;
    let y = 0;
    let z = 0;
    let vertexCount = 0;
    let lineIndex = 0;

    let minX = 0;
    let minY = 0;
    let minZ = 0;
    let maxX = 0;
    let maxY = 0;
    let maxZ = 0;
    let hasAny = false;

    const trackBounds = (px, py, pz) => {
        if (!hasAny) {
            minX = px < 0 ? px : 0;
            minY = py < 0 ? py : 0;
            minZ = pz < 0 ? pz : 0;
            maxX = px > 0 ? px : 0;
            maxY = py > 0 ? py : 0;
            maxZ = pz > 0 ? pz : 0;
            hasAny = true;
            return;
        }
        if (px < minX) minX = px;
        else if (px > maxX) maxX = px;
        if (py < minY) minY = py;
        else if (py > maxY) maxY = py;
        if (pz < minZ) minZ = pz;
        else if (pz > maxZ) maxZ = pz;
    };

    const pushSegment = (x1, y1, z1, x2, y2, z2, isRapid) => {
        ensureF32(positions, 6);
        const p = positions.data;
        let o = positions.length;
        p[o] = x1;
        p[o + 1] = y1;
        p[o + 2] = z1;
        p[o + 3] = x2;
        p[o + 4] = y2;
        p[o + 5] = z2;
        positions.length = o + 6;
        // gSender hues: G0 jog green, G1/G2/G3 cutting blue.
        let r = 0.24;
        let g = 0.52;
        let b = 0.78;
        if (isRapid) {
            r = 0.05;
            g = 0.96;
            b = 0.68;
        }
        ensureF32(colors, 6);
        const c = colors.data;
        o = colors.length;
        c[o] = r;
        c[o + 1] = g;
        c[o + 2] = b;
        c[o + 3] = r;
        c[o + 4] = g;
        c[o + 5] = b;
        colors.length = o + 6;
        vertexCount += 2;
        trackBounds(x1, y1, z1);
        trackBounds(x2, y2, z2);
    };

    const pushArc = (tx, ty, tz, i, j, clockwise, isRapid) => {
        const cx = x + i;
        const cy = y + j;
        const dx = x - cx;
        const dy = y - cy;
        const radius = Math.sqrt(dx * dx + dy * dy);
        if (!(radius > 1e-9)) {
            pushSegment(x, y, z, tx, ty, tz, isRapid);
            return;
        }
        const startAngle = Math.atan2(dy, dx);
        const endAngle = Math.atan2(ty - cy, tx - cx);
        let sweep;
        if (clockwise) {
            sweep = startAngle - endAngle;
            while (sweep <= 0) sweep += Math.PI * 2;
        } else {
            sweep = endAngle - startAngle;
            while (sweep <= 0) sweep += Math.PI * 2;
        }
        if (!(sweep > 1e-9)) sweep = Math.PI * 2;
        const arcLen = sweep * radius;
        // ~0.5mm per facet, matching the previous tessellation quality.
        const divisions = Math.max(4, Math.min(64, Math.ceil(arcLen / 0.5)));
        let px = x;
        let py = y;
        let pz = z;
        for (let s = 1; s <= divisions; s += 1) {
            const t = s / divisions;
            const a = clockwise ? startAngle - sweep * t : startAngle + sweep * t;
            const qx = cx + radius * Math.cos(a);
            const qy = cy + radius * Math.sin(a);
            const qz = z + (tz - z) * t;
            pushSegment(px, py, pz, qx, qy, qz, isRapid);
            px = qx;
            py = qy;
            pz = qz;
        }
    };

    const postProgress = () => {
        self.postMessage({
            type: 'progress',
            version,
            progress: total > 0 ? Math.round((pos / total) * 100) : 100,
            lineCount,
        });
    };

    let pos = 0;
    let lineCount = 0;

    while (pos <= total) {
        // Per-line accumulators (NaN = not present on this line).
        let targetMotion = motion;
        let nx = NaN;
        let ny = NaN;
        let nz = NaN;
        let ni = NaN;
        let nj = NaN;

        // Scan one line without allocating it.
        while (pos < total) {
            let ch = content.charCodeAt(pos);
            if (ch === 10 || ch === 13) break;
            if (ch === 32 || ch === 9) {
                pos += 1;
                continue;
            }
            if (ch === 40) {
                // '(' comment — skip to ')'.
                pos += 1;
                while (pos < total && content.charCodeAt(pos) !== 41) pos += 1;
                pos += 1;
                continue;
            }
            if (ch === 59) {
                // ';' comment — skip to end of line.
                while (pos < total) {
                    const c = content.charCodeAt(pos);
                    if (c === 10 || c === 13) break;
                    pos += 1;
                }
                break;
            }
            // Word letter (case-insensitive).
            let letter = ch;
            if (letter >= 97 && letter <= 122) letter -= 32;
            let p = pos + 1;
            while (p < total) {
                const c = content.charCodeAt(p);
                if (c === 32 || c === 9) p += 1;
                else break;
            }
            // Manual number scan — no substring/Number() allocation.
            let sign = 1;
            const s0 = content.charCodeAt(p);
            if (s0 === 43) p += 1;
            else if (s0 === 45) {
                sign = -1;
                p += 1;
            }
            let int = 0;
            let frac = 0;
            let div = 1;
            let seen = false;
            let dotted = false;
            while (p < total) {
                const c = content.charCodeAt(p);
                if (c >= 48 && c <= 57) {
                    seen = true;
                    if (!dotted) int = int * 10 + (c - 48);
                    else {
                        frac = frac * 10 + (c - 48);
                        div *= 10;
                    }
                    p += 1;
                } else if (c === 46 && !dotted) {
                    dotted = true;
                    p += 1;
                } else break;
            }
            if (!seen) {
                // Bare letter with no number — skip the letter only.
                pos += 1;
                continue;
            }
            pos = p;
            const num = sign * (int + frac / div);
            // Drop non-finite words (e.g. 400-digit literals overflow to
            // Infinity). Letting one through poisons the bounds → NaN camera
            // → OrbitControls dispatches 'change' on every update() → render()
            // recurses until "Maximum call stack size exceeded".
            if (!Number.isFinite(num)) {
                continue;
            }
            if (letter === 71) {
                const code = Math.round(num);
                if (code === 0) targetMotion = 1;
                else if (code === 1) targetMotion = 2;
                else if (code === 2) targetMotion = 3;
                else if (code === 3) targetMotion = 4;
                else if (code === 90) absolute = true;
                else if (code === 91) absolute = false;
                else if (code === 20) unitScale = 25.4;
                else if (code === 21) unitScale = 1;
            } else if (letter === 88) nx = num * unitScale;
            else if (letter === 89) ny = num * unitScale;
            else if (letter === 90) nz = num * unitScale;
            else if (letter === 73) ni = num * unitScale;
            else if (letter === 74) nj = num * unitScale;
        }

        // Consume the line ending (tolerate \r, \n, \r\n).
        if (pos < total && content.charCodeAt(pos) === 13) pos += 1;
        if (pos < total && content.charCodeAt(pos) === 10) pos += 1;
        else if (pos >= total) pos = total + 1;

        ensureU32(frames, 1);
        frames.data[frames.length] = vertexCount;
        frames.length += 1;

        if (targetMotion !== 0 && (nx === nx || ny === ny || nz === nz)) {
            motion = targetMotion;
            const tx = nx !== nx ? x : absolute ? nx : x + nx;
            const ty = ny !== ny ? y : absolute ? ny : y + ny;
            const tz = nz !== nz ? z : absolute ? nz : z + nz;
            const isRapid = motion === 1;
            if (motion === 3 || motion === 4) {
                pushArc(tx, ty, tz, ni !== ni ? 0 : ni, nj !== nj ? 0 : nj, motion === 3, isRapid);
            } else {
                pushSegment(x, y, z, tx, ty, tz, isRapid);
            }
            x = tx;
            y = ty;
            z = tz;
        } else if (targetMotion !== 0) {
            motion = targetMotion;
        }

        lineCount += 1;
        if ((lineCount & 4095) === 0) {
            if (version !== latestVersion) return null;
            postProgress();
            await yieldWorker();
        }
    }

    if (version !== latestVersion) return null;

    // Zero-copy handoff: transfer the grown buffers as-is plus used lengths
    // instead of slice() copies (which transiently double multi-hundred-MB
    // geometry and stall/OOM the worker with no further progress posts).
    const positionsLen = positions.length;
    const colorsLen = colors.length;
    const framesLen = frames.length;
    console.log(
        `[gcode-viewer-worker] scan done: ${lineCount.toLocaleString()} lines, ` +
            `${(vertexCount / 2).toLocaleString()} segments, ` +
            `transfer ${((positions.data.byteLength + colors.data.byteLength + frames.data.byteLength) / 1048576).toFixed(1)}MB`,
    );
    return {
        positions: positions.data,
        colors: colors.data,
        frames: frames.data,
        positionsLen,
        colorsLen,
        framesLen,
        bounds: hasAny
            ? {
                  minX: Math.min(minX, 0),
                  minY: Math.min(minY, 0),
                  minZ,
                  maxX: Math.max(maxX, 0),
                  maxY: Math.max(maxY, 0),
                  maxZ,
              }
            : null,
        lineCount,
        segmentCount: vertexCount / 2,
    };
}

self.addEventListener('message', ({ data }) => {
    if (!data || data.type !== 'build') return;
    const version = Number(data.version) || 0;
    latestVersion = version;
    const inputMB = (typeof data.gcode === 'string' ? data.gcode.length : 0) / 1048576;
    console.log(`[gcode-viewer-worker] build v${version} start, input ${inputMB.toFixed(1)}MB`);
    build(version, data.gcode || '')
        .then((result) => {
            if (!result || version !== latestVersion) return;
            try {
                self.postMessage(
                    {
                        type: 'complete',
                        version,
                        positions: result.positions.buffer,
                        colors: result.colors.buffer,
                        frames: result.frames.buffer,
                        positionsLen: result.positionsLen,
                        colorsLen: result.colorsLen,
                        framesLen: result.framesLen,
                        bounds: result.bounds,
                        lineCount: result.lineCount,
                        segmentCount: result.segmentCount,
                    },
                    [result.positions.buffer, result.colors.buffer, result.frames.buffer],
                );
                console.log(`[gcode-viewer-worker] build v${version} posted complete`);
            } catch (error) {
                self.postMessage({
                    type: 'error',
                    version,
                    message: `G-code transfer failed (${error?.message || error}). The file may be too large to preview.`,
                });
            }
        })
        .catch((error) => {
            if (version === latestVersion) {
                self.postMessage({
                    type: 'error',
                    version,
                    message: error?.message || 'G-code parse failed.',
                });
            }
        });
});
