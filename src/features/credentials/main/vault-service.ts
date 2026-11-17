import { randomUUID } from 'node:crypto';
import { BrowserWindow } from 'electron';
import type { CredentialCandidate, CredentialsState } from '../../../shared/contracts/credentials';
import type { CommandContext, FeatureRuntime } from '../../../shared/module-lifecycle';
import { BrowserError } from '../../../shared/errors';
import { CredentialRepository } from './credential-repository';
import { FillController } from './fill-controller';
import { SettingsRepository } from '../../settings/main/repository';
import { SubmitCapture } from './submit-capture';

type Candidate = { summary: CredentialCandidate; context: CommandContext; encryptedPassword: string; expiresAt: number; fromSubmit?: boolean };
export class VaultService {
  private readonly repository: CredentialRepository;
  private readonly settings: SettingsRepository;
  private readonly fillController: FillController;
  private readonly candidates = new Map<string, Candidate>();
  private revision = 0;
  private readonly disposeCore: () => void;
  private readonly submitCapture: SubmitCapture;
  private readonly listeners = new Set<(profileId: string) => void>();

  constructor(private readonly runtime: FeatureRuntime) {
    this.repository = new CredentialRepository(runtime.storage);
    this.settings = new SettingsRepository(runtime.storage);
    this.fillController = new FillController(runtime);
    this.submitCapture = new SubmitCapture(runtime, (context, tabId, captured) => this.accept(context, tabId, captured, true));
    this.disposeCore = runtime.core.onEvent(event => {
      if (event.type === 'navigationCommitted' || event.type === 'tabClosed') {
        const tabId = event.type === 'tabClosed' ? event.tabId : event.visit.tabId;
        for (const [id, candidate] of this.candidates) {
          if (candidate.summary.tabId === tabId && (event.type === 'tabClosed' || !candidate.fromSubmit)) this.candidates.delete(id);
        }
      }
      if (event.type === 'contextDisposed') for (const [id, candidate] of this.candidates) if (candidate.context.contextId === event.context.contextId) this.candidates.delete(id);
    });
  }
  list(context: CommandContext): CredentialsState {
    for (const [id, candidate] of this.candidates) if (candidate.expiresAt < Date.now()) this.candidates.delete(id);
    const available = this.runtime.secrets.available();
    return {
      entries: this.repository.list(context.profileId).map(({ encryptedPassword: _secret, encryptedSyncMetadata: _metadata, ...entry }) => entry),
      candidates: [...this.candidates.values()].filter(candidate => candidate.context.windowId === context.windowId).map(candidate => candidate.summary),
      available, reason: available ? undefined : '系统安全存储不可用，密码不会以明文保存', revision: this.revision,
    };
  }
  save(context: CommandContext, input: { origin: string; username: string; password: string }) {
    this.assertSave(context);
    const encrypted = this.runtime.secrets.encrypt(input.password);
    this.repository.save(context.profileId, input.origin, input.username, encrypted);
    this.publish(context);
    return this.list(context);
  }
  async capture(context: CommandContext, tabId: string) {
    this.assertSave(context);
    const captured = await this.fillController.capture(context, tabId);
    this.accept(context, tabId, captured, false);
    return this.list(context);
  }
  private accept(context: CommandContext, tabId: string, captured: { origin: string; username: string; password: string }, fromSubmit: boolean) {
    this.assertSave(context);
    const id = randomUUID();
    const existing = this.repository.list(context.profileId).find(entry => entry.origin === captured.origin && entry.username === captured.username);
    const summary = { id, tabId, origin: captured.origin, username: captured.username, existingId: existing?.id };
    for (const [existingId, candidate] of this.candidates) if (candidate.summary.tabId === tabId) this.candidates.delete(existingId);
    this.candidates.set(id, { summary, context, encryptedPassword: this.runtime.secrets.encrypt(captured.password), expiresAt: Date.now() + 120000, fromSubmit });
    this.publish(context);
  }
  confirm(context: CommandContext, candidateId: string, save: boolean) {
    const candidate = this.candidates.get(candidateId);
    if (!candidate || candidate.context.windowId !== context.windowId || candidate.expiresAt < Date.now()) throw new BrowserError('NOT_FOUND', '密码保存请求已结束');
    if (save) {
      this.assertSave(context);
      this.repository.save(context.profileId, candidate.summary.origin, candidate.summary.username, candidate.encryptedPassword);
    }
    this.candidates.delete(candidateId);
    this.publish(context);
    return this.list(context);
  }
  async fill(context: CommandContext, tabId: string, credentialId: string) {
    if (!this.settings.get(context.profileId).autofillEnabled) throw new BrowserError('FORBIDDEN', '此资料已关闭密码填写');
    const entry = this.repository.list(context.profileId).find(candidate => candidate.id === credentialId);
    if (!entry) throw new BrowserError('NOT_FOUND', '密码记录不存在');
    return this.fillController.fill(context, tabId, entry.origin, entry.username, this.runtime.secrets.decrypt(entry.encryptedPassword));
  }
  remove(context: CommandContext, id: string) {
    this.assertSave(context); this.repository.remove(context.profileId, id); this.publish(context); return this.list(context);
  }
  dispose(): void { this.disposeCore(); this.submitCapture.dispose(); this.fillController.dispose(); this.candidates.clear(); }
  subscribe(listener: (profileId: string) => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  notifyImported(profileId: string): void {
    this.revision += 1;
    for (const native of BrowserWindow.getAllWindows()) {
      const window = this.runtime.core.getWindowForSender(native.webContents.id);
      if (window?.profileId === profileId) this.runtime.publish('credentials.changed', this.list({ ...window, windowId: window.id, requestId: 'sync-import' }), { windowId: window.id });
    }
  }
  private assertSave(context: CommandContext): void {
    if (context.isPrivate) throw new BrowserError('FORBIDDEN', '私密窗口不保存或删除密码');
    if (!this.settings.get(context.profileId).savePasswords) throw new BrowserError('FORBIDDEN', '此资料已关闭密码保存');
    if (!this.runtime.secrets.available()) throw new BrowserError('UNAVAILABLE', '系统安全存储不可用');
  }
  private publish(context: CommandContext): void {
    this.revision += 1;
    for (const listener of this.listeners) listener(context.profileId);
    for (const window of this.runtime.core.getState(context.windowId).windows) {
      this.runtime.publish('credentials.changed', this.list({ ...context, windowId: window.id }), { windowId: window.id });
    }
  }
}
