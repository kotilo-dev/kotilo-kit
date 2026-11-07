import { defineConfig } from 'tsup';

// One self-contained file. CJS output because several bundled deps (yaml, papaparse…) are CJS
// and call require() — an ESM bundle would need a createRequire shim. Single binary: K4.
export default defineConfig({
  entry: { kotilo: 'src/main.ts' },
  format: ['cjs'],
  outExtension: () => ({ js: '.cjs' }),
  target: 'node20',
  platform: 'node',
  clean: true,
  splitting: false,
  noExternal: [/.*/],
  banner: { js: '#!/usr/bin/env node' },
});
