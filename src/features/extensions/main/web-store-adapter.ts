import { downloadExtension } from 'electron-chrome-web-store';
import type { ExtensionPackageSourcePort } from './library-port';

export class ChromeWebStoreAdapter implements ExtensionPackageSourcePort {
  readonly providerId = 'electron-chrome-web-store@0.13.0';
  download(extensionId: string, stagingDirectory: string): Promise<string> {
    return downloadExtension(extensionId, stagingDirectory);
  }
}
