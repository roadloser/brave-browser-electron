export type RequestScopeDiagnostic = {
  missingPolicy: number; missingSource: number; referrerFallback: number; lastIssue?: string;
};

export class RequestScopeDiagnostics {
  private readonly records = new Map<string, RequestScopeDiagnostic>();
  record(tabId: string | undefined, issue: 'missing-policy' | 'missing-source' | 'referrer-fallback'): void {
    if (!tabId) return;
    const record = this.records.get(tabId) ?? { missingPolicy: 0, missingSource: 0, referrerFallback: 0 };
    if (issue === 'missing-policy') record.missingPolicy++;
    if (issue === 'missing-source') record.missingSource++;
    if (issue === 'referrer-fallback') record.referrerFallback++;
    record.lastIssue = issue === 'referrer-fallback' ? '部分请求只能根据referrer映射来源，真实initiator未完整暴露'
      : issue === 'missing-policy' ? '部分请求缺少可归属顶层站点，未伪造页面策略' : '部分请求缺少真实发起来源，未用顶层URL代替';
    this.records.set(tabId, record);
  }
  get(tabId: string): RequestScopeDiagnostic { return { ...(this.records.get(tabId) ?? { missingPolicy: 0, missingSource: 0, referrerFallback: 0 }) }; }
  remove(tabId: string): void { this.records.delete(tabId); }
  clear(): void { this.records.clear(); }
}
