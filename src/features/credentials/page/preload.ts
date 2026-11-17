import { ipcRenderer } from 'electron';

const channel = 'brave:credentials:submitted';
let documentToken = '';
ipcRenderer.on('brave:credentials:document-token', (_event, token: unknown) => {
  if (typeof token === 'string') documentToken = token;
});
window.addEventListener('DOMContentLoaded', () => ipcRenderer.send('brave:credentials:document'), { once: true });
window.addEventListener('pageshow', () => ipcRenderer.send('brave:credentials:document'));
window.addEventListener('hashchange', () => ipcRenderer.send('brave:credentials:document'));
window.addEventListener('popstate', () => ipcRenderer.send('brave:credentials:document'));
window.addEventListener('submit', event => {
  if (!documentToken || !event.isTrusted || !(event.target instanceof HTMLFormElement)) return;
  const form = event.target;
  const password = [...form.querySelectorAll<HTMLInputElement>('input[type="password"]')].find(input => !input.disabled && input.value && input.autocomplete !== 'new-password')
    ?? form.querySelector<HTMLInputElement>('input[type="password"]');
  if (!password?.value) return;
  const inputs = [...form.querySelectorAll<HTMLInputElement>('input')].filter(input => !input.disabled && input.type !== 'password');
  const username = inputs.find(input => input.autocomplete === 'username') ?? inputs.find(input => input.type === 'email') ?? inputs.find(input => input.type === 'text');
  if (password.value.length > 16384 || (username?.value.length ?? 0) > 2048) return;
  ipcRenderer.send(channel, {
    origin: location.origin, url: location.href,
    username: username?.value ?? '', password: password.value, capturedAt: Date.now(),
    documentToken,
  });
}, true);
