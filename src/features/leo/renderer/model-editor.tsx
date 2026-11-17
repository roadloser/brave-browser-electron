import { useEffect, useState } from 'react';
import type { ModelConfiguration, LeoState } from '../../../shared/contracts/leo';
import { browserClient } from '../../../renderer/client/browser-client';
import { Modal } from '../../../renderer/components/modal';
import { ErrorNotice } from '../../../renderer/components/error-notice';

export function ModelEditor({ model, open, onOpenChange, onSaved }: {
  model: ModelConfiguration | null; open: boolean; onOpenChange: (open: boolean) => void; onSaved: (state: LeoState) => void;
}) {
  const [name, setName] = useState('');
  const [endpoint, setEndpoint] = useState('');
  const [modelName, setModelName] = useState('');
  const [provider, setProvider] = useState<'custom' | 'brave'>('custom');
  const [apiKey, setApiKey] = useState('');
  const [stream, setStream] = useState(true);
  const [contextWindow, setContextWindow] = useState(32768);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) { setApiKey(''); return; }
    setName(model?.name ?? ''); setEndpoint(model?.endpoint ?? '');
    setModelName(model?.model ?? ''); setProvider(model?.provider ?? 'custom');
    setStream(model?.stream ?? true); setContextWindow(model?.contextWindow ?? 32768);
    setApiKey(''); setError('');
  }, [model, open]);
  async function save() {
    setBusy(true); setError('');
    try {
      const state = await browserClient.command('leo.saveModel', {
        id: model?.id ?? crypto.randomUUID(), name, endpoint, model: modelName, provider, stream, contextWindow,
        supportsTools: model?.supportsTools ?? false, supportsVision: model?.supportsVision ?? false,
        ...(apiKey ? { apiKey } : {}),
      });
      setApiKey(''); onSaved(state); onOpenChange(false);
    } catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); }
    finally { setBusy(false); }
  }
  return (
    <Modal open={open} onOpenChange={onOpenChange} title={model ? '编辑模型' : '添加模型'}>
      <form onSubmit={(event) => { event.preventDefault(); void save(); }}>
        <label className="form-field"><span>模型类型</span><select value={provider} onChange={(event) => setProvider(event.target.value as 'custom' | 'brave')}><option value="custom">自定义模型</option><option value="brave">官方 Leo</option></select></label>
        <label className="form-field"><span>显示名称</span><input required value={name} maxLength={128} onChange={(event) => setName(event.target.value)} /></label>
        <label className="form-field"><span>会话接口地址</span><input required type="url" value={endpoint} onChange={(event) => setEndpoint(event.target.value)} placeholder="https://…/v1/chat/completions" /></label>
        <label className="form-field"><span>模型名称</span><input required value={modelName} onChange={(event) => setModelName(event.target.value)} /></label>
        {provider === 'custom' ? <label className="form-field"><span>API 密钥{model?.hasKey ? '（已保存，留空保持）' : '（本地模型可留空）'}</span><input type="password" autoComplete="new-password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} /></label> :
          <p className="leo-detail">官方服务需要单独授权的服务凭据和签名密钥；普通 API 密钥不能替代。</p>}
        <label className="form-field"><span>上下文容量</span><input type="number" min={1024} max={2000000} value={contextWindow} onChange={(event) => setContextWindow(Number(event.target.value))} /></label>
        <label className="leo-checkbox"><input type="checkbox" checked={stream} onChange={(event) => setStream(event.target.checked)} />流式回复</label>
        {error && <ErrorNotice message={error} />}
        <div className="form-actions">
          {model && <button type="button" className="button button-danger" disabled={busy} onClick={async () => {
            setBusy(true);
            try { onSaved(await browserClient.command('leo.removeModel', { id: model.id })); onOpenChange(false); }
            catch (failure) { setError(String(failure)); }
            finally { setBusy(false); }
          }}>移除模型</button>}
          <button type="button" className="button" disabled={busy} onClick={() => onOpenChange(false)}>取消</button>
          <button type="submit" className="button button-primary" disabled={busy}>{busy ? '保存中…' : '保存'}</button>
        </div>
      </form>
    </Modal>
  );
}
