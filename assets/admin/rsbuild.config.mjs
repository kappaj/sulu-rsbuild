import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {defineConfig} from '@rsbuild/core';
import {pluginBabel} from '@rsbuild/plugin-babel';

const adminPath = path.dirname(fileURLToPath(import.meta.url));
const projectPath = path.resolve(adminPath, '../..');
const composerConfig = JSON.parse(fs.readFileSync(path.join(projectPath, 'composer.json'), 'utf8'));
const publicDir = composerConfig.extra?.['public-dir'] || 'public';
const lockPath = path.join(projectPath, 'composer.lock');
const composerLock = fs.existsSync(lockPath) ? JSON.parse(fs.readFileSync(lockPath, 'utf8')) : {};
const suluVersion = composerLock.packages?.find((dependency) => dependency.name === 'sulu/sulu')?.version || '_._._';

export default defineConfig({
    plugins: [
        pluginBabel({
            // Sulu uses Flow and legacy decorators, which need Babel before SWC.
            babelLoaderOptions: (options) => ({
                ...options,
                presets: [],
                plugins: [],
                configFile: path.join(adminPath, 'babel.config.json'),
            }),
        }),
    ],
    source: {
        entry: {main: path.join(adminPath, 'index.js')},
        include: [/node_modules[/\\](sulu-.*-bundle|@ckeditor|array-move|lodash-es|vanilla-colorful)[/\\]/],
        exclude: [/friendsofsymfony[/\\]jsrouting-bundle/],
        define: {SULU_ADMIN_BUILD_VERSION: JSON.stringify(suluVersion)},
    },
    resolve: {
        alias: {
            'fos-jsrouting': path.join(projectPath, 'vendor/friendsofsymfony/jsrouting-bundle/Resources/public/js'),
        },
    },
    dev: {
        assetPrefix: '/build/admin/',
    },
    output: {
        distPath: {root: path.join(projectPath, publicDir, 'build/admin'), js: '', css: ''},
        assetPrefix: '/build/admin/',
        cleanDistPath: true,
        polyfill: 'off', // The existing Babel configuration injects core-js polyfills.
        sourceMap: {js: 'source-map', css: true},
        cssModules: {
            auto: /\.scss$/,
            localIdentName: '[local]--[hash:base64:10]',
            exportLocalsConvention: 'camelCase',
        },
        manifest: {
            // Symfony's sulu_admin asset package expects a flat filename-to-URL map.
            generate: ({files}) => Object.fromEntries(files.map((file) => [file.name, file.path])),
        },
    },
    // Sulu's Twig template loads only main.js and main.css.
    splitChunks: false,
    tools: {
        htmlPlugin: false,
        bundlerChain: (chain, {CHAIN_ID}) => {
            // Sulu's .scss files use PostCSS syntax, not Sass.
            chain.module.rule(CHAIN_ID.RULE.CSS).test(/\.(css|scss)$/);
            // CKEditor imports SVG icons as markup; CSS font URLs remain assets.
            chain.module.rule(CHAIN_ID.RULE.SVG)
                .oneOf('sulu-svg-source').before(CHAIN_ID.ONE_OF.SVG_ASSET)
                .issuer(/\.js$/).type('asset/source');
        },
        rspack: (config) => {
            config.resolve.symlinks = false;
            config.resolveLoader = {...config.resolveLoader, symlinks: false};
            config.snapshot = {...config.snapshot, managedPaths: []};
        },
    },
});
