describe('Drawing and snapping', () => {
    beforeEach(() => cy.freshProject());
    it('snaps rectangle corners to the grid', () => {
        cy.menu('Draw', 'Rectangle');
        cy.worldClick(31, 31);
        cy.worldClick(59, 51);
        cy.snapshot().then((p) => {
            expect(p.loops).to.have.length(1);
            expect(p.loops[0].points).to.deep.include({ x: 30, y: 30 });
            expect(p.loops[0].points).to.deep.include({ x: 60, y: 50 });
        });
    });
    it('snaps lines to endpoints, edge midpoints and guides', () => {
        cy.importDesign('vectors.svg');
        cy.menu('Draw', 'Guide');
        cy.worldClick(30, 60);
        cy.worldClick(30, 80);
        cy.snapshot().then((p) => {
            expect(p.guides).to.have.length(1);
            expect(p.guides[0].point.y).to.be.closeTo(80, 0.1);
        });
        cy.menu('Draw', 'Line');
        cy.worldClick(20.2, 40.2);
        cy.worldClick(30.2, 60.2);
        cy.worldClick(43, 79.8);
        cy.worldClick(60.2, 60.2);
        cy.snapshot().then((p) => {
            expect(p.loops).to.have.length(5);
            const lines = p.loops.slice(-2);
            expect(lines[0].points).to.deep.include({ x: 20, y: 40 });
            expect(lines[0].points).to.deep.include({ x: 30, y: 60 });
            expect(lines[1].points[0].y).to.be.closeTo(80, 0.1);
            expect(lines[1].points).to.deep.include({ x: 60, y: 60 });
        });
    });
    for (const shape of ['Circle', 'Polygon', 'Arc', 'Bezier', 'Polyline']) {
        it(`draws ${shape} as editable geometry`, () => {
            cy.menu('Draw', shape);
            cy.worldClick(10, 10);
            cy.worldClick(50, 10);
            if (['Arc', 'Bezier', 'Polyline'].includes(shape))
                cy.worldClick(30, 40);
            if (shape === 'Bezier') cy.worldClick(60, 40);
            if (shape === 'Polyline')
                cy.get('[data-testid="gcam-canvas"]').type('{enter}');
            cy.snapshot().then((p) => {
                expect(p.loops).to.have.length(1);
                expect(p.loops[0].points.length).to.be.at.least(2);
                expect(
                    p.loops[0].points.every(
                        (point) =>
                            Number.isFinite(point.x) &&
                            Number.isFinite(point.y),
                    ),
                ).to.equal(true);
            });
        });
    }
    it('places editable vector text at a snapped anchor', () => {
        cy.menu('Draw', 'Text');
        cy.worldClick(30, 30);
        cy.get('[aria-label="Text to place"]').clear().type('CAM');
        cy.get('[aria-label="Text height in mm"]').clear().type('10').blur();
        cy.contains('button', 'Add Text').click();
        cy.snapshot().then((p) => {
            expect(p.loops.length).to.be.greaterThan(0);
            expect(p.loops.some((loop) => loop.text === 'CAM')).to.equal(true);
            expect(p.selected.length).to.be.greaterThan(0);
        });
    });
});
describe('Configuration sanity', () => {
    beforeEach(() => cy.freshProject());
    it('changes units, grid and machine, persists and exports configuration', () => {
        cy.contains('button', /^Config$/).click();
        cy.contains(
            '[aria-label="Measurement units"] [role="radio"]',
            'Imperial',
        ).click();
        cy.contains('[aria-label="Grid style"] [role="radio"]', 'dots').click();
        cy.get('[aria-label="Machine profile"]').select('longmill-mk2-48x30');
        cy.get('[aria-label="Toast duration in ms"]')
            .type('{selectall}4000')
            .blur();
        cy.task('clearDownloads');
        cy.contains('button', 'Export Config').click();
        cy.readDownload('gcam-config.json').then((raw) => {
            const config = JSON.parse(raw);
            expect(config.units).to.equal('imperial');
            expect(config.grid.style).to.equal('dots');
            expect(config.machineProfileId).to.equal('longmill-mk2-48x30');
            expect(config.toastTimeout).to.equal(4000);
        });
        cy.reload();
        cy.contains('button', /^Config$/).click();
        cy.contains(
            '[aria-label="Measurement units"] [role="radio"]',
            'Imperial',
        ).should('have.attr', 'aria-checked', 'true');
        cy.contains('[aria-label="Grid style"] [role="radio"]', 'dots').should(
            'have.attr',
            'aria-checked',
            'true',
        );
        cy.get('[aria-label="Machine profile"]').should(
            'have.value',
            'longmill-mk2-48x30',
        );
    });
});
