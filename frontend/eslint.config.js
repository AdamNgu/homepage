import js from '@eslint/js';
import checkFile from 'eslint-plugin-check-file';
import importPlugin from 'eslint-plugin-import';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  react.configs.flat.recommended,
  react.configs.flat['jsx-runtime'],
  reactHooks.configs.flat.recommended,
  {
    settings: {
      react: { version: 'detect' },
      'import/resolver': { typescript: true },
    },
    plugins: {
      import: importPlugin,
      'check-file': checkFile,
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_' },
      ],
      'import/no-cycle': 'error',
      // Bulletproof React unidirectional flow: shared → features → app.
      'import/no-restricted-paths': [
        'error',
        {
          zones: [
            { target: './src/features', from: './src/app' },
            {
              target: ['./src/components', './src/lib', './src/testing'],
              from: ['./src/features', './src/app'],
            },
          ],
        },
      ],
      'check-file/filename-naming-convention': [
        'error',
        { '**/*.{ts,tsx}': 'KEBAB_CASE' },
        { ignoreMiddleExtensions: true },
      ],
      'check-file/folder-naming-convention': [
        'error',
        { 'src/**/': 'KEBAB_CASE' },
      ],
    },
  },
);
