import { webFrame } from 'electron';

webFrame.setIsolatedWorldInfo(1004, {
  securityOrigin: 'https://translate.brave.com',
  csp: "default-src 'none'; connect-src https://translate.brave.com; script-src 'unsafe-eval' https://translate.brave.com; style-src 'unsafe-inline' https://translate.brave.com; img-src data: https:",
  name: 'Brave Translation',
});
