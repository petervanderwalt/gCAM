module.exports = {
    testEnvironment: 'jsdom',
    roots: ['<rootDir>/src'],
    moduleNameMapper: {
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
