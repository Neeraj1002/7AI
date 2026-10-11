// @ts-check
const eslint = require('@eslint/js');
const tseslint = require('typescript-eslint');

module.exports = tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'src/models/migrations/**', 'eslint.config.js'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parserOptions: {
        project: './tsconfig.json',
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-console': 'off',
    },
  },
  // Bugs Task 12 (R10.2): src/llm/ and src/media/ expose one public surface (index.ts); everything
  // outside those folders imports from there, never from client.ts / registry.ts directly.
  {
    files: ['src/**/*.ts'],
    ignores: ['src/llm/**', 'src/media/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '(^|/)(llm|media)/(client|registry)$',
              message: 'Import from the layer index (../llm or ../media), not client.ts / registry.ts.',
            },
          ],
        },
      ],
    },
  },
);
