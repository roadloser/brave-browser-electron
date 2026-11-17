import type { BrowserSnapshot } from '../../../shared/contracts/browser-core';
import type { ExtensionActionSnapshot } from '../../../shared/contracts/extensions';

export interface ExtensionLibraryPort {
  readonly profileId: string;
  synchronize(state: BrowserSnapshot): void;
  activate(extensionId: string, tabId: string): Promise<boolean>;
  actionState(tabId: string): Promise<{ actions: ExtensionActionSnapshot[]; revision: number }>;
  onActionsChanged(listener: (revision: number) => void): () => void;
  dispose(): void;
}
export interface ExtensionPackageSourcePort {
  readonly providerId: string;
  download(extensionId: string, stagingDirectory: string): Promise<string>;
}
