import * as THREE from 'three';

// Canvas-backed labels avoid a browser font dependency in the WebGL viewer.
export function makeTextSprite(text) {
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
    const material = new THREE.SpriteMaterial({
        map: texture,
        depthTest: false,
        transparent: true,
    });
    const sprite = new THREE.Sprite(material);
    const scale = 0.055;
    sprite.scale.set(canvas.width * scale, canvas.height * scale, 1);
    sprite.renderOrder = 10;
    return sprite;
}

export function makeAxisLabelSprite(text, color) {
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
    const material = new THREE.SpriteMaterial({
        map: texture,
        depthTest: false,
        transparent: true,
    });
    const sprite = new THREE.Sprite(material);
    const scale = 0.055;
    sprite.scale.set(canvas.width * scale, canvas.height * scale, 1);
    sprite.renderOrder = 9;
    return sprite;
}
