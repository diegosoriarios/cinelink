const { FlatCompat } = require('@eslint/eslintrc');
const globals = require('globals');

const compat = new FlatCompat({
  baseDirectory: __dirname
});

module.exports = [
  {
    ignores: ['dist/**', 'node_modules/**', '.expo/**', '.abacusai/**']
  },
  {
    files: ['eslint.config.js', 'jest.config.js'],
    languageOptions: {
      globals: {
        ...globals.node
      }
    }
  },
  {
    files: ['worker/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.serviceworker
      }
    }
  },
  ...compat.extends('eslint-config-expo')
];
