import { KIT_TOOLS_HOST, errorMessage, isKitToolName, kitToolsDownloads, type Locale } from '@kotilo/kit-core';
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';

export interface KitAddDialogProps {
  locale: Locale;
  tr: (key: string, params?: Record<string, string | number>) => string;
  monoFamily: string;
  /** Runs only after "Connect and install": download, verify, write. Rejects with a ToolError. */
  install(name: string): Promise<{ id: string; version: string; from?: string }>;
  onDone(message: string): void;
  onCancel(): void;
}

/**
 * docs/02-design.md › 1.1 › kit add onayı (mockup KitAddConsent.dc.html). Shown before every
 * install — there is no "don't ask again". Nothing goes over the network until the user confirms.
 */
export function KitAddDialog({ locale, tr, monoFamily, install, onDone, onCancel }: KitAddDialogProps) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const id = name.trim();
  const valid = isKitToolName(id);

  useEffect(() => inputRef.current?.focus(), []);

  const confirm = async () => {
    if (!valid || busy) return;
    setBusy(true);
    setError('');
    try {
      const r = await install(id);
      onDone(r.from ? tr('kitAdd.updated', { name: r.id, version: r.version }) : tr('kitAdd.installed', { name: r.id, version: r.version }));
    } catch (e) {
      setError(errorMessage(locale, e));
      setBusy(false);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape' && !busy) {
      e.preventDefault();
      e.stopPropagation();
      onCancel();
    } else if (e.key === 'Enter' && e.target === inputRef.current) {
      e.preventDefault();
      void confirm();
    }
  };

  return (
    <div className="kf-modal-backdrop" onKeyDown={onKeyDown}>
      <div className="kf-modal" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="kf-modal-head">
          <h2 id={titleId}>{tr('kitAdd.title')}</h2>
          <p>{tr('kitAdd.subtitle')}</p>
        </div>
        <div className="kf-modal-body">
          <label className="kf-modal-field">
            {tr('kitAdd.name')}
            <input
              ref={inputRef}
              value={name}
              spellCheck={false}
              autoComplete="off"
              disabled={busy}
              style={{ fontFamily: monoFamily }}
              aria-invalid={Boolean(error) || (id !== '' && !valid)}
              onChange={(e) => {
                setName(e.target.value.toLowerCase());
                setError('');
              }}
            />
          </label>
          <dl className="kf-consent">
            <dt>{tr('kitAdd.connect')}</dt>
            <dd style={{ fontFamily: monoFamily }}>{KIT_TOOLS_HOST}</dd>
            <dt>{tr('kitAdd.download')}</dt>
            <dd style={{ fontFamily: monoFamily }}>{kitToolsDownloads(valid ? id : '').join(' · ')}</dd>
            <dt>{tr('kitAdd.sent')}</dt>
            <dd>{tr('kitAdd.sentValue')}</dd>
            <dt>{tr('kitAdd.verify')}</dt>
            <dd>{tr('kitAdd.verifyValue')}</dd>
          </dl>
          {error && (
            <p className="kf-modal-error" role="alert">
              {error}
            </p>
          )}
        </div>
        <div className="kf-modal-foot">
          <span className="kf-modal-hint" style={{ fontFamily: monoFamily }}>
            {tr('kitAdd.esc')}
          </span>
          <span className="kf-spacer" />
          <button className="kf-btn" onClick={onCancel} disabled={busy}>
            {tr('kitAdd.cancel')}
          </button>
          <button className="kf-btn kf-btn-primary" onClick={() => void confirm()} disabled={!valid || busy}>
            {busy ? tr('kitAdd.busy') : tr('kitAdd.confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}
