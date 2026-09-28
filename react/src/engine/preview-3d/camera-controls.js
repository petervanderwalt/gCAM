/**
 * Purpose: Implementation module for camera-controls in the engine domain.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { clamp } from './math.js';

export function createPreviewCamera(canvas, render) {
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100000);
    const controls = new OrbitControls(camera, canvas);
    // Rendering is an affine canvas projection, not a Three scene. Retain wheel
    // zoom from OrbitControls and own the matching pan/orbit mapping below.
    controls.enableRotate = false;
    controls.enablePan = false;
    controls.addEventListener('change', render);
    return { camera, controls, homeDistance: 1 };
}

export function setPreviewCameraHome(viewer, top = false) {
    const bounds = viewer.data?.bounds;
    const width = bounds ? bounds.maxX - bounds.minX : 100;
    const height = bounds ? bounds.maxY - bounds.minY : 100;
    const thickness =
        viewer.data?.stockThickness || Math.max(width, height) * 0.1;
    const targetX = bounds ? bounds.minX + width / 2 : 0;
    const targetZ = bounds ? bounds.minY + height / 2 : 0;
    const distance = Math.max(20, (width + height + thickness) * 0.92);
    const yaw = top ? 0 : 0.7;
    const pitch = top ? 0.02 : 0.72;
    const sinPitch = Math.sin(pitch);
    viewer.controls.target.set(targetX, 0, targetZ);
    viewer.camera.position.set(
        targetX + distance * sinPitch * Math.sin(yaw),
        distance * Math.cos(pitch),
        targetZ + distance * sinPitch * Math.cos(yaw),
    );
    viewer.cameraHomeDistance = distance;
    viewer.camera.lookAt(viewer.controls.target);
    viewer.controls.update();
}

export function previewOrbitView(viewer) {
    const offset = viewer.camera.position.clone().sub(viewer.controls.target);
    const distance = Math.max(offset.length(), 0.001);
    return {
        yaw: Math.atan2(offset.x, offset.z),
        pitch: Math.acos(clamp(offset.y / distance, -1, 1)),
        scale: viewer.cameraHomeDistance / distance,
        targetX: viewer.controls.target.x,
        targetY: viewer.controls.target.z,
    };
}

export function rotatePreviewCamera(viewer, dx, dy) {
    const offset = viewer.camera.position.clone().sub(viewer.controls.target);
    const spherical = new THREE.Spherical().setFromVector3(offset);
    spherical.theta -= dx * 0.0025;
    spherical.phi = clamp(spherical.phi + dy * 0.0025, 0.08, Math.PI - 0.08);
    offset.setFromSpherical(spherical);
    viewer.camera.position.copy(viewer.controls.target).add(offset);
    viewer.camera.lookAt(viewer.controls.target);
    viewer.render();
}

export function panPreviewCamera(viewer, dx, dy) {
    const rect = viewer.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const view = previewOrbitView(viewer);
    const bounds = viewer.data?.bounds;
    const width = bounds ? bounds.maxX - bounds.minX : 100;
    const height = bounds ? bounds.maxY - bounds.minY : 100;
    const thickness =
        viewer.data?.stockThickness || Math.max(width, height) * 0.1;
    const scale =
        Math.min(
            rect.width / (width + height),
            rect.height / ((width + height) * 0.62 + thickness * 1.25),
        ) * view.scale;
    const targetDeltaX =
        (-Math.cos(view.yaw) * dx - Math.sin(view.yaw) * dy) / scale;
    const targetDeltaZ =
        (-Math.sin(view.yaw) * dx +
            (Math.cos(view.yaw) * dy) / Math.max(0.08, Math.cos(view.pitch))) /
        scale;
    viewer.controls.target.x += targetDeltaX;
    viewer.controls.target.z += targetDeltaZ;
    viewer.camera.position.x += targetDeltaX;
    viewer.camera.position.z += targetDeltaZ;
    viewer.camera.lookAt(viewer.controls.target);
    viewer.render();
}

export function installPreviewPointerControls(viewer) {
    const { canvas } = viewer;
    canvas.addEventListener('contextmenu', (event) => event.preventDefault());
    canvas.addEventListener('pointerdown', (event) => {
        if (event.button !== 0 && event.button !== 2) return;
        viewer.drag = {
            button: event.button,
            pointerId: event.pointerId,
            x: event.clientX,
            y: event.clientY,
        };
        canvas.setPointerCapture?.(event.pointerId);
        event.preventDefault();
    });
    canvas.addEventListener('pointermove', (event) => {
        if (!viewer.drag || event.pointerId !== viewer.drag.pointerId) return;
        const dx = event.clientX - viewer.drag.x;
        const dy = event.clientY - viewer.drag.y;
        viewer.drag.x = event.clientX;
        viewer.drag.y = event.clientY;
        if (viewer.drag.button === 0) rotatePreviewCamera(viewer, dx, dy);
        else panPreviewCamera(viewer, dx, dy);
        event.preventDefault();
    });
    const endDrag = (event) => {
        if (!viewer.drag || event.pointerId !== viewer.drag.pointerId) return;
        canvas.releasePointerCapture?.(event.pointerId);
        viewer.drag = null;
    };
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);
}
