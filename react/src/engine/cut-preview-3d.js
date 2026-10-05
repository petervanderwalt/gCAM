/**
 * Purpose: Implementation module for cut-preview-3d in the engine domain.
 */
// Lightweight stock-removal preview. It rasterizes the actual cutter envelope
// into a height field, then draws that field as an isometric surface mesh.

import {
    paintCutterSample,
    previewSampleAt,
} from './preview-3d/playback-mesh.js';
import { previewWorkerToolpaths } from './preview-3d/worker-input.js';
import {
    createPreviewCamera,
    installPreviewPointerControls,
    panPreviewCamera,
    previewOrbitView,
    rotatePreviewCamera,
    setPreviewCameraHome,
} from './preview-3d/camera-controls.js';
import { createPreviewProjection } from './preview-3d/scene-projection.js';
import { getSurfaceTexture } from './preview-3d/surface-texture.js';
import { drawPreviewOriginAndAxes } from './preview-3d/origin-overlay.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);

export class CutPreview3D {
    constructor(canvas, statusElement) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.statusElement = statusElement;
        this.dark = true;
        this.showEdges = true;
        this.data = null;
        const view = createPreviewCamera(canvas, () => this.render());
        this.camera = view.camera;
        this.controls = view.controls;
        this.cameraHomeDistance = view.homeDistance;
        this.drag = null;
        installPreviewPointerControls(this);
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
        setPreviewCameraHome(this, top);
    }

    orbitView() {
        return previewOrbitView(this);
    }

    rotateFromDrag(dx, dy) {
        rotatePreviewCamera(this, dx, dy);
    }

    panFromDrag(dx, dy) {
        panPreviewCamera(this, dx, dy);
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
        return previewSampleAt(this.data, index);
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
                paintCutterSample(this.playback.grid, sample, this.data);
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

    build(toolpaths, stock) {
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
                toolpaths: previewWorkerToolpaths(toolpaths),
                stock,
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
        const project = createPreviewProjection(rect, view, baseScale);
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
        if (
            this.showEdges &&
            this.edgeCanvas &&
            this.edgeRevision === this.surfaceRevision
        ) {
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
        drawPreviewOriginAndAxes({
            ctx,
            project,
            bounds,
            width,
            height,
            stockThickness,
            dark: this.dark,
        });
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
        return getSurfaceTexture(this, grid, columns, rows, maxDepth, revision);
    }
}
