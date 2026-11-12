import {
  KIT_TOOLS_HOST,
  errorMessage,
  fetchKitTool,
  kitToolVersion,
  kitToolsDownloads,
  recordKitTool,
  t,
  type KitConfig,
  type KitToolsFetch,
  type Locale,
} from '@kotilo/kit-core';

/** Everything `kotilo kit add` touches, injected so tests run without network or disk. */
export interface AddIO {
  locale: Locale;
  /** stdin and stderr are a terminal: we can ask. */
  interactive: boolean;
  ask(question: string): Promise<string>;
  fetch: KitToolsFetch;
  /** Tests sign with their own key; the real CLI uses the one built into kit-core. */
  publicKey?: string;
  readTool(id: string): string | undefined;
  writeTool(id: string, source: string): void;
  readConfig(): KitConfig;
  writeConfig(config: KitConfig): void;
  /** Display path of `<config>/tools/<id>.ts`. */
  toolPath(id: string): string;
  out(text: string): void;
  err(text: string): void;
}

const YES = new Set(['y', 'yes', 'e', 'evet']);

/** `kotilo kit add <name> [--yes] [--force]`. Asks every time unless `--yes` approves this one call. */
export async function runAdd(name: string | undefined, flags: { yes: boolean; force: boolean }, io: AddIO): Promise<number> {
  const tr = (key: string, params?: Record<string, string | number>) => t(io.locale, key, params);
  if (!name) {
    io.err(tr('cli.usage') + '\n');
    return 2;
  }

  io.err(tr('cli.add.consent', { name, host: KIT_TOOLS_HOST, files: kitToolsDownloads(name).join(' · ') }) + '\n');
  if (!flags.yes) {
    if (!io.interactive) {
      io.err(tr('cli.add.needYes') + '\n');
      return 2;
    }
    const answer = (await io.ask(tr('cli.add.ask'))).trim().toLocaleLowerCase(io.locale === 'tr' ? 'tr-TR' : 'en');
    if (!YES.has(answer)) {
      io.err(tr('cli.add.cancelled') + '\n');
      return 1;
    }
  }

  try {
    const tool = await fetchKitTool(name, io.fetch, io.publicKey);
    const config = io.readConfig();
    const existing = io.readTool(tool.id);
    const from = existing === undefined ? undefined : kitToolVersion(config, tool.id, existing);
    if (existing !== undefined && from === undefined && !flags.force) {
      io.err(`${tr('error.kitAdd.exists', { name: tool.id })} ${tr('cli.add.forceHint')}\n`);
      return 1;
    }
    if (existing === tool.source && from === tool.version) {
      io.out(tr('cli.add.current', { name: tool.id, version: tool.version }) + '\n');
      return 0;
    }
    io.writeTool(tool.id, tool.source);
    io.writeConfig(recordKitTool(config, tool));
    const file = io.toolPath(tool.id);
    io.out(
      (from ? tr('cli.add.updated', { name: tool.id, from, version: tool.version, file }) : tr('cli.add.installed', { name: tool.id, version: tool.version, file })) + '\n',
    );
    return 0;
  } catch (e) {
    io.err(errorMessage(io.locale, e) + '\n');
    return 1;
  }
}
