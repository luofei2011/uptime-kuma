import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";
import visualizer from "rollup-plugin-visualizer";
import viteCompression from "vite-plugin-compression";

const postCssScss = require("postcss-scss");
const postcssRTLCSS = require("postcss-rtlcss");
const { normalizeBasePath, basePathWithTrailingSlash } = require("../server/base-path");

const viteCompressionFilter = /\.(js|mjs|json|css|html|svg)$/i;
const basePath = normalizeBasePath(process.env.UPTIME_KUMA_BASE_PATH);
const viteBasePath = basePathWithTrailingSlash(basePath);

// https://vitejs.dev/config/
export default defineConfig({
    base: viteBasePath,
    server: {
        port: 3000,
    },
    define: {
        FRONTEND_VERSION: JSON.stringify(process.env.npm_package_version),
        UPTIME_KUMA_BASE_PATH: JSON.stringify(basePath),
        "process.env": {},
    },
    plugins: [
        vue(),
        visualizer({
            filename: "tmp/dist-stats.html",
        }),
        viteCompression({
            algorithm: "gzip",
            filter: viteCompressionFilter,
        }),
        viteCompression({
            algorithm: "brotliCompress",
            filter: viteCompressionFilter,
        }),
    ],
    css: {
        postcss: {
            parser: postCssScss,
            map: false,
            plugins: [postcssRTLCSS],
        },
    },
    build: {
        commonjsOptions: {
            include: [/.js$/],
        },
        rollupOptions: {
            output: {
                manualChunks(id, { getModuleInfo, getModuleIds }) {},
            },
        },
    },
});
