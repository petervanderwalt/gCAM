const { defineConfig } = require('cypress');
const fs = require('node:fs');
const path = require('node:path');

module.exports = defineConfig({
    viewportWidth: 1440,
    viewportHeight: 1000,
    defaultCommandTimeout: 15000,
    video: false,
    allowCypressEnv: false,
    e2e: {
        baseUrl: 'http://127.0.0.1:5180',
        specPattern: 'cypress/e2e/**/*.cy.js',
        setupNodeEvents(on, config) {
            const folder = path.resolve(config.downloadsFolder);
            on('task', {
                clearDownloads() {
                    fs.mkdirSync(folder, { recursive: true });
                    for (const name of fs.readdirSync(folder)) {
                        fs.unlinkSync(path.join(folder, name));
                    }
                    return null;
                },
                download(extension) {
                    const name = fs
                        .readdirSync(folder)
                        .find((n) => n.endsWith(extension));
                    return name
                        ? fs.readFileSync(path.join(folder, name), 'utf8')
                        : null;
                },
            });
        },
    },
});
