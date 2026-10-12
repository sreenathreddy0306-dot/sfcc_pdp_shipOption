'use strict';

var path = require('path');
var ExtractTextPlugin = require('extract-text-webpack-plugin');
var sgmfScripts = require('sgmf-scripts');

var staticDir = path.resolve(__dirname, 'cartridges/int_delivery_estimate/cartridge/static');

module.exports = [{
    mode: 'production',
    name: 'js',
    entry: sgmfScripts.createJsPath(),
    output: {
        path: staticDir,
        filename: '[name].js'
    }
}, {
    mode: 'none',
    name: 'scss',
    entry: sgmfScripts.createScssPath(),
    output: {
        path: staticDir,
        filename: '[name].css'
    },
    module: {
        rules: [{
            test: /\.scss$/,
            use: ExtractTextPlugin.extract({
                use: [{
                    loader: 'css-loader',
                    options: { url: false }
                }, {
                    loader: 'postcss-loader',
                    options: { plugins: [require('autoprefixer')] }
                }, {
                    loader: 'sass-loader',
                    options: { implementation: require('sass') }
                }]
            })
        }]
    },
    plugins: [new ExtractTextPlugin({ filename: '[name].css' })]
}];
