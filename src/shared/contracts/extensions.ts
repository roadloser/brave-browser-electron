import { z } from 'zod';
import { idSchema } from './browser-core';

export type ExtensionRecord = {
  id: string; name: string; version: string; description: string;
  enabled: boolean; path: string; permissions: string[]; hostPermissions: string[];
  status: 'loaded' | 'disabled' | 'failed'; error?: string; hasAction: boolean;
};
export type ExtensionInstallProposal = {
  id: string; name: string; version: string; description: string;
  permissions: string[]; hostPermissions: string[]; replacesId?: string;
};
export type ExtensionsState = {
  extensions: ExtensionRecord[]; revision: number;
  networkInterception: 'unavailable-native-shields';
  privateExtensions: 'unsupported';
};
export type ExtensionActionSnapshot = { id: string; title: string; badgeText: string; badgeColor: string; hasPopup: boolean };
export type ExtensionActionsState = { tabId: string; actions: ExtensionActionSnapshot[]; revision: number };
export const extensionsCommandSchemas = {
  'extensions.get': z.object({}),
  'extensions.chooseDirectory': z.object({}),
  'extensions.proposeStoreInstall': z.object({ extensionId: z.string().regex(/^[a-p]{32}$/) }),
  'extensions.proposeUpdate': z.object({ id: idSchema }),
  'extensions.confirmInstall': z.object({ proposalId: idSchema, approve: z.boolean() }),
  'extensions.cancelPending': z.object({}),
  'extensions.setEnabled': z.object({ id: idSchema, enabled: z.boolean() }),
  'extensions.remove': z.object({ id: idSchema, clearData: z.boolean().default(false) }),
  'extensions.reload': z.object({ id: idSchema }),
  'extensions.openAction': z.object({ id: idSchema, tabId: idSchema }),
  'extensions.closeAction': z.object({}),
  'extensions.actions': z.object({ tabId: idSchema }),
};
export interface ExtensionsCommandResults {
  'extensions.get': ExtensionsState;
  'extensions.chooseDirectory': ExtensionInstallProposal | null;
  'extensions.proposeStoreInstall': ExtensionInstallProposal;
  'extensions.proposeUpdate': ExtensionInstallProposal;
  'extensions.confirmInstall': ExtensionsState;
  'extensions.cancelPending': ExtensionsState;
  'extensions.setEnabled': ExtensionsState;
  'extensions.remove': ExtensionsState;
  'extensions.reload': ExtensionsState;
  'extensions.openAction': { opened: boolean };
  'extensions.closeAction': void;
  'extensions.actions': ExtensionActionsState;
}
