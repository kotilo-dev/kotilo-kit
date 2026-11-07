// Dev-only (`pnpm kit` via tsx): load `file?raw` imports as a default-exported string, like Vite does.
// kit-themes imports docs/05-themes.toml this way so the TOML stays the single source of truth.
// The bundled CLI does the same with an esbuild plugin (tsup.config.ts).
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';

registerHooks({
  resolve(specifier, context, next) {
    if (!specifier.endsWith('?raw')) return next(specifier, context);
    const { url } = next(specifier.slice(0, -4), context);
    return { url: `${url}?raw`, format: 'module', shortCircuit: true };
  },
  load(url, context, next) {
    if (!url.endsWith('?raw')) return next(url, context);
    const text = readFileSync(fileURLToPath(url.slice(0, -4)), 'utf8');
    return { format: 'module', source: `export default ${JSON.stringify(text)};`, shortCircuit: true };
  },
});
