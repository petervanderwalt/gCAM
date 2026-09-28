module.exports = {
    testEnvironment: 'jsdom',
    extensionsToTreatAsEsm: ['.ts', '.tsx'],
    roots: ['<rootDir>/src'],
    moduleNameMapper: {
        '^(\\.{1,2}/.*)\\.js$': '$1',
        '^three/examples/jsm/controls/OrbitControls\.js$':
            '<rootDir>/src/test-stubs/orbit-controls.ts',
        '^.+\.(svg|png|jpe?g|webp|bmp|gif)$':
            '<rootDir>/src/test-stubs/file.ts',
    },
    setupFilesAfterEnv: ['<rootDir>/jest.setup.cjs'],
    transform: {
        '^.+\\.[jt]sx?$': ['babel-jest', { configFile: './babel.config.cjs' }],
    },
    transformIgnorePatterns: ['/node_modules/'],
    testMatch: ['**/*.test.[jt]s?(x)'],
};
