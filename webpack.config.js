const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const CopyWebpackPlugin = require("copy-webpack-plugin");
const { CleanWebpackPlugin } = require('clean-webpack-plugin');

const isDev = process.env.NODE_ENV !== "production";

module.exports = {
    mode: isDev ? "development" : "production",

    // ─── Entry Points ───────────────────────────────────────────────────────────
    entry: {
        popup: "./src/popup.js",         // React popup
        background: "./src/background.js", // Vanilla JS background script
        content: "./src/content.js",      // Vanilla JS content script
    },

    // ─── Output ─────────────────────────────────────────────────────────────────
    output: {
        path: path.resolve(__dirname, "dist"),
        filename: "[name].js",
        clean: true, // cleans dist/ before each build
    },

    // ─── Source Maps ────────────────────────────────────────────────────────────
    devtool: isDev ? "cheap-module-source-map" : false,

    // ─── Module Rules ───────────────────────────────────────────────────────────
    module: {
        rules: [
            // React + JSX + Vanilla JS
            {
                test: /\.(js|jsx)$/,
                exclude: /node_modules/,
                use: {
                    loader: "babel-loader",
                    options: {
                        presets: [
                            "@babel/preset-env",
                            ["@babel/preset-react", { runtime: "automatic" }],
                        ],
                    },
                },
            },

            // CSS
            {
                test: /\.css$/,
                use: ["style-loader", "css-loader"],
            },

            // Images & Icons
            {
                test: /\.(png|jpg|jpeg|gif|svg)$/i,
                type: "asset/resource",
                generator: {
                    filename: "assets/[name][ext]",
                },
            },
        ],
    },

    // ─── Resolve ────────────────────────────────────────────────────────────────
    resolve: {
        extensions: [".js", ".jsx"],
        alias: {
            "@": path.resolve(__dirname, "src"), // import from '@/utils/...'
        },
    },

    // ─── Plugins ────────────────────────────────────────────────────────────────
    plugins: [
        // Popup HTML
        new HtmlWebpackPlugin({
            template: "./src/popup.html",
            filename: "popup.html",
            chunks: ["popup"],
        }),

        // Copy static files to dist/
        new CopyWebpackPlugin({
            patterns: [
                { from: 'src/manifest.json', to: '[name].[ext]' },
                { from: 'src/content.js', to: '[name].[ext]' },
                { from: 'src/background.js', to: '[name].[ext]' },
                { from: 'src/*.png', to: '[name].[ext]' }
            ],
        }),
        new CleanWebpackPlugin()
    ],

    // ─── Optimization ───────────────────────────────────────────────────────────
    optimization: {
        // Keep background and content scripts as separate files
        // Chrome extensions require this — do NOT merge them
        runtimeChunk: false,
        splitChunks: {
            chunks(chunk) {
                // Only split popup — NOT background or content scripts
                return chunk.name === "popup";
            },
            name: "vendor",
        },
    },
};