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
    files: ['eslint.config.js', 'jest.config.js', 'vitest.config.ts'],
    languageOptions: {
      globals: {
        ...globals.node
      }
    }
  },
  {
    files: ['server/**/*.ts'],
    languageOptions: {
      globals: {
        ...globals.node
      }
    }
  },
  {
    files: ['api/**/*.ts'],
    languageOptions: {
      globals: {
        ...globals.node
      }
    }
  },
  ...compat.extends('eslint-config-expo')
];
