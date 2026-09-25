// Three.js G-code toolpath viewer (gSender Visualizer-inspired, dependency-free).
// Worker parses G-code into color-coded line segments; this module renders
// grid + axes + toolpath with orbit controls and a "Zero here" origin callout.

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

function makeTextSprite(text) {
    const pad = 12;
    const font = '600 28px Segoe UI, system-ui, sans-serif';
    const measure = document.createElement('canvas').getContext('2d');
    measure.font = font;
    const textWidth = Math.ceil(measure.measureText(text).width);
    const canvas = document.createElement('canvas');
    canvas.width = textWidth + pad * 2;
    canvas.height = 56;
    const ctx = canvas.getContext('2d');
    const radius = 26;
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(1, 1, canvas.width - 2, canvas.height - 2, radius);
    } else {
        ctx.rect(1, 1, canvas.width - 2, canvas.height - 2);
    }
    // gSender primary blue in both modes so the pill matches gSender chrome.
    ctx.fillStyle = '#3E85C7';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.font = font;
    ctx.fillStyle = '#ffffff';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, pad, canvas.height / 2 + 1);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true });
    const sprite = new THREE.Sprite(material);
    const scale = 0.055;
    sprite.scale.set(canvas.width * scale, canvas.height * scale, 1);
    sprite.renderOrder = 10;
    return sprite;
}

function makeAxisLabelSprite(text, color) {
    const font = '700 44px Segoe UI, system-ui, sans-serif';
    const measure = document.createElement('canvas').getContext('2d');
    measure.font = font;
    const textWidth = Math.ceil(measure.measureText(text).width);
    const canvas = document.createElement('canvas');
    canvas.width = textWidth + 24;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.font = font;
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 7;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.strokeText(text, 12, canvas.height / 2 + 2);
    ctx.fillStyle = color;
    ctx.fillText(text, 12, canvas.height / 2 + 2);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true });
    const sprite = new THREE.Sprite(material);
    const scale = 0.055;
    sprite.scale.set(canvas.width * scale, canvas.height * scale, 1);
    sprite.renderOrder = 9;
    return sprite;
}

export class GcodeViewer3D {
    constructor(canvas, statusElement) {
        this.canvas = canvas;
        this.statusElement = statusElement;
        this.dark = true;
        this.version = 0;
        this.data = null;

        this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
        this.renderer.setPixelRatio(window.devicePixelRatio || 1);
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color('#0b1220');
        this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100000);
        this.camera.position.set(0, 136, 150);
        this.controls = new OrbitControls(this.camera, canvas);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.12;
        this.controls.addEventListener('change', () => this.render());
        this.group = new THREE.Group();
        this.scene.add(this.group);

        const ambient = new THREE.AmbientLight(0xffffff, 0.9);
        this.scene.add(ambient);
        const dir = new THREE.DirectionalLight(0xffffff, 0.7);
        dir.position.set(1, 2, 3);
        this.scene.add(dir);

        this.resize();
        this.worker = new Worker(new URL('./gcode-viewer-worker.js', import.meta.url), {
            type: 'module',
        });
        this.worker.addEventListener('message', ({ data }) => this.handleWorkerMessage(data));
        this.worker.addEventListener('error', (event) => {
            console.error('[gcode-viewer] worker error:', event?.message || event);
            this.data = null;
            this.rebuildScene();
            if (this.statusElement) {
                this.statusElement.textContent = 'G-code viewer worker failed. Rebuild to try again.';
            }
        });
        this.render();
    }

    setTheme(dark) {
        this.dark = dark !== false;
        this.scene.background = new THREE.Color(this.dark ? '#0b1220' : '#f8fafc');
        this.rebuildScene();
        this.render();
    }

    resize() {
        const parent = this.canvas.parentElement;
        const rect = parent ? parent.getBoundingClientRect() : this.canvas.getBoundingClientRect();
        const w = Math.max(1, Math.round(rect.width));
        const h = Math.max(1, Math.round(rect.height));
        this.renderer.setSize(w, h, false);
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
        this.render();
    }

    resetCamera(top = false) {
        const bounds = this.data?.bounds;
        const sane = (v) => Number.isFinite(v);
        const validBounds =
            bounds &&
            [bounds.minX, bounds.minY, bounds.minZ, bounds.maxX, bounds.maxY, bounds.maxZ].every(sane);
        const cx = validBounds ? (bounds.minX + bounds.maxX) / 2 : 0;
        const cy = validBounds ? (bounds.minY + bounds.maxY) / 2 : 0;
        let size = validBounds
            ? Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY, bounds.maxZ - bounds.minZ, 10)
            : 120;
        if (!sane(size) || size <= 0) size = 120;
        if (!sane(cx) || !sane(cy)) {
            this.controls.target.set(0, 0, 0);
            this.camera.position.set(0, 136, 150);
            this.camera.lookAt(this.controls.target);
            this.controls.update();
            this.render();
            return;
        }
        const dist = size * 1.6;
        // Map machine XY onto Three.js XZ and machine Z onto Three.js Y.
        this.controls.target.set(cx, 0, -cy);
        if (top) {
            this.camera.position.set(cx, dist, -cy);
        } else {
            // Default: centered on X, standing at machine Y- and looking
            // down across the bed toward the origin from a slightly higher
            // angle so the stock reads more like a top-down CNC view.
            this.camera.position.set(cx, dist * 0.85, -cy + dist * 0.9);
        }
        this.camera.lookAt(this.controls.target);
        this.controls.update();
        this.render();
    }

    build(gcode) {
        const version = ++this.version;
        if (!gcode) {
            this.data = null;
            this.rebuildScene();
            this.render();
            if (this.statusElement) {
                this.statusElement.textContent = 'Add a toolpath to preview G-code.';
            }
            return;
        }
        // Keep the previous scene up while the worker parses so rapid edits
        // never flash an empty viewport — it swaps in on complete.
        if (this.statusElement) {
            this.statusElement.textContent = 'Parsing G-code…';
        }
        try {
            this.worker.postMessage({ type: 'build', version, gcode });
        } catch {
            if (this.statusElement) {
                this.statusElement.textContent = 'G-code could not be sent to the viewer worker.';
            }
        }
    }

    handleWorkerMessage(data) {
        if (!data || data.version !== this.version) return;
        if (data.type === 'progress') {
            if (this.statusElement) {
                const pct = Number(data.progress) || 0;
                const lines = Number(data.lineCount) || 0;
                this.statusElement.textContent =
                    `Parsing G-code… ${pct}% (${lines.toLocaleString()} lines)`;
            }
            return;
        }
        if (data.type === 'error') {
            this.data = null;
            this.rebuildScene();
            this.render();
            console.error('[gcode-viewer]', data.message || 'G-code parse failed.');
            if (this.statusElement) {
                this.statusElement.textContent = data.message || 'G-code parse failed.';
            }
            return;
        }
        if (data.type !== 'complete') return;
        void this.finishBuild(data);
    }

    async finishBuild(data) {
        const version = data.version;
        const segmentCount = Number(data.segmentCount) || 0;
        // Paint the status first: the scene rebuild + GPU upload below is
        // synchronous and can take seconds on huge files.
        if (this.statusElement) {
            this.statusElement.textContent =
                `Rendering ${segmentCount.toLocaleString()} segments…`;
        }
        await new Promise((resolve) => setTimeout(resolve, 30));
        if (version !== this.version) return;
        const t0 = performance.now();
        try {
            const rawBounds = data.bounds;
            if (
                rawBounds &&
                ![
                    rawBounds.minX,
                    rawBounds.minY,
                    rawBounds.minZ,
                    rawBounds.maxX,
                    rawBounds.maxY,
                    rawBounds.maxZ,
                ].every(Number.isFinite)
            ) {
                throw new Error('G-code contains coordinates outside the viewable range.');
            }
            this.data = {
                positions: new Float32Array(data.positions, 0, Number(data.positionsLen) || 0),
                colors: new Float32Array(data.colors, 0, Number(data.colorsLen) || 0),
                frames: new Uint32Array(data.frames, 0, Number(data.framesLen) || 0),
                bounds: data.bounds,
                lineCount: data.lineCount,
                segmentCount,
            };
            this.rebuildScene();
            this.resetCamera(false);
            if (this.statusElement) {
                if (!this.data.bounds) {
                    this.statusElement.textContent = 'No motion found in G-code.';
                } else {
                    const b = this.data.bounds;
                    this.statusElement.textContent =
                        `${this.data.lineCount.toLocaleString()} lines · ${this.data.segmentCount.toLocaleString()} segments · ` +
                        `X[${b.minX.toFixed(1)}, ${b.maxX.toFixed(1)}] Y[${b.minY.toFixed(1)}, ${b.maxY.toFixed(1)}] Z[${b.minZ.toFixed(1)}, ${b.maxZ.toFixed(1)}] · drag to orbit`;
                }
            }
            this.render();
            console.log(
                `[gcode-viewer] rendered ${segmentCount.toLocaleString()} segments in ${(performance.now() - t0).toFixed(0)}ms`,
            );
        } catch (error) {
            console.error('[gcode-viewer] scene build failed:', error);
            this.data = null;
            this.rebuildScene();
            this.render();
            if (this.statusElement) {
                this.statusElement.textContent =
                    `G-code view failed (${error?.message || error}). The file may be too large to render.`;
            }
        }
    }

    clearGroup() {
        this.group.traverse((obj) => {
            const geometry = obj.geometry;
            if (geometry) geometry.dispose();
            const material = obj.material;
            if (Array.isArray(material)) {
                material.forEach((m) => {
                    if (m.map) m.map.dispose();
                    m.dispose();
                });
            } else if (material) {
                if (material.map) material.map.dispose();
                material.dispose();
            }
        });
        this.group.clear();
    }

    rebuildScene() {
        this.clearGroup();
        const bounds = this.data?.bounds;
        const minX = bounds ? Math.min(bounds.minX, 0) : -60;
        const minY = bounds ? Math.min(bounds.minY, 0) : -60;
        const maxX = bounds ? Math.max(bounds.maxX, 0) : 60;
        const maxY = bounds ? Math.max(bounds.maxY, 0) : 60;
        const spanX = Math.max(10, maxX - minX);
        const spanY = Math.max(10, maxY - minY);
        const span = Math.max(spanX, spanY);
        const gridColor = new THREE.Color(this.dark ? '#1f3a5f' : '#718096');
        const grid = new THREE.GridHelper(span * 1.4, 28, gridColor, gridColor);
        // GridHelper is already horizontal in the XZ plane. The viewer's
        // machine coordinates use XY as the work plane and Z as up, so keep
        // the grid flat by mapping its local Z axis to world Y below.
        // GridHelper is already horizontal in Three.js's XZ plane.
        grid.position.set((minX + maxX) / 2, 0, -(minY + maxY) / 2);
        grid.material.transparent = true;
        grid.material.opacity = this.dark ? 0.5 : 0.42;
        this.group.add(grid);

        const axisLen = span * 0.12 + 10;
        const axisMargin = Math.max(2, span * 0.02);
        const axisZ = Math.max(0.5, span * 0.004);
        const mkDashedAxis = (from, to, colorHex) => {
            const geometry = new THREE.BufferGeometry().setFromPoints([from, to]);
            const material = new THREE.LineDashedMaterial({
                color: colorHex,
                dashSize: Math.max(1, span * 0.012),
                gapSize: Math.max(0.8, span * 0.008),
                linewidth: 2,
            });
            const line = new THREE.Line(geometry, material);
            line.computeLineDistances();
            return line;
        };
        const mkArrow = (tip, dir, colorHex) => {
            const height = Math.max(1.5, span * 0.018);
            const radius = height * 0.42;
            const geometry = new THREE.ConeGeometry(radius, height, 16);
            const material = new THREE.MeshBasicMaterial({ color: colorHex });
            const cone = new THREE.Mesh(geometry, material);
            cone.position.copy(tip).addScaledVector(dir, -height / 2);
            cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
            return cone;
        };
        const axes = new THREE.Group();
        const xColor = 0xdf3b3b;
        const yColor = 0x06b881;
        const xFrom = new THREE.Vector3(axisMargin, 0, axisZ);
        const xTo = new THREE.Vector3(axisMargin + axisLen, 0, axisZ);
        const yFrom = new THREE.Vector3(0, axisMargin, axisZ);
        const yTo = new THREE.Vector3(0, axisMargin + axisLen, axisZ);
        axes.add(mkDashedAxis(xFrom, xTo, xColor));
        axes.add(mkDashedAxis(yFrom, yTo, yColor));
        axes.add(mkArrow(xTo, new THREE.Vector3(1, 0, 0), xColor));
        axes.add(mkArrow(yTo, new THREE.Vector3(0, 1, 0), yColor));
        // Keep a short Z reference at the corner; X/Y carry the labels.
        axes.add(
            (() => {
                const geometry = new THREE.BufferGeometry().setFromPoints([
                    new THREE.Vector3(0, 0, 0),
                    new THREE.Vector3(0, 0, axisLen * 0.7),
                ]);
                return new THREE.Line(
                    geometry,
                    new THREE.LineBasicMaterial({ color: 0x295d8d }),
                );
            })(),
        );
        const xLabel = makeAxisLabelSprite('X', '#df3b3b');
        xLabel.position.copy(xTo).add(new THREE.Vector3(Math.max(2, span * 0.02), 0, 0));
        axes.add(xLabel);
        const yLabel = makeAxisLabelSprite('Y', '#06b881');
        yLabel.position.copy(yTo).add(new THREE.Vector3(0, Math.max(2, span * 0.02), 0));
        axes.add(yLabel);
        axes.rotation.x = -Math.PI / 2;
        this.group.add(axes);

        // Origin marker + floating "Zero here" label so users know where to zero.
        const originDot = new THREE.Mesh(
            new THREE.SphereGeometry(Math.max(0.6, span * 0.004), 20, 14),
            new THREE.MeshBasicMaterial({ color: 0xef4444 }),
        );
        originDot.position.set(0, 0, 0);
        this.group.add(originDot);
        const label = makeTextSprite('Zero here');
        label.position.set(0, Math.max(6, span * 0.07), 0);
        this.group.add(label);
        const stemGeometry = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(0, 0, 0),
            label.position.clone(),
        ]);
        this.group.add(
            new THREE.Line(
                stemGeometry,
                new THREE.LineDashedMaterial({ color: 0x3e85c7, dashSize: 2, gapSize: 1.5 }),
            ),
        );
        const stem = this.group.children[this.group.children.length - 1];
        stem.computeLineDistances();

        if (this.data && this.data.positions.length >= 6) {
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.BufferAttribute(this.data.positions, 3));
            const colors = this.data.colors.slice();
            if (!this.dark) {
                // Darken the cutting/rapid colors against the light viewer
                // background; the worker palette is tuned for dark mode.
                for (let i = 0; i < colors.length; i += 3) {
                    const rapid = colors[i + 1] > 0.8;
                    colors[i] = rapid ? 0.02 : 0.04;
                    colors[i + 1] = rapid ? 0.48 : 0.24;
                    colors[i + 2] = rapid ? 0.24 : 0.58;
                }
            }
            geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
            const material = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.95 });
            const lines = new THREE.LineSegments(geometry, material);
            // Map machine XYZ onto Three.js XZ with Y-up.
            lines.rotation.x = -Math.PI / 2;
            this.group.add(lines);
        }
    }

    render() {
        // OrbitControls.update() dispatches 'change' synchronously, and our
        // 'change' listener calls render(). Normally update() only fires when
        // the camera actually moved, but poisoned (NaN) camera state fires
        // every time — without this guard the pair recurses until the stack
        // overflows. Nested renders are redundant anyway: the outer call
        // paints after update() settles.
        if (this.rendering) return;
        this.rendering = true;
        try {
            this.controls.update();
            this.renderer.render(this.scene, this.camera);
        } finally {
            this.rendering = false;
        }
    }

    dispose() {
        try {
            this.worker?.terminate();
        } catch {
            /* ignore */
        }
        this.clearGroup();
        this.renderer.dispose();
    }
}
