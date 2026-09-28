const transformViteEnvForJest = ({ types: t }) => ({
    name: 'transform-vite-env-for-jest',
    visitor: {
        MemberExpression(path) {
            const { node } = path;
            if (
                node.object.type === 'MetaProperty' &&
                node.object.meta.name === 'import' &&
                node.object.property.name === 'meta' &&
                node.property.type === 'Identifier' &&
                node.property.name === 'env'
            ) {
                path.replaceWith(
                    t.objectExpression([
                        t.objectProperty(
                            t.identifier('BASE_URL'),
                            t.stringLiteral('/'),
                        ),
                    ]),
                );
            }
        },
    },
});

module.exports = {
    presets: [
        // Jest executes its transformed files through CommonJS even though the
        // application package is ESM.  Make that boundary explicit: without
        // this, Babel preserves imports and Jest attempts to require source
        // modules as native ESM.
        ['@babel/preset-env', { targets: { node: 'current' }, modules: false }],
        ['@babel/preset-react', { runtime: 'automatic' }],
        ['@babel/preset-typescript', { allowDeclareFields: true }],
    ],
    plugins: ['transform-import-meta', transformViteEnvForJest],
};
