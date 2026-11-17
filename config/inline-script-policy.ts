import { createHash } from 'node:crypto';
import type { Plugin } from 'vite';

export function inlineScriptPolicy(): Plugin {
  return {
    name: 'trusted-ui-inline-script-policy',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        const hashes: string[] = [];
        for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
          if (/\bsrc\s*=/.test(match[1]) || !match[2].trim()) continue;
          hashes.push("'sha256-" + createHash('sha256').update(match[2]).digest('base64') + "'");
        }
        return hashes.length ? html.replace("script-src 'self'", "script-src 'self' " + hashes.join(' ')) : html;
      },
    },
  };
}
