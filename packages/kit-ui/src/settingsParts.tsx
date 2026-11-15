import type { ReactNode } from 'react';

export type Tr = (key: string, params?: Record<string, string | number>) => string;

/** One labelled row inside a `.kf-settings-card`: title + description on the left, control on the right. */
export function SettingRow({ title, desc, htmlFor, children }: { title: string; desc?: string; htmlFor?: string; children?: ReactNode }) {
  return (
    <div className="kf-row">
      <span className="kf-row-text">
        {htmlFor ? (
          <label className="kf-row-title" htmlFor={htmlFor}>
            {title}
          </label>
        ) : (
          <span className="kf-row-title">{title}</span>
        )}
        {desc && <span className="kf-row-desc">{desc}</span>}
      </span>
      {children}
    </div>
  );
}

/** Folder that holds config.toml, from its display path (`%APPDATA%\kotilo\kit\config.toml`). */
export function configFolder(configPath: string | undefined): string | undefined {
  return configPath?.replace(/config\.toml$/i, '');
}
