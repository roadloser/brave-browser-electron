import { useEffect, useMemo, useState } from 'react';
import DOMPurify from 'dompurify';
import { Minus, Plus, RotateCw } from 'lucide-react';
import type { ReaderArticle } from '../../../shared/contracts/page-tools';
import { browserClient } from '../../../renderer/client/browser-client';
import { Modal } from '../../../renderer/components/modal';
import { ErrorNotice } from '../../../renderer/components/error-notice';
import { IconButton } from '../../../renderer/components/icon-button';
import './page-tools.css';

export function ReaderPanel({ tabId, open, onOpenChange }: {
  tabId: string; open: boolean; onOpenChange: (open: boolean) => void;
}) {
  const [article, setArticle] = useState<ReaderArticle | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [fontSize, setFontSize] = useState(18);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true); setError(''); setArticle(null);
    browserClient.command('pageTools.read', { tabId }).then((next) => {
      if (!cancelled) setArticle(next);
    }).catch((failure) => {
      if (!cancelled) setError(failure instanceof Error ? failure.message : String(failure));
    }).finally(() => { if (!cancelled) setLoading(false); });
    const dispose = browserClient.on('browser.state', (snapshot) => {
      const tab = snapshot.windows.flatMap((window) => window.tabs).find((entry) => entry.id === tabId);
      setArticle((current) => {
        if (current && (!tab || current.navigationId !== tab.navigationId)) {
          setError('页面已改变，请重新提取正文');
          return null;
        }
        return current;
      });
    });
    return () => { cancelled = true; dispose(); };
  }, [tabId, open, reload]);
  const safeHtml = useMemo(() => DOMPurify.sanitize(article?.content ?? '', {
    USE_PROFILES: { html: true }, FORBID_TAGS: ['style', 'form', 'input', 'button', 'iframe'],
    FORBID_ATTR: ['style', 'id', 'name'],
  }), [article?.content]);
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="阅读模式" className="reader-modal">
      <div className="reader-tools">
        <IconButton label="减小字号" disabled={fontSize <= 14} onClick={() => setFontSize((value) => value - 1)}><Minus size={16} /></IconButton>
        <span>{fontSize}</span>
        <IconButton label="增大字号" disabled={fontSize >= 28} onClick={() => setFontSize((value) => value + 1)}><Plus size={16} /></IconButton>
        <IconButton label="重新提取" onClick={() => setReload((value) => value + 1)}><RotateCw size={16} /></IconButton>
      </div>
      {loading && <p className="page-tool-status">正在提取正文…</p>}
      {error && <ErrorNotice message={error} onRetry={() => setReload((value) => value + 1)} />}
      {article && <article className="reader-article" style={{ fontSize }}
        onClick={(event) => {
          const anchor = (event.target as HTMLElement).closest('a');
          if (!anchor) return;
          event.preventDefault();
          const href = anchor.getAttribute('href');
          if (href && /^https?:\/\//i.test(href)) browserClient.command('browser.openTab', { url: href }).catch((failure) => setError(String(failure)));
        }}>
        <p className="reader-site">{article.siteName}</p><h1>{article.title}</h1>
        {article.byline && <p className="reader-byline">{article.byline}</p>}
        <div dangerouslySetInnerHTML={{ __html: safeHtml }} />
      </article>}
    </Modal>
  );
}
