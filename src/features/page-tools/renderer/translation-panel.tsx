import { useEffect, useState } from 'react';
import type { TranslationState } from '../../../shared/contracts/page-tools';
import { browserClient } from '../../../renderer/client/browser-client';
import { Modal } from '../../../renderer/components/modal';
import { ErrorNotice } from '../../../renderer/components/error-notice';

export function TranslationPanel({ tabId, open, onOpenChange }: {
  tabId: string; open: boolean; onOpenChange: (open: boolean) => void;
}) {
  const [state, setState] = useState<TranslationState | null>(null);
  const [language, setLanguage] = useState('zh-CN');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    let alive = true;
    const accept = (next: TranslationState) => {
      if (alive && next.tabId === tabId) setState((current) => !current || next.revision >= current.revision ? next : current);
    };
    const dispose = browserClient.on('pageTools.translationChanged', accept);
    browserClient.command('pageTools.translationState', { tabId }).then(accept).catch((failure) => setError(String(failure)));
    return () => { alive = false; dispose(); };
  }, [open, tabId]);
  async function run(action: () => Promise<TranslationState>) {
    setBusy(true); setError('');
    try { setState(await action()); }
    catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); }
    finally { setBusy(false); }
  }
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="翻译此页">
      <label className="form-field"><span>翻译为</span><select value={language} onChange={(event) => setLanguage(event.target.value)} disabled={busy || state?.status === 'translating'}>
        <option value="zh-CN">简体中文</option><option value="zh-TW">繁體中文</option><option value="en">English</option><option value="ja">日本語</option>
        <option value="ko">한국어</option><option value="fr">Français</option><option value="de">Deutsch</option><option value="es">Español</option>
      </select></label>
      <p className="translation-details">页面文字将发送到 Brave 官方翻译服务。翻译后可恢复原文。</p>
      {state?.status === 'translating' && <p>正在翻译…</p>}
      {state?.status === 'translated' && <p>主页面已翻译，源语言：{state.sourceLanguage}</p>}
      {Boolean(state?.excludedFrames) && <p className="translation-details">此页有 {state?.excludedFrames} 个嵌入页面尚未覆盖，不能视为整页翻译完成。</p>}
      {state?.status === 'cancelled' && <p>翻译已取消。</p>}
      {(error || state?.error) && <ErrorNotice message={error || state?.error || ''} />}
      <div className="form-actions">
        {state?.status === 'translated' && <button type="button" className="button" disabled={busy} onClick={() => void run(() => browserClient.command('pageTools.undoTranslation', { tabId }))}>恢复原文</button>}
        {state?.status === 'translating' ? <button type="button" className="button" onClick={() => void run(() => browserClient.command('pageTools.cancelTranslation', { tabId }))}>取消翻译</button> :
          <button type="button" className="button button-primary" disabled={busy} onClick={() => void run(() => browserClient.command('pageTools.translate', { tabId, targetLanguage: language }))}>翻译</button>}
      </div>
    </Modal>
  );
}
