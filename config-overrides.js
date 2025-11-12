/**
 * Webpack Config Overrides for Create React App
 *
 * Adds Node.js polyfills required by axios and other packages
 * in browser environment.
 */

const webpack = require('webpack');

module.exports = function override(config) {
  // Add aliases for process/browser with explicit .js extension
  config.resolve.alias = {
    ...config.resolve.alias,
    'process/browser': require.resolve('process/browser.js'),
  };

  // Add fallbacks for Node.js core modules
  config.resolve.fallback = {
    ...config.resolve.fallback,
    crypto: require.resolve('crypto-browserify'),
    stream: require.resolve('stream-browserify'),
    buffer: require.resolve('buffer'),
    util: require.resolve('util/'),
    process: require.resolve('process/browser.js'),
    vm: false,
    fs: false,
    path: false,
  };

  // Provide global Buffer and process
  config.plugins = [
    ...config.plugins,
    new webpack.ProvidePlugin({
      Buffer: ['buffer', 'Buffer'],
      process: 'process/browser.js',
    }),
  ];

  return config;
};
