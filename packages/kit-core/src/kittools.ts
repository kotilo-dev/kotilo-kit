/**
 * `kit add` — install a tool from kotilo-dev/kit-tools. Pure: the shell passes a `fetch(path)` that
 * returns bytes; core never touches the network itself. Trust chain:
 *   index.json.sig  (ed25519 over the exact index.json bytes, key embedded below)
 *   → index.json    (pins every tool file by sha256 + version)
 *   → tools/<id>.ts
 * Nothing is returned (so nothing is written) unless every step checks out.
 */
import { ed25519 } from '@noble/curves/ed25519.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import type { KitConfig } from './config.js';
import { ToolError } from './errors.js';

/** Where kit-tools is published (GitHub Pages of kotilo-dev/kit-tools). */
export const KIT_TOOLS_BASE = 'https://kotilo.dev/kit-tools/';
/** Shown in the consent dialog and CLI prompt. */
export const KIT_TOOLS_HOST = 'kotilo.dev/kit-tools';
/** Raw 32-byte ed25519 public key (base64). The private key lives only in kit-tools' CI secret. */
export const KIT_TOOLS_PUBLIC_KEY = 'Zc7nSVYZbog85y+JmWsFPhphr3vo4uJi/6ZTRokuFLk=';

const ID_RE = /^[a-z][a-z0-9-]{0,63}$/;
const SEMVER_RE = /^\d+\.\d+\.\d+$/;
const SHA_RE = /^[0-9a-f]{64}$/;
/** A tool file is a single small module; anything larger is not something we'd install. */
export const KIT_TOOL_MAX_BYTES = 256 * 1024;

export interface KitToolEntry {
  id: string;
  version: string;
  file: string;
  sha256: string;
  summary: { en: string; tr: string };
}

export interface KitToolInstall {
  id: string;
  version: string;
  sha256: string;
  /** The verified tool source, ready to write to `<config>/tools/<id>.ts`. */
  source: string;
}

/** Fetches `KIT_TOOLS_BASE + path` and returns the body bytes; rejects on HTTP or network failure. */
export type KitToolsFetch = (path: string) => Promise<Uint8Array>;

export function isKitToolName(name: string): boolean {
  return ID_RE.test(name);
}

/** The files `kit add <name>` downloads, in order (for the consent text). */
export function kitToolsDownloads(name: string): string[] {
  return ['index.json', 'index.json.sig', `tools/${name || '<id>'}.ts`];
}

export function sha256Hex(data: Uint8Array | string): string {
  return bytesToHex(sha256(typeof data === 'string' ? new TextEncoder().encode(data) : data));
}

function b64(s: string): Uint8Array | null {
  const clean = s.trim();
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(clean)) return null;
  const bin = atob(clean);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/** Verify `index.json` against its signature and parse it. Throws `error.kitAdd.signature` / `.index`. */
export function verifyKitToolsIndex(index: Uint8Array, signature: Uint8Array, publicKey = KIT_TOOLS_PUBLIC_KEY): KitToolEntry[] {
  const sig = b64(new TextDecoder().decode(signature));
  const key = b64(publicKey);
  const verified = (() => {
    try {
      return Boolean(sig && key && sig.length === 64 && ed25519.verify(sig, index, key));
    } catch {
      return false;
    }
  })();
  if (!verified) throw new ToolError('error.kitAdd.signature');

  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(index));
  } catch {
    throw new ToolError('error.kitAdd.index');
  }
  const p = parsed as { schema?: unknown; tools?: unknown };
  if (p?.schema !== 1 || !Array.isArray(p.tools)) throw new ToolError('error.kitAdd.index');
  return p.tools.flatMap((t: Partial<KitToolEntry>) =>
    t &&
    typeof t.id === 'string' &&
    ID_RE.test(t.id) &&
    typeof t.version === 'string' &&
    SEMVER_RE.test(t.version) &&
    t.file === `tools/${t.id}.ts` &&
    typeof t.sha256 === 'string' &&
    SHA_RE.test(t.sha256)
      ? [{ id: t.id, version: t.version, file: t.file, sha256: t.sha256, summary: { en: String(t.summary?.en ?? ''), tr: String(t.summary?.tr ?? '') } }]
      : [],
  );
}

/** Download, verify and return a kit-tools tool. Network failures become `error.kitAdd.network`. */
export async function fetchKitTool(name: string, fetch: KitToolsFetch, publicKey = KIT_TOOLS_PUBLIC_KEY): Promise<KitToolInstall> {
  if (!isKitToolName(name)) throw new ToolError('error.kitAdd.name', { name });
  const get = async (path: string) => {
    try {
      return await fetch(path);
    } catch (e) {
      throw new ToolError('error.kitAdd.network', { detail: e instanceof Error ? e.message : String(e) });
    }
  };
  const [index, sig] = await Promise.all([get('index.json'), get('index.json.sig')]);
  const entry = verifyKitToolsIndex(index, sig, publicKey).find((t) => t.id === name);
  if (!entry) throw new ToolError('error.kitAdd.notFound', { name });

  const bytes = await get(entry.file);
  if (bytes.length > KIT_TOOL_MAX_BYTES || sha256Hex(bytes) !== entry.sha256) throw new ToolError('error.kitAdd.hash', { file: entry.file });
  let source: string;
  try {
    source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new ToolError('error.kitAdd.hash', { file: entry.file });
  }
  return { id: entry.id, version: entry.version, sha256: entry.sha256, source };
}

/** Record an install in config (`[plugins.installed.<id>]`). */
export function recordKitTool(config: KitConfig, install: Pick<KitToolInstall, 'id' | 'version' | 'sha256'>): KitConfig {
  return {
    ...config,
    plugins: {
      ...config.plugins,
      installed: { ...config.plugins.installed, [install.id]: { version: install.version, sha256: install.sha256 } },
    },
  };
}

export function forgetKitTool(config: KitConfig, id: string): KitConfig {
  if (!(id in config.plugins.installed)) return config;
  const { [id]: _gone, ...installed } = config.plugins.installed;
  return { ...config, plugins: { ...config.plugins, installed } };
}

/**
 * The version of a plugin file installed from kit-tools, or undefined when it is a local file
 * (never installed, or edited since: the badge only vouches for the exact signed bytes).
 */
export function kitToolVersion(config: KitConfig, id: string, source: string): string | undefined {
  const rec = config.plugins.installed[id];
  return rec && rec.sha256 === sha256Hex(source) ? rec.version : undefined;
}
