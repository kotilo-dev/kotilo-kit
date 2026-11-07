/**
 * A user-facing, localizable tool error. `code` is an i18n key (`error.<tool>.<reason>`),
 * `params` fill its `{placeholders}`. Shells show it as the red first line of the output panel.
 */
export class ToolError extends Error {
  readonly code: string;
  readonly params: Record<string, string | number>;

  constructor(code: string, params: Record<string, string | number> = {}) {
    super(code);
    this.name = 'ToolError';
    this.code = code;
    this.params = params;
  }
}

export function fail(code: string, params?: Record<string, string | number>): never {
  throw new ToolError(code, params);
}

export function isToolError(e: unknown): e is ToolError {
  return e instanceof ToolError;
}
