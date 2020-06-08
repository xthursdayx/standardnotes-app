const path = require('path');
const webpack = require('webpack');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');
const CopyPlugin = require('copy-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = {
  entry: './app/assets/javascripts/index.js',
  output: {
    filename: './javascripts/app.[contenthash].js'
  },
  devServer: {
    proxy: {
      '/extensions': {
        target: 'http://localhost:3000',
        pathRewrite: { '^/extensions': '/public/extensions' }
      }
    },
    port: 3000
  },
  plugins: [
    new CleanWebpackPlugin(),
    new webpack.DefinePlugin({
      __VERSION__: JSON.stringify(require('./package.json').version)
    }),
    new MiniCssExtractPlugin({
      // Options similar to the same options in webpackOptions.output
      filename: './stylesheets/app.[contenthash].css',
      ignoreOrder: false // Enable to remove warnings about conflicting order
    }),
    new CopyPlugin({
      patterns: [
        { from: 'public/favicon', to: 'favicon' },
        { from: 'public/robots.txt', to: 'robots.txt' },
        { from: 'public/404.html', to: '404.html' },
        { from: 'public/422.html', to: '422.html' },
        { from: 'public/500.html', to: '500.html' }
      ],
    }),
    new HtmlWebpackPlugin({
      template: './public/index.ejs',
      inject: 'head',
      SF_DEFAULT_SERVER: process.env.SF_DEFAULT_SERVER || 'https://sync.standardnotes.org',
      EXTENSIONS_MANAGER_LOCATION: process.env.EXTENSIONS_MANAGER_LOCATION || 'public/extensions/extensions-manager/dist/index.html',
      BATCH_MANAGER_LOCATION: process.env.BATCH_MANAGER_LOCATION || 'public/extensions/batch-manager/dist/index.min.html'
    }),
  ],
  devtool: 'source-map',
  resolve: {
    alias: {
      '%': path.resolve(__dirname, 'app/assets/templates'),
      '@': path.resolve(__dirname, 'app/assets/javascripts'),
      '@Controllers': path.resolve(__dirname, 'app/assets/javascripts/controllers')
    }
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader'
        }
      },
      {
        test: /\.s?css$/,
        use: [
          {
            loader: MiniCssExtractPlugin.loader,
            options: {
              publicPath: '../', // The base assets directory in relation to the stylesheets
              hmr: process.env.NODE_ENV === 'development'
            }
          },
          'css-loader',
          'sass-loader'
        ]
      },
      {
        test: /\.(woff(2)?|ttf|eot|svg)(\?v=\d+\.\d+\.\d+)?$/,
        use: [
          {
            loader: 'file-loader',
            options: {
              name: '[name].[ext]',
              outputPath: 'fonts/'
            }
          }
        ]
      },
      {
        test: /\.html$/,
        use: [
          {
            loader: 'ng-cache-loader',
            options: {
              prefix: 'templates:**'
            }
          }
        ]
      },
      {
        test: /\.pug$/,
        use: [
          {
            loader: 'apply-loader'
          },
          {
            loader: 'pug-loader'
          }
        ]
      }
    ]
  }
};
