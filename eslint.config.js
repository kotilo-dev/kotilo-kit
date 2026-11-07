import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/** Core and tools run in browser, Node and Workers: no network, DOM, fs or process. */
const NETWORK_AND_HOST_GLOBALS = [
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
  'EventSource',
  'navigator',
  'document',
  'window',
  'localStorage',
  'sessionStorage',
  'indexedDB',
  'process',
  'require',
].map((name) => ({ name, message: 'Kotilo Kit core/tools are offline and host-agnostic (see CLAUDE.md).' }));

const BANNED_IMPORTS = {
  patterns: [
    { group: ['node:*', 'fs', 'path', 'http', 'https', 'net', 'dgram', 'dns', 'child_process', 'os'], message: 'No Node/host APIs in core or tools.' },
    { group: ['axios', 'node-fetch', 'undici', 'ky', 'got'], message: 'No network clients in core or tools.' },
  ],
};

export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/dist/**', 'docs/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['packages/kit-core/src/**/*.ts', 'packages/kit-tools/src/**/*.ts'],
    rules: {
      'no-restricted-globals': ['error', ...NETWORK_AND_HOST_GLOBALS],
      'no-restricted-imports': ['error', BANNED_IMPORTS],
    },
  },
  {
    // tools additionally get clock and randomness only through ctx
    files: ['packages/kit-tools/src/**/*.ts'],
    rules: {
      'no-restricted-globals': ['error', ...NETWORK_AND_HOST_GLOBALS, { name: 'crypto', message: 'Use ctx.random.' }],
      'no-restricted-syntax': [
        'error',
        { selector: "NewExpression[callee.name='Date'][arguments.length=0]", message: 'Use ctx.now.' },
        { selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']", message: 'Use ctx.now.' },
        { selector: "CallExpression[callee.object.name='Math'][callee.property.name='random']", message: 'Use ctx.random.' },
      ],
    },
  },
  {
    files: ['**/test/**/*.ts', 'apps/**/*.ts', '*.config.*'],
    languageOptions: { globals: { process: 'readonly', Buffer: 'readonly' } },
  },
);
