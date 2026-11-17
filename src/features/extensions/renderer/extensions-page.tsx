import { useState } from 'react';
import { Puzzle } from 'lucide-react';
import type { ExtensionInstallProposal, ExtensionRecord } from '../../../shared/contracts/extensions';
import { browserClient } from '../../../renderer/client/browser-client';
import { Modal } from '../../../renderer/components/modal';
import { InstallConfirmation } from './install-confirmation';
import { useExtensions } from './use-extensions';
import './extensions.css';

export function ExtensionsPage() {
  const extensions = useExtensions();
  const [proposal, setProposal] = useState<ExtensionInstallProposal | null>(null);
  const [storeId, setStoreId] = useState('');
  const [removing, setRemoving] = useState<ExtensionRecord | null>(null);
  const [status, setStatus] = useState('');
  const [clearData, setClearData] = useState(false);

  async function propose(operation: () => Promise<ExtensionInstallProposal | null>) {
    const next = await extensions.run(operation);
    if (next) setProposal(next);
  }
  async function confirm(approve: boolean) {
    if (!proposal) return;
    const result = await extensions.run(() => browserClient.command('extensions.confirmInstall', { proposalId: proposal.id, approve }));
    if (result) { extensions.accept(result); setProposal(null); setStatus(approve ? '扩展已安装并启用' : '安装已取消'); }
  }

  return <section className="extensions-page">
    <header><div><h1>扩展</h1><p>管理当前资料的扩展及其访问权限</p></div>
      <button disabled={extensions.pending} onClick={() => void propose(() => browserClient.command('extensions.chooseDirectory', {}))}>加载已解压的扩展</button></header>
    <div className="extension-capability">Shields 已优先处理网络请求，扩展网络拦截在当前运行时不可用。扩展仅在普通窗口运行，私密窗口不加载扩展。</div>
    <form className="extension-store" onSubmit={event => { event.preventDefault(); void propose(() => browserClient.command('extensions.proposeStoreInstall', { extensionId: storeId.trim() })); }}>
      <label>Chrome 商店扩展 ID<input value={storeId} onChange={event => setStoreId(event.target.value)} placeholder="32 位扩展 ID" pattern="[a-p]{32}" required /></label>
      <button disabled={extensions.pending}>{extensions.pending ? '正在准备…' : '获取扩展并查看权限'}</button>
      {extensions.pending && <button type="button" onClick={() => void browserClient.command('extensions.cancelPending', {}).then(() => {
        setProposal(null); setStatus('已取消准备；若传输已开始，完成后会自动清理临时文件。');
      }).catch(problem => setStatus(problem instanceof Error ? problem.message : '取消失败'))}>取消准备</button>}
      <button type="button" onClick={() => void extensions.run(() => browserClient.command('browser.openTab', { url: 'https://chromewebstore.google.com/', active: true }))}>打开 Chrome 商店</button>
    </form>
    {extensions.error && <div className="extension-error" role="alert">{extensions.error}<button onClick={() => void extensions.refresh()}>重新加载</button></div>}
    {status && <p className="extension-status" role="status">{status}</p>}
    {extensions.revision < 0 ? <p className="extension-empty">正在读取扩展…</p> : !extensions.extensions.length ? <p className="extension-empty">尚未安装扩展</p> :
      <div className="extension-grid">{extensions.extensions.map(extension => <article key={extension.id} className="extension-card">
        <div className="extension-heading"><Puzzle size={26} /><div><h2>{extension.name}</h2><small>版本 {extension.version}</small></div>
          <label className="extension-toggle"><input type="checkbox" checked={extension.enabled} disabled={extensions.pending}
            onChange={event => void extensions.run(async () => { const result = await browserClient.command('extensions.setEnabled', { id: extension.id, enabled: event.target.checked }); extensions.accept(result); })} />启用</label>
        </div>
        <p>{extension.description}</p><small className="extension-id">{extension.id}</small>
        <p className={extension.status === 'failed' ? 'extension-error' : 'extension-status'}>{extension.status === 'loaded' ? '已加载' : extension.status === 'disabled' ? '已停用' : extension.error ?? '加载失败'}</p>
        <details><summary>权限与站点访问</summary><ul>{[...extension.permissions, ...extension.hostPermissions].map(permission => <li key={permission}>{permission}</li>)}</ul></details>
        <footer><button disabled={extensions.pending || !extension.enabled} onClick={() => void extensions.run(async () => extensions.accept(await browserClient.command('extensions.reload', { id: extension.id })))}>重新加载</button>
          <button disabled={extensions.pending} onClick={() => void propose(() => browserClient.command('extensions.proposeUpdate', { id: extension.id }))}>检查更新</button>
          <button disabled={extensions.pending} onClick={() => { setClearData(false); setRemoving(extension); }}>移除</button></footer>
      </article>)}</div>}
    {proposal && <InstallConfirmation proposal={proposal} pending={extensions.pending} error={extensions.error} onConfirm={approve => void confirm(approve)} />}
    {removing && <Modal open title={`移除“${removing.name}”？`} className="extension-dialog" onOpenChange={open => { if (!open && !extensions.pending) setRemoving(null); }}>
      <p>将停止扩展并删除其安装文件。默认保留扩展存储数据，便于重新安装恢复。</p>
      <label><input type="checkbox" checked={clearData} onChange={event => setClearData(event.target.checked)} />同时清除扩展数据</label>
      {clearData && <p className="extension-warning">将通过扩展自身存储接口清除数据，再清理此扩展来源的网页存储。任一清理步骤失败会停止卸载并保留错误。</p>}
      {extensions.error && <p role="alert">{extensions.error}</p>}
      <footer><button disabled={extensions.pending} onClick={() => setRemoving(null)}>取消</button>
        <button disabled={extensions.pending} onClick={async () => {
          const result = await extensions.run(() => browserClient.command('extensions.remove', { id: removing.id, clearData }));
          if (result) { extensions.accept(result); setRemoving(null); }
        }}>移除</button></footer>
    </Modal>}
  </section>;
}
