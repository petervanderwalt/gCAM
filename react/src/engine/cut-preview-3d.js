// Lightweight stock-removal preview. It rasterizes the actual cutter envelope
// into a height field, then draws that field as an isometric surface mesh.

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);

function workerPoint(point) {
    const x = Number(point?.x);
    const y = Number(point?.y);
    const z = Number(point?.z ?? 0);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
        throw new Error('3D preview contains an invalid toolpath coordinate.');
    }
    return { x, y, z };
}

// Toolpath points can be geometry class instances. Workers can only receive
// structured-cloneable data, so keep their input to the preview essentials.
function workerToolpaths(toolpaths) {
    return (toolpaths || []).map((toolpath) => ({
        previewContours: (toolpath.previewContours || []).map((contour) =>
            contour.map(workerPoint),
        ),
        motionPaths: (toolpath.motionPaths || []).map((path) => ({
            points: (path.points || []).map(workerPoint),
        })),
        tabs: (toolpath.tabs || []).map((tab) => ({
            contourIndex: Number(tab.contourIndex) || 0,
            along: Number(tab.along) || 0,
        })),
        passDepths: (toolpath.passDepths || [])
            .map(Number)
            .filter(Number.isFinite),
        toolDiameter: Number(toolpath.toolDiameter) || 0,
        trochoidEnabled: Boolean(toolpath.trochoidEnabled),
        trochoidRadius: Number(toolpath.trochoidRadius) || 0,
        operation: toolpath.operation || '',
        cutterAngle: Number(toolpath.cutterAngle) || 0,
        tabHeight: Number(toolpath.tabHeight) || 0,
        tabWidth: Number(toolpath.tabWidth) || 0,
        cutDepth: Number(toolpath.cutDepth) || 0,
    }));
}

function boundsFor(toolpaths) {
    const points = [];
    for (const toolpath of toolpaths) {
        for (const contour of toolpath.previewContours || [])
            points.push(...contour);
        for (const path of toolpath.motionPaths || [])
            points.push(...(path.points || []));
    }
    if (!points.length) return null;
    let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
    for (const point of points) {
        if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
        minX = Math.min(minX, point.x);
        minY = Math.min(minY, point.y);
        maxX = Math.max(maxX, point.x);
        maxY = Math.max(maxY, point.y);
    }
    if (!Number.isFinite(minX)) return null;
    // Stock always extends to the machine origin so zero stays on the stock.
    return {
        minX: Math.min(minX, 0),
        minY: Math.min(minY, 0),
        maxX: Math.max(maxX, 0),
        maxY: Math.max(maxY, 0),
    };
}

function tabDepth(toolpath, contour, along, cutDepth) {
    const tabs = (toolpath.tabs || []).filter(
        (tab) => tab.contourIndex === toolpath.previewContours.indexOf(contour),
    );
    if (!tabs.length || !toolpath.tabHeight) return cutDepth;
    const total = contour.reduce(
        (sum, point, index) =>
            index ? sum + dist(contour[index - 1], point) : sum,
        0,
    );
    const ramp = Math.max((toolpath.toolDiameter || 1) * 0.75, 0.5);
    const width = Math.max(
        toolpath.tabWidth || 0,
        (toolpath.toolDiameter || 0) * 1.5,
    );
    const span = width + (toolpath.toolDiameter || 0);
    const top = -Math.max(0, (toolpath.cutDepth || 0) - toolpath.tabHeight);
    if (cutDepth >= top) return cutDepth;
    let result = cutDepth;
    for (const tab of tabs) {
        const start = Math.max(0, tab.along - span / 2);
        const end = Math.min(total, tab.along + span / 2);
        const rampStart = Math.max(0, start - ramp);
        const rampEnd = Math.min(total, end + ramp);
        let factor = 0;
        if (along >= start && along <= end) factor = 1;
        else if (along >= rampStart && along < start)
            factor = (along - rampStart) / Math.max(0.001, start - rampStart);
        else if (along > end && along <= rampEnd)
            factor = 1 - (along - end) / Math.max(0.001, rampEnd - end);
        result = Math.max(result, cutDepth + (top - cutDepth) * factor);
    }
    return result;
}

function contourSamples(toolpath, contour, depth, step) {
    const segments = [];
    let total = 0;
    for (let index = 1; index < contour.length; index += 1) {
        const length = dist(contour[index - 1], contour[index]);
        segments.push(length);
        total += length;
    }
    const output = [];
    let travelled = 0;
    for (let index = 1; index < contour.length; index += 1) {
        const a = contour[index - 1],
            b = contour[index],
            length = segments[index - 1];
        const count = Math.max(1, Math.ceil(length / step));
        for (let sample = 0; sample <= count; sample += 1) {
            const ratio = sample / count;
            const along = travelled + length * ratio;
            output.push({
                x: a.x + (b.x - a.x) * ratio,
                y: a.y + (b.y - a.y) * ratio,
                z: tabDepth(toolpath, contour, along, depth),
            });
        }
        travelled += length;
    }
    return output;
}

function motionSamples(points, step) {
    const output = [];
    for (let index = 1; index < points.length; index += 1) {
        const a = points[index - 1],
            b = points[index],
            length = dist(a, b);
        const count = Math.max(1, Math.ceil(length / step));
        for (let sample = 0; sample <= count; sample += 1) {
            const ratio = sample / count;
            output.push({
                x: a.x + (b.x - a.x) * ratio,
                y: a.y + (b.y - a.y) * ratio,
                z: (a.z || 0) + ((b.z || 0) - (a.z || 0)) * ratio,
            });
        }
    }
    return output;
}

function paintSampleInto(grid, sample, geometry) {
    if (sample.z >= -0.0001) return;
    const { bounds, columns, rows, cellX, cellY } = geometry;
    const tangent = Math.tan((sample.angle * Math.PI) / 180 / 2);
    // A V-bit cuts a cone, not a slot: the footprint grows with tip depth
    // (surface half-width = depth * tan(half-angle)). Using the body diameter
    // here modelled it as a flat endmill, so v-carves rendered as thin slots
    // instead of grooves that widen as the bit plunges deeper.
    const depth = -sample.z;
    const radius = sample.vbit
        ? Math.max(
              depth * tangent + sample.trochoidRadius,
              Math.max(cellX, cellY) * 0.68,
          )
        : Math.max(
              sample.cutter / 2 + sample.trochoidRadius,
              Math.max(cellX, cellY) * 0.68,
          );
    const minColumn = clamp(
        Math.floor((sample.x - radius - bounds.minX) / cellX),
        0,
        columns - 1,
    );
    const maxColumn = clamp(
        Math.ceil((sample.x + radius - bounds.minX) / cellX),
        0,
        columns - 1,
    );
    const minRow = clamp(
        Math.floor((sample.y - radius - bounds.minY) / cellY),
        0,
        rows - 1,
    );
    const maxRow = clamp(
        Math.ceil((sample.y + radius - bounds.minY) / cellY),
        0,
        rows - 1,
    );
    for (let row = minRow; row <= maxRow; row += 1) {
        const y = bounds.minY + row * cellY;
        for (let column = minColumn; column <= maxColumn; column += 1) {
            const x = bounds.minX + column * cellX;
            const radial = Math.hypot(x - sample.x, y - sample.y);
            if (radial > radius) continue;
            const z = sample.vbit
                ? Math.min(0, sample.z + radial / tangent)
                : sample.z;
            grid[row * columns + column] = Math.min(
                grid[row * columns + column],
                z,
            );
        }
    }
}

export class CutPreview3D {
    constructor(canvas, statusElement) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.statusElement = statusElement;
        this.dark = true;
        this.showEdges = true;
        this.data = null;
        this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100000);
        this.controls = new OrbitControls(this.camera, canvas);
        // The surface is rendered on a fitted 2D canvas, so OrbitControls'
        // perspective pan/rotate deltas do not match its screen geometry. Keep
        // OrbitControls for wheel zoom, and map rotate/pan directly to the same
        // projection used by render().
        this.controls.enableRotate = false;
        this.controls.enablePan = false;
        this.cameraHomeDistance = 1;
        this.controls.addEventListener('change', () => this.render());
        this.drag = null;
        canvas.addEventListener('contextmenu', (event) => event.preventDefault());
        canvas.addEventListener('pointerdown', (event) => {
            if (event.button !== 0 && event.button !== 2) return;
            this.drag = {
                button: event.button,
                pointerId: event.pointerId,
                x: event.clientX,
                y: event.clientY,
            };
            canvas.setPointerCapture?.(event.pointerId);
            event.preventDefault();
        });
        canvas.addEventListener('pointermove', (event) => {
            if (!this.drag || event.pointerId !== this.drag.pointerId) return;
            const dx = event.clientX - this.drag.x;
            const dy = event.clientY - this.drag.y;
            this.drag.x = event.clientX;
            this.drag.y = event.clientY;
            if (this.drag.button === 0) this.rotateFromDrag(dx, dy);
            else this.panFromDrag(dx, dy);
            event.preventDefault();
        });
        const endDrag = (event) => {
            if (!this.drag || event.pointerId !== this.drag.pointerId) return;
            canvas.releasePointerCapture?.(event.pointerId);
            this.drag = null;
        };
        canvas.addEventListener('pointerup', endDrag);
        canvas.addEventListener('pointercancel', endDrag);
        this.setCameraHome();
        this.version = 0;
        this.surfaceRevision = null;
        this.edgeRevision = null;
        this.playback = {
            activeSample: null,
            frame: 0,
            grid: null,
            index: 0,
            lastFrame: 0,
            lastRender: 0,
            running: false,
            speed: 1,
        };
        this.worker = new Worker(
            new URL('./cut-preview-3d-worker.js', import.meta.url),
            { type: 'module' },
        );
        this.worker.addEventListener('message', ({ data }) =>
            this.handleWorkerMessage(data),
        );
        this.worker.addEventListener('error', () => {
            this.pausePlayback();
            this.data = null;
            this.surfaceRevision = null;
            this.edgeRevision = null;
            this.playback = {
                ...this.playback,
                activeSample: null,
                grid: null,
                index: 0,
            };
            this.statusElement.textContent =
                '3D simulation worker failed. Rebuild to try again.';
            this.notifyPlaybackChange();
            this.render();
        });
    }

    setCameraHome(top = false) {
        const bounds = this.data?.bounds;
        const width = bounds ? bounds.maxX - bounds.minX : 100;
        const height = bounds ? bounds.maxY - bounds.minY : 100;
        const thickness =
            this.data?.stockThickness || Math.max(width, height) * 0.1;
        const targetX = bounds ? bounds.minX + width / 2 : 0;
        const targetZ = bounds ? bounds.minY + height / 2 : 0;
        const distance = Math.max(20, (width + height + thickness) * 0.92);
        const yaw = top ? 0 : 0.7;
        const pitch = top ? 0.02 : 0.72;
        const sinPitch = Math.sin(pitch);

        this.controls.target.set(targetX, 0, targetZ);
        this.camera.position.set(
            targetX + distance * sinPitch * Math.sin(yaw),
            distance * Math.cos(pitch),
            targetZ + distance * sinPitch * Math.cos(yaw),
        );
        this.cameraHomeDistance = distance;
        this.camera.lookAt(this.controls.target);
        this.controls.update();
    }

    orbitView() {
        const offset = this.camera.position.clone().sub(this.controls.target);
        const distance = Math.max(offset.length(), 0.001);
        return {
            yaw: Math.atan2(offset.x, offset.z),
            pitch: Math.acos(clamp(offset.y / distance, -1, 1)),
            scale: this.cameraHomeDistance / distance,
            targetX: this.controls.target.x,
            targetY: this.controls.target.z,
        };
    }

    rotateFromDrag(dx, dy) {
        const offset = this.camera.position.clone().sub(this.controls.target);
        const spherical = new THREE.Spherical().setFromVector3(offset);
        const sensitivity = 0.0025;
        // Match the familiar horizontal orbit direction, but invert vertical
        // motion so dragging up moves the view up and dragging down moves it down.
        spherical.theta -= dx * sensitivity;
        spherical.phi = clamp(
            spherical.phi + dy * sensitivity,
            0.08,
            Math.PI - 0.08,
        );
        offset.setFromSpherical(spherical);
        this.camera.position.copy(this.controls.target).add(offset);
        this.camera.lookAt(this.controls.target);
        this.render();
    }

    panFromDrag(dx, dy) {
        const rect = this.canvas.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        const view = this.orbitView();
        const bounds = this.data?.bounds;
        const width = bounds ? bounds.maxX - bounds.minX : 100;
        const height = bounds ? bounds.maxY - bounds.minY : 100;
        const thickness = this.data?.stockThickness || Math.max(width, height) * 0.1;
        const baseScale =
            Math.min(
                rect.width / (width + height),
                rect.height / ((width + height) * 0.62 + thickness * 1.25),
            ) * view.scale;
        const cos = Math.cos(view.yaw);
        const sin = Math.sin(view.yaw);
        const cosPitch = Math.max(0.08, Math.cos(view.pitch));
        // Invert the renderer's affine screen transform directly. This keeps
        // the stock under the pointer instead of applying camera-space pan
        // math intended for a perspective-rendered scene.
        const targetDeltaX = (-cos * dx - sin * dy) / baseScale;
        const targetDeltaZ = (-sin * dx + (cos * dy) / cosPitch) / baseScale;
        this.controls.target.x += targetDeltaX;
        this.controls.target.z += targetDeltaZ;
        this.camera.position.x += targetDeltaX;
        this.camera.position.z += targetDeltaZ;
        this.camera.lookAt(this.controls.target);
        this.render();
    }

    resize() {
        const rect = this.canvas.getBoundingClientRect();
        const ratio = window.devicePixelRatio || 1;
        if (!rect.width || !rect.height) return;
        this.canvas.width = Math.round(rect.width * ratio);
        this.canvas.height = Math.round(rect.height * ratio);
        this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        this.camera.aspect = rect.width / rect.height;
        this.camera.updateProjectionMatrix();
        this.render();
    }

    setTheme(dark) {
        this.dark = dark !== false;
        this.render();
    }

    setShowEdges(show) {
        this.showEdges = show !== false;
        this.render();
    }

    resetCamera(top = false) {
        this.setCameraHome(top);
        this.render();
    }

    notifyPlaybackChange() {
        this.onPlaybackChange?.({
            index: this.playback.index,
            running: this.playback.running,
            speed: this.playback.speed,
            total: this.sampleCount(),
        });
    }

    sampleCount() {
        return this.data?.sampleData ? this.data.sampleData.length / 6 : 0;
    }

    sampleAt(index) {
        const offset = index * 6;
        const data = this.data?.sampleData;
        if (!data || offset + 5 >= data.length) return null;
        return {
            x: data[offset],
            y: data[offset + 1],
            z: data[offset + 2],
            cutter: data[offset + 3],
            trochoidRadius: data[offset + 4],
            angle: data[offset + 5],
            vbit: Boolean(this.data.sampleKinds?.[index]),
        };
    }

    setPlaybackStatus() {
        if (!this.data) return;
        const total = this.sampleCount();
        const progress = total
            ? Math.round((this.playback.index / total) * 100)
            : 0;
        const state = this.playback.running
            ? 'Cutting'
            : this.playback.index >= total
              ? 'Cut complete'
              : 'Paused';
        this.statusElement.textContent = `${state}: ${progress}% at ${this.playback.speed}x. Drag to orbit, scroll to zoom, right-drag to pan.`;
    }

    pausePlayback() {
        if (!this.playback.running) return;
        this.playback.running = false;
        if (this.playback.frame) cancelAnimationFrame(this.playback.frame);
        this.playback.frame = 0;
        this.setPlaybackStatus();
        this.notifyPlaybackChange();
    }

    resetPlayback({ render = true } = {}) {
        if (!this.data) return;
        if (this.playback.frame) cancelAnimationFrame(this.playback.frame);
        this.playback = {
            ...this.playback,
            activeSample: null,
            frame: 0,
            grid: new Float32Array(this.data.columns * this.data.rows),
            index: 0,
            lastFrame: 0,
            lastRender: 0,
            running: false,
        };
        this.surfaceRevision = null;
        this.setPlaybackStatus();
        this.notifyPlaybackChange();
        if (render) this.render();
    }

    setPlaybackSpeed(speed) {
        this.playback.speed = clamp(Number(speed) || 1, 1, 100);
        this.setPlaybackStatus();
        this.notifyPlaybackChange();
    }

    playPlayback() {
        if (!this.data) return;
        if (this.playback.index >= this.sampleCount())
            this.resetPlayback({ render: false });
        this.playback.running = true;
        this.playback.lastFrame = 0;
        this.setPlaybackStatus();
        this.notifyPlaybackChange();
        const frame = (now) => {
            if (!this.playback.running || !this.data) return;
            if (!this.playback.lastFrame) this.playback.lastFrame = now;
            const elapsed = Math.min(120, now - this.playback.lastFrame);
            this.playback.lastFrame = now;
            // At 1x, 600 sampled cutter positions per second gives a readable
            // simulation; the higher rates are intended for rapid review.
            // Bound work on the UI thread. The worker builds the final height field;
            // playback only reveals it incrementally and must never starve input.
            const batch = clamp(
                Math.floor(elapsed * 0.55 * this.playback.speed),
                1,
                220,
            );
            const target = Math.min(
                this.sampleCount(),
                this.playback.index + batch,
            );
            while (this.playback.index < target) {
                const sample = this.sampleAt(this.playback.index);
                if (!sample) break;
                paintSampleInto(this.playback.grid, sample, this.data);
                this.playback.activeSample = sample;
                this.playback.index += 1;
            }
            // Mesh drawing is deliberately throttled: cutter application still runs
            // every frame, while the expensive shaded surface refreshes at 10 FPS.
            if (
                now - this.playback.lastRender >= 160 ||
                this.playback.index >= this.sampleCount()
            ) {
                this.playback.lastRender = now;
                this.setPlaybackStatus();
                this.render();
            }
            if (this.playback.index >= this.sampleCount()) {
                this.playback.running = false;
                this.playback.frame = 0;
                this.setPlaybackStatus();
                this.notifyPlaybackChange();
                return;
            }
            this.playback.frame = requestAnimationFrame(frame);
        };
        this.playback.frame = requestAnimationFrame(frame);
    }

    togglePlayback() {
        if (this.playback.running) this.pausePlayback();
        else this.playPlayback();
    }

    replay() {
        if (!this.data) return;
        this.resetPlayback({ render: false });
        this.playPlayback();
    }

    build(toolpaths) {
        const version = ++this.version;
        this.pausePlayback();
        this.data = null;
        this.surfaceRevision = null;
        this.playback = {
            ...this.playback,
            activeSample: null,
            grid: null,
            index: 0,
        };
        this.notifyPlaybackChange();
        this.render();
        this.statusElement.textContent = 'Preparing 3D cutter simulation...';
        try {
            this.worker.postMessage({
                type: 'build',
                version,
                toolpaths: workerToolpaths(toolpaths),
            });
        } catch (error) {
            this.data = null;
            this.surfaceRevision = null;
            this.edgeRevision = null;
            this.statusElement.textContent =
                '3D simulation data could not be sent to the worker.';
            this.render();
        }
    }

    handleWorkerMessage(data) {
        if (!data || data.version !== this.version) return;
        if (data.type === 'empty') {
            this.data = null;
            this.surfaceRevision = null;
            this.edgeRevision = null;
            this.playback = {
                ...this.playback,
                activeSample: null,
                grid: null,
                index: 0,
                running: false,
            };
            this.statusElement.textContent =
                'Add a toolpath to simulate stock removal.';
            this.notifyPlaybackChange();
            this.render();
            return;
        }
        if (data.type === 'progress') {
            const count = Number(data.total) || 0;
            this.statusElement.textContent = `Simulating ${count.toLocaleString()} cutter positions: ${data.progress}%`;
            return;
        }
        if (data.type === 'error') {
            this.data = null;
            this.surfaceRevision = null;
            this.edgeRevision = null;
            this.playback = {
                ...this.playback,
                activeSample: null,
                grid: null,
                index: 0,
                running: false,
            };
            this.statusElement.textContent =
                data.message || '3D simulation failed.';
            this.notifyPlaybackChange();
            this.render();
            return;
        }
        if (data.type !== 'complete') return;
        this.data = {
            bounds: data.bounds,
            grid: new Float32Array(data.grid),
            sampleData: new Float32Array(data.sampleData),
            sampleKinds: new Uint8Array(data.sampleKinds),
            columns: data.columns,
            rows: data.rows,
            cellX: data.cellX,
            cellY: data.cellY,
            maxDepth: data.maxDepth,
            stockThickness: data.maxDepth,
        };
        this.surfaceRevision = null;
        this.setCameraHome();
        // Open on the finished (already-cut) state so the Preview tab shows
        // the result immediately. Play / Restart replays the animation.
        if (this.playback.frame) cancelAnimationFrame(this.playback.frame);
        this.playback = {
            ...this.playback,
            activeSample: null,
            frame: 0,
            grid: null,
            index: this.data.sampleData ? this.data.sampleData.length / 6 : 0,
            lastFrame: 0,
            lastRender: 0,
            running: false,
        };
        this.setPlaybackStatus();
        this.notifyPlaybackChange();
        // Re-read layout before painting: the tab may have mounted with a
        // zero-size canvas, which would leave a blank frame until the next
        // orbit/resize event otherwise.
        this.resize();
    }

    render() {
        const rect = this.canvas.getBoundingClientRect();
        const ctx = this.ctx;
        ctx.clearRect(0, 0, rect.width, rect.height);
        ctx.fillStyle = this.dark ? '#0b1220' : '#e8e8e8';
        ctx.fillRect(0, 0, rect.width, rect.height);
        if (!this.data) return;
        const {
            bounds,
            columns,
            rows,
            cellX,
            cellY,
            maxDepth,
            stockThickness,
        } = this.data;
        const grid =
            this.playback.index >= this.sampleCount()
                ? this.data.grid
                : this.playback.grid || this.data.grid;
        const width = bounds.maxX - bounds.minX,
            height = bounds.maxY - bounds.minY;
        const view = this.orbitView();
        const baseScale =
            Math.min(
                rect.width / (width + height),
                rect.height / ((width + height) * 0.62 + stockThickness * 1.25),
            ) * view.scale;
        const cos = Math.cos(view.yaw),
            sin = Math.sin(view.yaw),
            cp = Math.cos(view.pitch),
            sp = Math.sin(view.pitch);
        const project = (x, y, z) => {
            // Canvas coordinates run down the screen; invert Y here so the 3D stock
            // matches the 2D workspace orientation rather than mirroring it.
            const xx = x - view.targetX,
                yy = view.targetY - y;
            const rx = xx * cos - yy * sin,
                ry = xx * sin + yy * cos;
            // Negative Z is down into the stock, so it must project lower on screen.
            return {
                x: rect.width / 2 + rx * baseScale,
                y: rect.height / 2 + (ry * cp - z * sp) * baseScale,
            };
        };
        const fillFace = (
            points,
            fill,
            stroke = 'rgba(150, 150, 150, 0.3)',
        ) => {
            ctx.beginPath();
            ctx.moveTo(points[0].x, points[0].y);
            for (let point = 1; point < points.length; point += 1)
                ctx.lineTo(points[point].x, points[point].y);
            ctx.closePath();
            ctx.fillStyle = fill;
            ctx.fill();
            if (stroke) {
                ctx.strokeStyle = stroke;
                ctx.lineWidth = 0.7;
                ctx.stroke();
            }
        };

        // Render the uncut stock as a real slab first. The relief mesh then removes
        // material from its upper face instead of looking like raised toolpath lines.
        const stockTop = [
            project(bounds.minX, bounds.minY, 0),
            project(bounds.maxX, bounds.minY, 0),
            project(bounds.maxX, bounds.maxY, 0),
            project(bounds.minX, bounds.maxY, 0),
        ];
        const stockBottom = [
            project(bounds.minX, bounds.minY, -stockThickness),
            project(bounds.maxX, bounds.minY, -stockThickness),
            project(bounds.maxX, bounds.maxY, -stockThickness),
            project(bounds.minX, bounds.maxY, -stockThickness),
        ];
        fillFace(
            [stockTop[0], stockTop[1], stockBottom[1], stockBottom[0]],
            '#d0d0d0',
        );
        fillFace(
            [stockTop[1], stockTop[2], stockBottom[2], stockBottom[1]],
            '#c0c0c0',
        );
        fillFace(
            [stockTop[2], stockTop[3], stockBottom[3], stockBottom[2]],
            '#b0b0b0',
        );
        fillFace(
            [stockTop[3], stockTop[0], stockBottom[0], stockBottom[3]],
            '#b8b8b8',
        );

        // Render the top as a single, antialiased height-map texture. The height
        // field remains the source of truth for the cutter simulation, but this
        // avoids exposing every raster cell as a visible facet.
        const texture = this.getSurfaceTexture(
            grid,
            columns,
            rows,
            maxDepth,
            this.playback.index,
        );
        ctx.save();
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.transform(
            (stockTop[1].x - stockTop[0].x) / texture.width,
            (stockTop[1].y - stockTop[0].y) / texture.width,
            (stockTop[3].x - stockTop[0].x) / texture.height,
            (stockTop[3].y - stockTop[0].y) / texture.height,
            stockTop[0].x,
            stockTop[0].y,
        );
        ctx.drawImage(texture, 0, 0);
        ctx.restore();
        // Cut-edge overlay (three.js EdgesHelper equivalent): crisp outlines
        // where the height field steps, so pockets/profiles read clearly
        // against the smoothly shaded surface. Same warp as the surface.
        if (this.showEdges && this.edgeCanvas && this.edgeRevision === this.surfaceRevision) {
            ctx.save();
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.transform(
                (stockTop[1].x - stockTop[0].x) / this.edgeCanvas.width,
                (stockTop[1].y - stockTop[0].y) / this.edgeCanvas.width,
                (stockTop[3].x - stockTop[0].x) / this.edgeCanvas.height,
                (stockTop[3].y - stockTop[0].y) / this.edgeCanvas.height,
                stockTop[0].x,
                stockTop[0].y,
            );
            ctx.drawImage(this.edgeCanvas, 0, 0);
            ctx.restore();
        }
        // The surface texture shades every simulated height sample, including the
        // cut boundary. Do not stroke the cell-to-cell vertical faces here: doing
        // so exposes the height-field raster as a dotted or stair-stepped contour.
        if (this.playback.activeSample) {
            const cutter = project(
                this.playback.activeSample.x,
                this.playback.activeSample.y,
                Math.min(0, this.playback.activeSample.z),
            );
            const radius = Math.max(
                3,
                Math.min(
                    9,
                    this.playback.activeSample.cutter * baseScale * 0.28,
                ),
            );
            ctx.beginPath();
            ctx.arc(cutter.x, cutter.y, radius, 0, Math.PI * 2);
            ctx.fillStyle = '#0078d4';
            ctx.fill();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1.2;
            ctx.stroke();
        }
        // Floating origin callout so users know where to zero the machine.
        // The worker already extends the stock to include (0,0); mark it here.
        const originTop = project(0, 0, 0);
        const lift = Math.max(
            stockThickness * 0.6,
            Math.max(width, height) * 0.08,
            5,
        );
        const originFloat = project(0, 0, lift);
        ctx.save();
        ctx.strokeStyle = this.dark
            ? 'rgba(62, 133, 199, 0.9)'
            : '#3E85C7';
        ctx.lineWidth = 1.2;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(originTop.x, originTop.y);
        ctx.lineTo(originFloat.x, originFloat.y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.arc(originTop.x, originTop.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#ef4444';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        const label = 'Zero here';
        ctx.font = '600 11px Segoe UI, system-ui, sans-serif';
        const textWidth = ctx.measureText(label).width;
        const padX = 7;
        const pillW = textWidth + padX * 2;
        const pillH = 20;
        const pillX = originFloat.x - pillW / 2;
        const pillY = originFloat.y - pillH - 6;
        ctx.beginPath();
        if (typeof ctx.roundRect === 'function') {
            ctx.roundRect(pillX, pillY, pillW, pillH, 10);
        } else {
            ctx.rect(pillX, pillY, pillW, pillH);
        }
        ctx.fillStyle = '#3E85C7';
        ctx.fill();
        ctx.strokeStyle = this.dark
            ? 'rgba(255, 255, 255, 0.9)'
            : '#2c5d8b';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, pillX + padX, pillY + pillH / 2 + 0.5);
        ctx.restore();
        // X/Y direction indicators from the zero corner. They start a small
        // margin away from the origin dot so they never cover it, then run as
        // dashed lines with arrowheads + axis labels in gSender axis colors.
        const axisLen = clamp(Math.max(width, height) * 0.16, 12, 60);
        const axisMargin = clamp(axisLen * 0.22, 4, 12);
        const axisZ = Math.max(stockThickness * 0.05, 0.5);
        const drawAxisIndicator = (start, end, color, text) => {
            const p0 = project(start.x, start.y, start.z);
            const p1 = project(end.x, end.y, end.z);
            const dx = p1.x - p0.x;
            const dy = p1.y - p0.y;
            const len = Math.hypot(dx, dy);
            if (!(len > 1)) return;
            const ux = dx / len;
            const uy = dy / len;
            ctx.save();
            ctx.strokeStyle = color;
            ctx.fillStyle = color;
            ctx.lineWidth = 1.5;
            ctx.setLineDash([5, 4]);
            ctx.beginPath();
            ctx.moveTo(p0.x, p0.y);
            ctx.lineTo(p1.x, p1.y);
            ctx.stroke();
            ctx.setLineDash([]);
            // Filled arrowhead oriented along the projected direction.
            const headLen = 8;
            const headHalf = 3.4;
            const bx = p1.x - ux * headLen;
            const by = p1.y - uy * headLen;
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(bx - uy * headHalf, by + ux * headHalf);
            ctx.lineTo(bx + uy * headHalf, by - ux * headHalf);
            ctx.closePath();
            ctx.fill();
            // Axis letter just past the tip with a halo for readability.
            ctx.font = '700 12px Segoe UI, system-ui, sans-serif';
            ctx.textBaseline = 'middle';
            const lx = p1.x + ux * 10;
            const ly = p1.y + uy * 10;
            ctx.lineWidth = 3;
            ctx.strokeStyle = this.dark ? '#0b1220' : '#e8e8e8';
            ctx.strokeText(text, lx - 4, ly);
            ctx.fillStyle = color;
            ctx.fillText(text, lx - 4, ly);
            ctx.restore();
        };
        drawAxisIndicator(
            { x: axisMargin, y: 0, z: axisZ },
            { x: axisMargin + axisLen, y: 0, z: axisZ },
            '#df3b3b',
            'X',
        );
        drawAxisIndicator(
            { x: 0, y: axisMargin, z: axisZ },
            { x: 0, y: axisMargin + axisLen, z: axisZ },
            '#06b881',
            'Y',
        );
        const corner = project(bounds.minX, bounds.minY, 0);
        ctx.fillStyle = this.dark
            ? 'rgba(203, 213, 225, 0.75)'
            : 'rgba(30, 30, 30, 0.7)';
        ctx.font = '11px Segoe UI';
        ctx.fillText(
            'Drag to orbit  |  Scroll to zoom  |  Right-drag to pan',
            corner.x + 10,
            rect.height - 16,
        );
    }

    getSurfaceTexture(grid, columns, rows, maxDepth, revision) {
        // The simulation grid may be millions of cells. A capped texture is visually
        // indistinguishable at canvas scale, while avoiding a costly full-grid paint
        // on every playback refresh.
        const textureScale = Math.min(1, 800 / Math.max(columns, rows));
        const textureColumns = Math.max(1, Math.round(columns * textureScale));
        const textureRows = Math.max(1, Math.round(rows * textureScale));
        if (
            !this.surfaceCanvas ||
            this.surfaceCanvas.width !== textureColumns ||
            this.surfaceCanvas.height !== textureRows
        ) {
            this.surfaceCanvas = document.createElement('canvas');
            this.surfaceCanvas.width = textureColumns;
            this.surfaceCanvas.height = textureRows;
            this.surfaceContext = this.surfaceCanvas.getContext('2d', {
                alpha: false,
            });
        }
        if (
            !this.edgeCanvas ||
            this.edgeCanvas.width !== textureColumns ||
            this.edgeCanvas.height !== textureRows
        ) {
            this.edgeCanvas = document.createElement('canvas');
            this.edgeCanvas.width = textureColumns;
            this.edgeCanvas.height = textureRows;
            this.edgeContext = this.edgeCanvas.getContext('2d');
        }
        const signature = `${columns}x${rows}:${textureColumns}x${textureRows}:${revision}`;
        if (this.surfaceRevision === signature) return this.surfaceCanvas;
        const image = this.surfaceContext.createImageData(
            textureColumns,
            textureRows,
        );
        const pixels = image.data;
        const edgeImage = this.edgeContext.createImageData(
            textureColumns,
            textureRows,
        );
        const edgePixels = edgeImage.data;
        const sourceIndex = (row, column) => {
            const sourceRow = clamp(
                Math.round((row / Math.max(1, textureRows - 1)) * (rows - 1)),
                0,
                rows - 1,
            );
            const sourceColumn = clamp(
                Math.round(
                    (column / Math.max(1, textureColumns - 1)) * (columns - 1),
                ),
                0,
                columns - 1,
            );
            return sourceRow * columns + sourceColumn;
        };
        for (let row = 0; row < textureRows; row += 1) {
            for (let column = 0; column < textureColumns; column += 1) {
                const index = sourceIndex(row, column);
                const center = grid[index];
                const left = grid[sourceIndex(row, Math.max(0, column - 1))];
                const right =
                    grid[
                        sourceIndex(
                            row,
                            Math.min(textureColumns - 1, column + 1),
                        )
                    ];
                const above = grid[sourceIndex(Math.max(0, row - 1), column)];
                const below =
                    grid[
                        sourceIndex(Math.min(textureRows - 1, row + 1), column)
                    ];
                const diagonalTopLeft =
                    grid[
                        sourceIndex(
                            Math.max(0, row - 1),
                            Math.max(0, column - 1),
                        )
                    ];
                const diagonalTopRight =
                    grid[
                        sourceIndex(
                            Math.max(0, row - 1),
                            Math.min(textureColumns - 1, column + 1),
                        )
                    ];
                const diagonalBottomLeft =
                    grid[
                        sourceIndex(
                            Math.min(textureRows - 1, row + 1),
                            Math.max(0, column - 1),
                        )
                    ];
                const diagonalBottomRight =
                    grid[
                        sourceIndex(
                            Math.min(textureRows - 1, row + 1),
                            Math.min(textureColumns - 1, column + 1),
                        )
                    ];
                // A weighted 3x3 filter gives continuous cutter edges while leaving
                // the underlying depth data untouched for playback.
                const softened =
                    (center * 4 +
                        left * 2 +
                        right * 2 +
                        above * 2 +
                        below * 2 +
                        diagonalTopLeft +
                        diagonalTopRight +
                        diagonalBottomLeft +
                        diagonalBottomRight) /
                    16;
                const depth = clamp(-softened / maxDepth, 0, 1);
                const slopeX = (right - left) / Math.max(maxDepth, 0.01);
                const slopeY = (below - above) / Math.max(maxDepth, 0.01);
                const slope = clamp(slopeX * 0.7 + slopeY * 0.45, -1, 1);
                const edgeShade = clamp(
                    Math.hypot(slopeX, slopeY) * 0.42,
                    0,
                    0.2,
                );
                const shade = clamp(
                    1 - depth * 0.33 - slope * 0.12 - edgeShade,
                    0.43,
                    1,
                );
                const pixel = (row * textureColumns + column) * 4;
                // Retain a solid stock colour, then darken only removed areas.
                const base = 220;
                const depthFactor = Math.round(depth * 45);
                pixels[pixel] = Math.round((base - depthFactor) * shade);
                pixels[pixel + 1] = Math.round((base - depthFactor) * shade);
                pixels[pixel + 2] = Math.round((base - depthFactor) * shade);
                pixels[pixel + 3] = 255;
                // Edge overlay: raw (unsoftened) step between neighbours, so
                // cut walls stay crisp instead of inheriting the blur above.
                const step = Math.max(
                    Math.abs(center - left),
                    Math.abs(center - right),
                    Math.abs(center - above),
                    Math.abs(center - below),
                );
                const edgePixel = (row * textureColumns + column) * 4;
                if (step > Math.max(0.12, maxDepth * 0.03)) {
                    edgePixels[edgePixel] = 35;
                    edgePixels[edgePixel + 1] = 35;
                    edgePixels[edgePixel + 2] = 35;
                    edgePixels[edgePixel + 3] = 165;
                } else {
                    edgePixels[edgePixel + 3] = 0;
                }
            }
        }
        this.surfaceContext.putImageData(image, 0, 0);
        this.edgeContext.putImageData(edgeImage, 0, 0);
        this.surfaceRevision = signature;
        this.edgeRevision = signature;
        return this.surfaceCanvas;
    }
}
