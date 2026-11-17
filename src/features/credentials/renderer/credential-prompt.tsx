import type { CredentialCandidate } from '../../../shared/contracts/credentials';
import { browserClient } from '../../../renderer/client/browser-client';

export function CredentialPrompt({ candidate, onError }: { candidate: CredentialCandidate; onError?: (message: string) => void }) {
  const confirm = (save: boolean) => {
    void browserClient.command('credentials.confirm', { candidateId: candidate.id, save }).catch(error => onError?.(error instanceof Error ? error.message : '无法保存密码'));
  };
  return <section role="dialog" aria-label="保存密码"><h2>{candidate.existingId ? '更新密码？' : '保存密码？'}</h2>
    <p>{candidate.origin}</p><p>{candidate.username || '未填写用户名'}</p>
    <button onClick={() => confirm(true)}>{candidate.existingId ? '更新' : '保存'}</button>
    <button onClick={() => confirm(false)}>暂不保存</button>
  </section>;
}
