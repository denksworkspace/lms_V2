const path = require('path');
const webpack = require('webpack');
const BundleTracker = require('webpack-bundle-tracker');

const APP_VERSION = process.env.APP_VERSION || 'v1';
const DEVSERVER_HOST = process.env.WEBPACK_DEVSERVER_HOST || 'localhost';
const DEVSERVER_PORT = Number(process.env.WEBPACK_DEVSERVER_PORT || 8090);
const BUILD_DIR = process.env.WEBPACK_ENVIRONMENT || 'devserver';
const outputPath = path.join(
  __dirname,
  `../assets/${APP_VERSION}/dist/${BUILD_DIR}`
);
const publicPath = `http://${DEVSERVER_HOST}:${DEVSERVER_PORT}/static/${APP_VERSION}/dist/${BUILD_DIR}/`;

module.exports = {
  mode: 'development',

  devtool: 'eval-cheap-module-source-map',

  output: {
    path: outputPath,
    filename: '[name].js',
    chunkFilename: '[name].js',
    publicPath,
  },

  stats: 'errors-warnings',

  infrastructureLogging: {
    level: 'warn',
  },

  devServer: {
    host: DEVSERVER_HOST,
    port: DEVSERVER_PORT,
    hot: true,
    allowedHosts: 'all',
    headers: {
      'Access-Control-Allow-Origin': '*',
    },
    client: {
      overlay: {
        errors: true,
        warnings: false,
      },
      logging: 'info',
    },
    devMiddleware: {
      publicPath,
      writeToDisk: (filePath) => /webpack-stats/.test(filePath),
    },
    static: false,
  },

  plugins: [
    new webpack.DefinePlugin({
      'process.env.NODE_ENV': JSON.stringify('development'),
    }),
    new BundleTracker({
      path: outputPath,
      filename: `webpack-stats-${APP_VERSION}.json`,
      publicPath,
    }),
  ],
};
