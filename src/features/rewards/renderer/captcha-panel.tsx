import { useEffect, useRef, useState } from 'react';
import type { RewardsState } from '../../../shared/contracts/rewards';
import { browserClient } from '../../../renderer/client/browser-client';
import { Modal } from '../../../renderer/components/modal';
import './captcha.css';

export function CaptchaPanel({ state, pending, run }: { state: RewardsState; pending: boolean; run: (operation: () => Promise<RewardsState>) => Promise<void> }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const reporting = useRef(false);
  const perform = useRef(run);
  perform.current = run;
  const [result, setResult] = useState('');
  const challenge = state.captcha;
  useEffect(() => {
    reporting.current = false;
    const listener = (event: MessageEvent) => {
      if (!challenge || challenge.paused || reporting.current || event.origin !== 'null' || event.source !== frame.current?.contentWindow) return;
      if (!['captchaSuccess', 'captchaFailure', 'error'].includes(event.data)) return;
      reporting.current = true;
      const success = event.data === 'captchaSuccess';
      void perform.current(() => browserClient.command('rewards.captchaResult', { id: challenge.id, success })).finally(() => {
        reporting.current = false; setResult(success ? '挑战已完成，请恢复原确认token请求，以官方响应确认资格。' : '挑战未完成，请重试或稍后完成。');
      });
    };
    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }, [challenge?.id, challenge?.paused]);
  return <section className="rewards-configuration">
    <h2>广告账户验证</h2><p>当官方服务要求验证时，由你在官方挑战页面完成。</p>
    {result && <p role="status">{result}</p>}
    <button disabled={pending || !state.paymentId} onClick={() => void run(() => browserClient.command('rewards.openCaptcha', {}))}>查看待完成的验证</button>
    <Modal open={Boolean(challenge)} title="完成官方账户验证" onOpenChange={open => { if (!open) void run(() => browserClient.command('rewards.snoozeCaptcha', {})); }} className="rewards-captcha-modal">
      {challenge?.paused ? <p>已达到10次失败上限，广告验证已暂停。请联系Brave Rewards官方支持核实账户。</p> : challenge && <iframe key={challenge.id} ref={frame} title="Brave Rewards官方验证码" src={challenge.url} sandbox="allow-scripts" referrerPolicy="no-referrer" allow="camera 'none'; microphone 'none'; geolocation 'none'; payment 'none'; usb 'none'; fullscreen 'none'; clipboard-read 'none'; clipboard-write 'none'" />}
      <p>失败次数：{challenge?.failures ?? 0} / 10</p><button onClick={() => void run(() => browserClient.command('rewards.snoozeCaptcha', {}))}>稍后完成</button>
    </Modal>
  </section>;
}
