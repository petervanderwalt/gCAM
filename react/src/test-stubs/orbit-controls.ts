export class OrbitControls {
    target = {
        x: 0,
        y: 0,
        z: 0,
        set: (x: number, y: number, z: number) => {
            this.target.x = x;
            this.target.y = y;
            this.target.z = z;
        },
    };
    constructor(public camera: unknown, public domElement: unknown) {}
    addEventListener() {}
    update() {}
    dispose() {}
}
