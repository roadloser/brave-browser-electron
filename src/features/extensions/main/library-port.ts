import type { BrowserSnapshot } from '../../../shared/contracts/browser-core';

export interface ExtensionLibraryPort {
  readonly profileId: string;
  synchronize(state: BrowserSnapshot): void;
  activate(extensionId: string, tabId: string): Promise<boolean>;
  dispose(): void;
}
export interface ExtensionPackageSourcePort {
  readonly providerId: string;
  download(extensionId: string, stagingDirectory: string): Promise<string>;
}
