import { createHash } from 'node:crypto';
import type { ShieldRuleState } from '../../../shared/contracts/shields';
import { BrowserError } from '../../../shared/errors';
import type { FilterEngine } from './filter-engine';
import type { RuleBundle, RuleText } from './engine-port';
import { SiteRulesRepository } from './site-rules-repository';
import { resourceSource, ruleSources } from './rule-sources';

function hash(value: string): string { return createHash('sha256').update(value).digest('hex'); }

export class RuleUpdater {
  private controller: AbortController | null = null;
  private error?: string;
  private status: ShieldRuleState['status'] = 'idle';
  constructor(private readonly repository: SiteRulesRepository, private readonly engine: FilterEngine, private readonly notify: () => void) {}

  restore(): void {
    const current = this.repository.versions().current;
    if (!current) return;
    const saved = this.repository.bundle(current);
    if (!saved) { this.status = 'failed'; this.error = '当前规则记录不存在，请更新或回滚'; return; }
    try { this.engine.activate(this.engine.prepare(saved.bundle, saved.cache)); this.status = 'ready'; }
    catch { this.status = 'failed'; this.error = '规则缓存与当前引擎不兼容，请更新或回滚'; }
  }

  state(): ShieldRuleState {
    const versions = this.repository.versions();
    return {
      version: versions.current, previousVersion: versions.previous,
      updatedAt: versions.current ? this.repository.bundle(versions.current)?.bundle.createdAt ?? null : null,
      status: this.status, error: this.error, revision: versions.revision,
    };
  }

  async update(): Promise<ShieldRuleState> {
    if (this.controller) throw new BrowserError('CONFLICT', '规则正在更新');
    const controller = new AbortController();
    this.controller = controller;
    this.status = 'updating'; this.error = undefined; this.notify();
    const timer = setTimeout(() => controller.abort(), 45_000);
    try {
      const lists: RuleText[] = [];
      for (const source of ruleSources) lists.push(await this.fetch(source, controller.signal));
      const resources = await this.fetch(resourceSource, controller.signal);
      const version = hash([...lists.map(list => list.sha256), resources.sha256].join(':'));
      const bundle: RuleBundle = { version, createdAt: Date.now(), lists, resources };
      const candidate = this.engine.prepare(bundle);
      try {
        if (controller.signal.aborted) throw new BrowserError('CANCELLED', '规则更新已取消，上一版本继续生效');
        this.repository.commit(bundle, candidate.serialize(version));
        this.engine.activate(candidate);
      } catch (error) { candidate.dispose(); throw error; }
      this.status = 'ready';
    } catch (error) {
      this.status = 'failed';
      this.error = controller.signal.aborted ? '规则更新超时或已取消，保留上一版本' : '规则下载、解析或保存失败，保留上一版本';
      throw error instanceof BrowserError ? error : new BrowserError('UNAVAILABLE', this.error);
    } finally { clearTimeout(timer); this.controller = null; this.notify(); }
    return this.state();
  }

  rollback(): ShieldRuleState {
    if (this.controller) throw new BrowserError('CONFLICT', '请等待规则更新结束');
    const previous = this.repository.versions().previous;
    const saved = previous ? this.repository.bundle(previous) : undefined;
    if (!previous || !saved) throw new BrowserError('NOT_FOUND', '没有可回滚的规则版本');
    const candidate = this.engine.prepare(saved.bundle, saved.cache);
    try { this.repository.switchVersion(previous); this.engine.activate(candidate); }
    catch (error) { candidate.dispose(); throw error; }
    this.status = 'ready'; this.error = undefined; this.notify();
    return this.state();
  }

  dispose(): void { this.controller?.abort(); }

  private async fetch(source: { id: string; url: string }, signal: AbortSignal): Promise<RuleText> {
    const response = await fetch(source.url, { signal, redirect: 'error', headers: { Accept: 'text/plain, application/json' } });
    if (!response.ok || !response.body) throw new BrowserError('UNAVAILABLE', `规则源 ${source.id} 返回 ${response.status}`);
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      size += result.value.byteLength;
      if (size > 16 * 1024 * 1024) { await reader.cancel(); throw new BrowserError('UNAVAILABLE', '规则文件超过大小上限'); }
      chunks.push(result.value);
    }
    const text = Buffer.concat(chunks).toString('utf8');
    if (!text.trim() || /^\s*</.test(text)) throw new BrowserError('UNAVAILABLE', '规则源返回空文件或网页错误');
    if (source.id === resourceSource.id) JSON.parse(text);
    else if (text.split('\n').filter(line => line.trim() && !line.startsWith('!') && !line.startsWith('[')).length < 10) {
      throw new BrowserError('UNAVAILABLE', '规则文件缺少有效规则');
    }
    return { ...source, text, sha256: hash(text) };
  }
}
