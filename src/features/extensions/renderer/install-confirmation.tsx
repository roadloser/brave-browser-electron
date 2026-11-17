import type { ExtensionInstallProposal } from '../../../shared/contracts/extensions';
import { Modal } from '../../../renderer/components/modal';

type Props = { proposal: ExtensionInstallProposal; pending: boolean; error: string; onConfirm: (approve: boolean) => void };

export function InstallConfirmation({ proposal, pending, error, onConfirm }: Props) {
  return <Modal open title={`${proposal.replacesId ? '更新' : '安装'}“${proposal.name}”？`} className="extension-dialog"
    onOpenChange={open => { if (!open && !pending) onConfirm(false); }}>
    <p>{proposal.description}</p><p>版本 {proposal.version}</p>
    {proposal.previousVersion && <p>从 {proposal.previousVersion} 更新为 {proposal.version}。{proposal.wasEnabled === false ? '更新后保持停用。' : ''}</p>}
    {Boolean(proposal.addedPermissions?.length || proposal.addedHostPermissions?.length) && <section className="extension-warning">
      <h3>此更新新增访问范围</h3><ul>{[...(proposal.addedPermissions ?? []), ...(proposal.addedHostPermissions ?? [])].map(permission => <li key={permission}>{permission}</li>)}</ul>
      <p>只有确认后才加载新版本；拒绝会保留当前版本。</p>
    </section>}
    {proposal.permissions.length > 0 && <><h3>扩展权限</h3><ul>{proposal.permissions.map(permission => <li key={permission}>{permission}</li>)}</ul></>}
    {proposal.hostPermissions.length > 0 && <><h3>可访问的网站</h3><ul>{proposal.hostPermissions.map(permission => <li key={permission}>{permission === '<all_urls>' ? '所有网站' : permission}</li>)}</ul></>}
    {!proposal.permissions.length && !proposal.hostPermissions.length && <p>此扩展未声明其他访问权限。</p>}
    {(proposal.permissions.includes('webRequest') || proposal.permissions.includes('webRequestBlocking')) && <p className="extension-warning">此扩展声明了网络请求权限。当前 Shields 模式下，扩展网络拦截无法生效。</p>}
    {error && <p role="alert">{error}</p>}
    <footer><button disabled={pending} onClick={() => onConfirm(false)}>取消</button>
      <button className="button-primary" disabled={pending} onClick={() => onConfirm(true)}>{pending ? '正在处理…' : proposal.replacesId ? '确认更新' : '添加扩展'}</button></footer>
  </Modal>;
}
