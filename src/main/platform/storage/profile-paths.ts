import { app } from 'electron';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { BrowserError } from '../../../shared/errors';

export function applicationDataPath(): string {
  const path = join(app.getPath('appData'), 'brave-browser-electron');
  mkdirSync(path, { recursive: true, mode: 0o700 });
  return path;
}

export function profilePath(profileId: string): string {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(profileId)) {
    throw new BrowserError('INVALID_ARGUMENT', '资料标识不合法');
  }
  const path = join(applicationDataPath(), 'profiles', profileId);
  mkdirSync(path, { recursive: true, mode: 0o700 });
  return path;
}

export function profileDatabasePath(profileId: string): string {
  return join(profilePath(profileId), 'browser.sqlite');
}
