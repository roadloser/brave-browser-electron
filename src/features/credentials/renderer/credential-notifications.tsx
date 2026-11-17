import { useEffect, useState } from 'react';
import type { CredentialCandidate } from '../../../shared/contracts/credentials';
import { browserClient } from '../../../renderer/client/browser-client';
import { Modal } from '../../../renderer/components/modal';
import { CredentialPrompt } from './credential-prompt';

export function CredentialNotifications() {
  const [candidates, setCandidates] = useState<CredentialCandidate[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    void browserClient.command('credentials.list', {}).then(state => setCandidates(state.candidates)).catch(reason => setError(String(reason)));
    return browserClient.on('credentials.changed', state => setCandidates(state.candidates));
  }, []);
  const candidate = candidates[0];
  return <Modal open={!!candidate} title={candidate?.existingId ? '更新密码' : '保存密码'} onOpenChange={open => {
    if (!open && candidate) void browserClient.command('credentials.confirm', { candidateId: candidate.id, save: false }).then(state => setCandidates(state.candidates)).catch(reason => setError(String(reason)));
  }}>
    {candidate && <CredentialPrompt candidate={candidate} onError={setError}/>}
    {error && <p role="alert">{error}</p>}
  </Modal>;
}
