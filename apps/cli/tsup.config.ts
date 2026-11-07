import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
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
  // `import x from 'file?raw'` (kit-themes → docs/05-themes.toml) inlined as a string, like Vite
  esbuildPlugins: [
    {
      name: 'raw',
      setup(build) {
        build.onResolve({ filter: /\?raw$/ }, (args) => ({
          path: resolve(dirname(args.importer), args.path.slice(0, -4)),
          namespace: 'raw',
        }));
        build.onLoad({ filter: /.*/, namespace: 'raw' }, (args) => ({
          contents: readFileSync(args.path, 'utf8'),
          loader: 'text',
        }));
      },
    },
  ],
});
