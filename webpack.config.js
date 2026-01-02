// Webpack config for Expo web builds (if needed)
// Note: Expo uses Metro bundler by default, but this can be used for custom web builds

module.exports = {
  mode: 'production',
  entry: './index.js',
  output: {
    path: require('path').resolve(__dirname, 'web-build'),
    filename: 'bundle.js',
  },
  resolve: {
    extensions: ['.web.js', '.js', '.jsx', '.json'],
  },
};


