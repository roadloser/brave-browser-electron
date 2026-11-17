import { webFrame } from 'electron';

webFrame.setIsolatedWorldInfo(1004, {
  securityOrigin: 'https://translate.brave.com',
  csp: "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; style-src 'self' 'unsafe-inline'; connect-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; img-src 'self' data:",
  name: 'Brave Translation',
});
